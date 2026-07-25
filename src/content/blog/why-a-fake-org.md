---
title: "Why is there no LocalStack for Salesforce?"
description: "Every failure that actually breaks a Salesforce integration is one you cannot rehearse. A decade of integration work, four structural reasons, and what I ended up building about it."
date: 2026-06-27
draft: false
---

If you've ever been oncall for an integration that touches Salesforce, you've probably met a specific kind of page: a pipeline that has run clean for months suddenly starts failing writes, and the error is `UNABLE_TO_LOCK_ROW`. I met mine years ago, as a young dev, and my first thought was: why is anything locking rows? and why did it suddenly start failing? I checked our CD page to see for any recent deployments: None.

So I did what you did before AI was at everyone's fingertips: I googled it and landed on [a Trailblazer Community thread](https://trailhead.salesforce.com/trailblazer-community/feed/0D54V00007T4NoHSAV), which is Salesforce's answer to Stack Overflow.

Every answer was from someone whose setup looked nothing like ours, and every fix was specific to their collision. The error message itself wasn't helping either. This is the entire message:

```
    System.DmlException: Update failed. First exception on row 0 with id
    001B000001ABCdEIAX; first error: UNABLE_TO_LOCK_ROW, unable to obtain
    exclusive access to this record or 1 records: 001B000001ABCdEIAX
```

What happened and an ID. That's it. If you're familiar with Salesforce, the ID above is an Account ID (it starts with 001). And guess where the error happened? In a job that was updating Contacts. That one took a while: editing a child record locks its parent, so two processes touching different Contacts under the same Account can collide on the Account. Nothing in the message tells you that.

So, I asked myself: how do I resolve this? Retry? Shouldn't retry be already built in to the logic? And how do I test that the retry works? **Silence**. Every solution in every thread was: use smaller batches, sort by parent, serialize the jobs and not one of them could be verified before shipping. You deploy the fix and find out next month whether it worked.

But why is it so painful you ask? I'll tell you why: You cannot make a real org produce a row lock on purpose. A row lock is a collision: two processes touching the same record within the same ten-second window. You can't stage a collision on purpose because it depends on when a process happens to run or when a batch job happens to wake up or when a user happens to click save. Which is why it never shows up in a test, and always shows up in production. Tests are controlled, real world isn't.

I've built integration systems for about a decade, and for the last several years a lot of that work has touched Salesforce. The 2am lock error is not an anecdote; it's something we have dealt with numerous times. And after enough repetitions you stop blaming the code and start looking at the shape of the platform, because the platform has quietly made an entire category of testing impossible. And with each painful alarm, I realized a few platform specific truths:

## Four things you cannot do

**You cannot rehearse a row lock.** `UNABLE_TO_LOCK_ROW` happens when two processes contend for the same record or its parent. There is no button, no API, no sandbox setting that produces one deliberately.

