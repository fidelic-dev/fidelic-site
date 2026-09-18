---
title: "Your request did something. Here is the receipt."
description: "Salesforce returns an id and a success flag. Inside that request, triggers ran, fields changed, and work rolled back. Fidelic now hands back the whole story with the response: an execution trace with causality, live in the playground."
date: 2026-07-25
draft: false
---

# Your request did something. Here is the receipt.

When you post a record to Salesforce, you get back an id and `"success": true`. That is the whole story the API tells you. And guess what, it is not the whole story which is the point of this post! Before that record saved, a trigger ran. Maybe four triggers ran, each setting off the next. One of them wrote a field you never sent. If a validation failed, everything unwound, and the record you think you created never existed.

None of that is in the response. In a real org, the answer lives in debug logs: set up a trace flag, reproduce the request, download a log, and read line by line through thousands of entries to find your four. Salesforce engineers do this every day. It works, and it costs an afternoon.

Fidelic is a Salesforce emulator, so it can do something a real org cannot: hand you the story with the response.

## The receipt

Every request against the emulator can carry a trace header. The emulator records what actually happened, in order, with causality, and gives it back as one document. The playground at [play.fidelic.dev](https://play.fidelic.dev) now renders it under every command. Click create, then click "what happened inside":

```
[0] REQUEST  POST /services/data/v62.0/sobjects/DataImportBatch__c
[1] TRANSACTION
  [2] FIELD_CHANGE  DataImportBatch__c.Batch_Status__c: null -> "Open"
[3] TRIGGER  TDTM_DataImportBatch  before insert -> entered-clean
[4] DML  insert DataImportBatch__c  (1 row)  a0400000000006zAAA  (caused by [3])
[5] TRIGGER  TDTM_DataImportBatch  after insert -> entered-clean  (caused by [4])
[6] COMMIT  (caused by [1])
RESPONSE  201 · committed
```

Line 2 is the point. `Batch_Status__c` arrived as "Open" and you never sent it. NPSP's trigger set it during before-insert, and the trace attributes the write to the trigger that made it. That is real Apex running, visible.

## Rollbacks tell the truth

The more interesting document is the one where things fail. An update that a validation rejects:

```
[0] REQUEST  PATCH /services/data/v62.0/sobjects/Account/001000000000001AAA
[1] TRANSACTION
~ [2] TRIGGER  AccountNestedTrigger  before update -> entered-clean  ROLLED BACK
~ [3] TRIGGER  AccountRoutedTrigger  before update -> entered-clean  (caused by [2])  ROLLED BACK
~ [4] TRIGGER  AccountValidationTrigger  before update -> entered-with-rejection  (caused by [3])  ROLLED BACK
[5] ROLLBACK  unwound to mark 0  (caused by [1])
RESPONSE  400 · committed=false
```

Three triggers ran. Then the transaction unwound, and every entry that ran is marked rolled back rather than deleted. The trace refuses to pretend the work never happened, and refuses to pretend it survived. A trigger that ran in a transaction that later rolled back still ran; the org just forgot its effects. Both facts are on the page.

One design rule sits under this: the trace never fabricates. When a fault fires at the REST layer before any transaction begins, the trace shows one entry and `committed=false`, not a theatrical rollback that never happened. If the document cannot be fetched, the panel says so instead of inventing a story.

## What this is not

Honesty section, because that is the house style.

This is not a debug log replacement for your production org. It only exists inside the emulator, and it deliberately does not look like a Salesforce debug log, because a convincing imitation would get pasted into tools and forums as if Salesforce produced it.

It traces what the emulator runs. The emulator classifies every trigger at boot, runs what it can run faithfully, and refuses the rest by name. The trace shows the part that ran.

The cost when tracing is on: 0.09 milliseconds median per request, measured against the NPSP corpus on the production box. Off by default outside the playground.

## Try it

[play.fidelic.dev](https://play.fidelic.dev), no signup. Click any command, then open "what happened inside." The raw JSON is one toggle away if you want the document itself.

Fidelic boots your own org's metadata and Apex from a folder: [fidelic.dev](https://fidelic.dev).
