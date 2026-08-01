---
title: "Your 75% code coverage is testing nothing"
description: "Salesforce's coverage gate measures which lines ran, not whether anything was verified. Why the metric exists, what it structurally cannot see, and what real verification of an org actually takes."
date: 2026-07-11
draft: false
---

Each Salesforce dev is aware of one of the most important rules when it comes to deployment: you cannot deploy to production unless your Apex tests cover 75% of your code. It's a mandatory platform requirement. After a decade of integration work, several years of it against Salesforce, I have come to realize one thing: **that 75% requirement is the most successful piece of testing theater in enterprise software.** It guarantees that tests _exist_. It says nothing about whether anything is _verified_. I too have been guilty of "just hit the number" mentality: I would see how many more lines I need to cover and be done with it. On to the next task. No one ever questioned this mentality and the systems engineer on the team never really pushed back on it.

Honestly, this isn't a rant against testing. It's about how this 75% metric re-wired my brain.

## What the gate actually measures

Code coverage answers this question precisely: _which lines of code executed while the tests ran._ Not whether the results were checked or if the inputs resembled reality or if the code behavior was correct. Those metrics are tribal team knowledge and a test should be viewed as an invariant: kind of what TDD (test driven development) proposes. Write tests that would initially fail (since the logic to make the tests pass is absent) and then write your code to make the tests pass. The goal isn’t to satisfy a metric, it’s to prove that your code works as intended across all scenarios and edge cases.

The distinction sounds pedantic until you look at what it produces. This test generates coverage:

```apex
@isTest
static void testProcessAccounts() {
    Account a = new Account(Name = 'Test');
    insert a;
    AccountProcessor.process(new List<Account>{ a });
    // no asserts. every line of process() just "got covered."
}
```

Every line of `process()` ran. Coverage 100% earned while verification is at 0%. If `process()` silently corrupted every field it touched, this test passes. And before you object that nobody writes tests like that — open your org's test classes and count the methods whose only assert is `System.assert(true)`, or whose asserts check that the test's own setup data still exists. The pattern is everywhere. It helps us move faster and break things (literally).

Why does the gate exist at all, then? Because Salesforce is multi-tenant, and your Apex runs on shared infrastructure next to thousands of other orgs. The 75% rule is Salesforce protecting _its runtime_ — forcing enough execution-before-deploy that grossly broken code (infinite loops, instant exceptions) gets caught before it runs on shared hardware. That's a legitimate goal. It's just not _your_ goal. The metric was never designed to verify your business logic, and it doesn't.

## The Test.isRunningTest() problem

There's a second tell:

```apex
if (Test.isRunningTest()) {
    // skip the callout / fake the response / bypass the limit check
}
```

`Test.isRunningTest()` is one of the most-used methods in real orgs, and every use is bolted on after the original test is written because _my code behaves differently under test than in production._ The version of your integration that runs in tests skips the callout. The version that runs in production makes it. What does this mean? You have 75% coverage of a program that is not the program you ship.

And again it's a platform feature: Callouts aren't allowed in tests. Governor limits behave differently. External systems aren't there. So what do we do? We branch around the reality, cover the branch, and call it tested.

And there's another version to this that I have seen: the `bypass` flag.

```apex
if (Trigger_Settings__c.getInstance().Bypass_Triggers__c) return;
```

A checkbox, usually a hierarchy Custom Setting, that turns the org's trigger logic off. Every data migration flips it on, every bulk load, every "just this once" hotfix. It exists because nobody can predict what the triggers will do to 50,000 records, and nobody can test it beforehand, so the safest move is to switch the org's brain off and load the data raw. Think about what that means: we wrote automation so untrusted that our standard operating procedure includes a way to not run it.

## What coverage structurally cannot see

Even a well-asserted Apex unit test can only go so far: it can only test Apex. It runs inside Salesforce, testing code that lives inside Salesforce. But your integrations like the Lambda, the middleware, the nightly sync, all live outside, calling in. Apex tests can't see them, can't run them, can't verify them. And to be fair, it's not the unit test's job to go beyond Apex. But we ship in a multi-system world, and the outside code is what pages your oncall:

**Your integrations.** The Lambda, the middleware, the nightly sync, the code that _calls into_ Salesforce is not Apex and has no coverage requirement at all. The retry logic for [`UNABLE_TO_LOCK_ROW`](/blog/unable-to-lock-row), the backoff for `REQUEST_LIMIT_EXCEEDED`, the timeout handling: the Apex tests cover none of it, because the platform can't see it. The most failure-prone code in the whole system is the code with zero mandated tests.

**Cross-row behavior under real traffic.** Apex tests overwhelmingly insert one tidy record. Production inserts 200 through the Bulk API, where triggers fire once per batch and dedupe rules, sum-caps, and "one primary per parent" checks either handle the batch correctly or don't. A trigger can be 100% covered by single-record tests and still be wrong for every batch it will ever actually receive.

**Failure paths.** You cannot make a test produce a row lock. You cannot make it produce a real limit breach without consuming your org's actual quota. So the error-handling code is either skipped (`isRunningTest` again), or covered by a hand-mocked exception that tests your mock. The failure paths are simultaneously the most important lines in the org and the least tested.

**The order of execution.** Triggers, validation, workflow, rollups, more triggers! Unit tests exercise one entry point while incidents come from the composition.

## What real verification looks like

We should be asking the question: "What would it take to actually _verify_ an org's behavior?"

You'd want to make real API calls and check the real responses. You'd want triggers to actually fire, cascades to actually cascade, and to assert on the _final state_, not on line execution. You'd want to send 200 records, not one. You'd want to inject the failures: the lock, the limit, the timeout on purpose, and watch your retry logic run for the first time in its life. And you'd want all of it disposable: wiped between tests, parallel in CI, on every commit.

None of that is exotic. It's just integration testing which unsurprisingly is completely ordinary practice every other part of your stack gets. The reason it doesn't exist for Salesforce isn't that SF teams don't know better. It's that there was never an environment to do it _against_: real orgs are shared, slow, rate-limited, and can't fail on command ([the full argument](/blog/why-is-there-no-localstack-for-salesforce), if you missed it).

That missing environment is what I've been building. [Fidelic](https://fidelic.dev) runs your actual Apex triggers, answers the REST API like your org would, and produces the untestable failures as config flags. Your integration tests point at localhost and assert on behavior.

But the point of this post stands with or without my product: **coverage is a floor Salesforce built for its own protection, and somewhere along the way we let it become the ceiling of our testing ambition.** The orgs that page you the least aren't the ones with 95% coverage. They're the ones where someone tested the things the metric can't see.

## The audit

Five questions to run against your own org:

1. How many test methods have zero meaningful asserts?
2. How many `Test.isRunningTest()` branches ship code that has never executed under test?
3. Does anything test a 200-record batch through your busiest trigger?
4. Has your integration's retry logic ever actually run?
5. If your highest-coverage class silently returned wrong answers, which test would catch it?

These questions should make you sweat! Make you feel uncomfortable and make you dread your next oncall rotation. If you have any war stories to share, I am all ears!
