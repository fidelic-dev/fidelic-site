---
title: "Your request did something. Here is the receipt."
description: "Salesforce returns an id and a success flag. Inside that request, triggers ran, fields changed, and work rolled back. Fidelic now hands back the whole story with the response: an execution trace with causality, live in the playground."
date: 2026-07-25
draft: false
---

# Your request did something. Here is the receipt.

Post a record to Salesforce and you get back an id and `"success": true`. That is the whole story the API tells you.

It is not the whole story. Before that record saved, a trigger ran. Maybe four triggers ran, each setting off the next. One of them wrote a field you never sent. If a validation failed, everything unwound, and the record you think you created never existed.

None of that is in the response. In a real org, the answer lives in debug logs: set up a trace flag, reproduce the request, download a log, and read line by line to find your four. Or hand the log to your favorite AI and let it tell you what happened. Either way, the log shows what ran while finding what trigger wrote the field is the part that takes the most time.

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

Line 2 is the point. `Batch_Status__c` arrived as "Open" and you never sent it. NPSP's trigger set it during before-insert, and the trace attributes the write to the trigger that made it. That is real Apex running with the side effect visible.

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

In the example above, three triggers ran before a validation rejected the update. The transaction unwound, and the response is a plain 400. Notice the trace keeps all three entries and marks each one rolled back instead of deleting them. Why is this important? Because when your update fails, the 4XX tells you it died and nothing else. You would want to know: which triggers fired before the rejection, in what order, and which one raised the error. That path is erased from the org in case of a rollback. The database keeps no record of work it threw away.

Let's look at an example: a validation error appears on a field your request never touched. Some trigger modified that field mid-transaction, then validation rejected the record. In a real org you reconstruct that chain from debug logs. In the trace, the rolled-back entries are the chain: trigger A ran, trigger B ran because of A, validation rejected inside B. The fix is one line, found in seconds.

When a transaction fails, the question you are debugging is almost never ONLY "why did it fail?" It is "how far did it get, and what caused it to fail?." If the trace dropped the rolled-back work, you would be back to guessing which trigger fired before the rejection. So the tilde entries stay: they show the work the database threw away, in order, with the entry that caused the rejection marked. The final state of the org and the path that led there are different pieces of information, and you need both.

Let's take a look at another example: staged faults. If you arm `UNABLE_TO_LOCK_ROW` and fire an update, you might expect the trace to show a transaction unwinding, since that is what a real row lock looks like from outside. It does not. The fault fires at the REST layer, before a transaction ever opens, so the trace shows exactly one entry and `committed=false`.

## What this is not

The trace exists only inside the emulator. Your production org will never produce one, so it does not help you dissect an incident that already happened in prod. The idea is that you run your integration tests against the emulator in CI, and the transaction that would have nulled a field in production fails a test instead, with the trace attached. The "archaeology" happens before the artifact ships, on a receipt instead of a log.

And the trace covers what the emulator actually ran. At boot, every trigger in your org gets classified: run, simulate, or refuse, each refusal named with its reason. A trigger the emulator refused never appears in a trace, because it never executed. The trace is a record of execution, not a prediction of what your org would do.

The cost for this: 0.09 milliseconds median per request with tracing on. We measured this against the NPSP corpus on the box that serves the playground. Off by default everywhere else.

## Try it

[play.fidelic.dev](https://play.fidelic.dev), no signup. Click any command, then open "what happened inside." The raw JSON is one toggle away if you want the document itself.

Fidelic boots your own org's metadata and Apex from a folder: [fidelic.dev](https://fidelic.dev).