**You cannot test API limit handling without attacking your own company.** Salesforce API limits are counted per org, per rolling 24 hours: an Enterprise org gets around [100,000 requests a day plus per-license increments](https://developer.salesforce.com/blogs/2024/11/api-limits-and-monitoring-your-api-usage), shared by every user, every integration, and every tool in the company. Fail to comply and the org returns `REQUEST_LIMIT_EXCEEDED` — and [blocks further API calls for everyone](https://blog.coupler.io/salesforce-api-limits/) until usage drops. So load-testing your limit-handling logic means consuming the quota your coworkers are using to do their jobs. Testing the failure _causes_ the failure, org-wide. BUT we have sandboxes don't we? Yes you're an astute observer my good friend:

**Sandboxes are stale, expensive, and carry the data you're trying to keep away from laptops.** Ever requested a Full Copy sandbox? Ask your SF admin and they will tell you that it costs roughly [30% of your net annual Salesforce spend](https://atonementlicensing.com/blog/salesforce-sandbox-pricing/) and can be refreshed [every 29 days](https://www.xappex.com/blog/salesforce-sandbox-refresh/). The refresh takes a day or more, [destroys everything in the sandbox](https://sfdcdevelopers.com/2026/01/01/salesforce-sandbox-recovery-guide/), and hands you a new Org ID that breaks any integration pointing at the old one. In between refreshes it drifts further from production every day. And the reason access to it is gated behind security tickets (and rounds of discussions with your security team) in the first place is that it contains copied production data. The cheaper sandbox tiers fix the cost problem by containing no data at all but they're still shared, still rate-limited, still real orgs you can't break on purpose. You can have a personal sandbox with no data but guess what, it is bare bones: without YOUR code/logic. You then have the fun task of deploying all your metadata and classes to this sandbox.

**CI needs a disposable org, and Salesforce orgs are the opposite of disposable.** The whole model of modern integration testing is: spin up a clean environment, run the suite, tear it down, on every commit. Orgs are shared, stateful, access-gated, and provisioned in minutes-to-days. You can't hand one to every CI job. You can't reset one between tests. You definitely can't run twelve of them in parallel on a pull request.

## The part everyone has quietly accepted

Here's the sentence that finally crystallized it for me, from an engineer at a team whose Salesforce deployment tooling is genuinely excellent: _"we have CD but no CI."_

Look at the Salesforce DevOps landscape and you'll notice that the deployment half has pipelines, diffing, rollbacks, release management. It is a thriving, sophisticated market. The verification half barely exists. Changes are reviewed, deployed to a sandbox, click-tested by humans, promoted, and then everyone watches the error logs. Why? Because CI requires an environment that can be created, trashed, and recreated in seconds, and no such environment has ever existed for this platform. Nobody roadmaps what they believe is impossible. Or they have accepted that the current processes (that involve spending dev hours on chasing platform specific issues) are not worth improving.

## Is this a Salesforce problem only?

Heard of AWS? They had this exact problem. Real AWS is shared, metered, rate-limited, and slow to provision. Testing against it is expensive and flaky in all the same ways. Then `LocalStack`showed up: fake AWS in a Docker container. Boot it, point your code at localhost, run your suite, throw it away. Eight million users later, that's simply how AWS development works (or majority of it). Nobody writes a blog post defending the concept anymore.

Salesforce is the biggest CRM on the planet. A mature org routinely carries more trigger logic than most companies have microservices. It entails real code, with real side effects, cascading off every insert. The integrations against it move revenue data, billing data, the stuff that gets executives paged. And the local-emulator slot in its ecosystem is just, wait for it, empty. I went looking for the tool several times over the years, assuming each time I'd simply missed it. It doesn't exist.

## So I built it

Fidelic is a Salesforce emulator in a 14MB Docker container. It boots in about two seconds. It loads your actual org's schema: your objects, your fields, your validation rules, pulled with your own credentials and it executes your actual Apex triggers, so a record created over the REST API comes back with the same computed fields and the same cascade of side effects your real org would produce. Your tests point at localhost and can't tell the difference.

And because it's an emulator, it does the things a real org never will: it produces a row lock (and other categories of errors I like to call pain in the you know where) on demand. It returns `REQUEST_LIMIT_EXCEEDED` on the request you choose. It adds five seconds of latency so you can finally watch your timeout logic actually time out. It resets to empty in milliseconds between tests, and you can run as many of them in parallel as your CI has cores. The failures simplified to a config flag.

So is it Salesforce outside of Salesforce? Yeah no! It's an emulator **that refuses what it cannot do faithfully.** Every trigger in your org gets classified at boot into executed for real, simulated with a label that says exactly what's approximated, or refused with a file, a line, and a reason. There is no fourth category where it guesses.

A test environment that lies confidently is worse than no test environment, and the entire value of a fake org is knowing precisely which kind of answer you're looking at. Everything it claims to emulate is backed by a conformance suite written from Salesforce's own documentation, test by test, with citations, verified against real orgs, and [public so you can run the scorecard yourself](https://github.com/fidelic-dev/fidelic-conformance) instead of trusting mine.

It's in early access now, onboarding a few teams at a time: [fidelic.dev](https://fidelic.dev) if any of this is your 2am story too.

## The question I actually want to ask you

The failure you know is lurking, that you've never once been able to produce in a test. A lock, a limit, a timeout, a governor ceiling, a half-committed transaction, a callout that fired twice. What's yours? I'm collecting them because they're the roadmap, and also because after a decade of pages I find them weirdly comforting to read. Tell me the failure you've never rehearsed.
