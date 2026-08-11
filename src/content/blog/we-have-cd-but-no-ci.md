---
title: "We have CD but no CI: the big Salesforce testing gap"
description: "The Salesforce DevOps market built world-class deployment pipelines while gaving up on verification. Where the gap came from, why nobody talks about it, and what it costs."
date: 2026-07-18
draft: false
---

A few weeks ago I had coffee with a friend who's a systems engineer. She and her team built the Salesforce continuous-deployment infrastructure at one of the big tech companies. An org with thousands of engineers, where you cannot merge a one-line change to a backend service without a pipeline running a battery of tests against it. I asked how teams there test their Salesforce integrations.

"There's no integration testing happening. Each team does their own stuff."

I was surprised to hear no embarrassment in her answer. Just a fact about how things are, from someone who built the deployment half with their own hands. If an organization with that much engineering discipline, with CI so ingrained in every pore of this organization, has no integration testing story for Salesforce, what do you think the situation looks like everywhere else?

I've been collecting versions of this conversation for months. The answer is: the same, everywhere. And the reason is structural I believe.

## The half that got built

Look at the Salesforce DevOps market and you'll notice something strange: it's a thriving, sophisticated, well-funded industry. However,it only exists on one side of the ledger.

The deployment side is genuinely excellent. Copado and Gearset are real companies with real products; a 20-developer team pays thousands a month for them, and gets value: version control integration, delta deployments, rollbacks, release orchestration, compliance trails. Salesforce itself ships DevOps Center for free. The tooling for _moving code into orgs_ is mature, competitive, and improving every quarter.

On the flip side, in a normal stack, "CI/CD" is one compound word because the two halves work in tandem: continuous integration _verifies_ every change (spin up a clean environment, run the tests, tear it down), and continuous deployment _ships_ the verified change. The verification half is the reason the deployment half is safe.

In Salesforce, the CD tooling markets itself as "CI/CD" while what runs in those pipelines is: metadata validation (does it deploy?), Apex unit tests (does [75% of the code execute](/blog/your-75-percent-code-coverage-is-testing-nothing)?), maybe static analysis. What doesn't run: anything that verifies the _behavior_ of the org — the trigger cascades, the integration calls, the failure paths. The pipeline confirms your code deployed. Nothing confirms it works.

## Why the gap exists

This isn't because Salesforce teams don't know what CI is. It's because CI has a hard prerequisite the platform never provided: **a disposable environment.**

Real CI needs an environment you can create in seconds, trash, and recreate. You need one per test run, in parallel, on every commit. Every part of a modern stack has one: databases run in containers, AWS has LocalStack, browsers have headless mode. [Salesforce orgs are the opposite of disposable](/blog/why-is-there-no-localstack-for-salesforce): shared, stateful, slow to provision, rate-limited, and incapable of producing their own failure modes on demand.

If you as Salesforce, they will answer with scratch orgs. If you read the [official CI docs](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_ci.htm), the architecture is: your pipeline _rents a real cloud org_ for each run. Minutes to provision. Daily creation quotas. Still a real org on shared infrastructure that can't produce a row lock, can't return a rate-limit error on demand, can't run twelve in parallel on a pull request without hitting allocation walls (to name a few!)

So the industry did what industries do with an impossible requirement: it stopped requiring it. Deployment tooling flourished because deployment was possible. Verification tooling never emerged because verification wasn't. And after enough years, the absence stopped feeling like a gap and morphed into a shrug and "the way things are".

## What the gap actually costs

The cost isn't abstract. It's a specific, recurring sequence that every integration team knows:

A change ships through a beautiful pipeline, fully "tested" by the coverage gate. It works in the sandbox, because the sandbox saw one tidy record from one careful admin. Then production traffic arrives: 200 records through the Bulk API, two systems colliding on the same parent Account, an API quota shared with the whole company. The failure modes that were [structurally impossible to rehearse](/blog/unable-to-lock-row): the lock, the limit, the retry that double-fires. These execute for the first time ever, in production, at whatever hour production chooses.

Then the postmortem, where someone asks "why didn't the tests catch this?" and the honest answer which nobody writes down, is that no test _could_ have. There was nowhere to run it.

The teams that feel this worst aren't the careless ones. They're the ones with the most engineering discipline — because they're the ones who notice the gap between how they treat every other system and how they're forced to treat this one. My coffee-chat friend builds pipelines for a living. The absence isn't a blind spot for engineers like that. It's a known, accepted defeat.

## It doesn't have to stay accepted

The prerequisite that was missing: the disposable, breakable, honest fake org is the thing I've been building. [Fidelic](https://fidelic.dev) boots a Salesforce emulator in a Docker container in about two seconds: your org's schema, your Apex triggers actually executing, the REST API answering the way your org would. It resets between tests in milliseconds, runs as many copies in parallel as your CI has cores, and produces on command the failures no real org will ever let you stage.

Which means the missing pipeline stage becomes buildable: pull request → boot emulator → run your _integration_ suite against localhost. These are real requests, real trigger cascades, injected row locks, injected rate limits that can be torn down post testing. Then merge! The CI half, finally, next to your existing CD half. It's in early access, and this exact pipeline stage is what the early teams are building.

But set my product aside; the observation stands on its own. The next time a vendor demo says "CI/CD for Salesforce," ask one question: _what runs against the org before promotion, and can it make the org fail on purpose?_ If the answer is metadata validation and unit tests, you're looking at CD disguised as CI costume.

We built half a discipline and called it the whole thing. The other half is overdue.
