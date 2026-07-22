---
title: 'API & options reference'
description: 'Every endpoint, flag, environment variable, and fault the Fidelic emulator supports.'
order: 10
---

The emulator answers a subset of the Salesforce REST API at `http://localhost:<port>`
(default `:8080`). Point any client that speaks Salesforce REST at it — `curl`, your
integration code, a test suite — instead of a live org or sandbox.

Everything documented here is implemented today. Where behaviour intentionally differs
from a real org, it's called out.

- [Starting the server](#starting-the-server)
- [CLI flags](#cli-flags)
- [Environment variables](#environment-variables)
- [Authentication](#authentication)
- [Data API](#data-api-servicesdata) — records, query, describe
- [Fault injection](#fault-injection) — break it on command
- [Control endpoints](#control-endpoints-__emulator__)
- [Error envelopes](#error-envelopes)
- [Common workflows](#common-workflows)

---

## Starting the server

```bash
# minimal — built-in Account/Contact only, empty in-memory store
./sfemu --addr :8080

# with your org's metadata (objects) and Apex (triggers/classes)
SFEMU_APEX_SRC=mdapi ./sfemu --addr :8080 --metadata-dir mdapi/objects
```

On startup it logs its version, store, and how many triggers loaded / were
EXECUTE-classified:

```
sfemu 4734cdd listening on :8080 (store: sqlite ":memory:", client-secret: false, metadata: "mdapi/objects", hooks-file: "")
```

`./sfemu version` prints the build SHA on its own — quote it in any bug report so it's
traceable to an exact build.

> **Two builds ship in the bundle.** The default `sfemu` runs your triggers through
> approximated **hooks**. The `apexexec` build additionally runs EXECUTE-classified
> triggers through the real **interpreter** (`SFEMU_APEX_SRC` is only read there). Both
> answer the identical REST surface below — the execution path is invisible to callers,
> and faults fire the same way regardless.

---

## CLI flags

| flag | default | meaning |
| --- | --- | --- |
| `--addr` | `:8080` | listen address |
| `--metadata-dir` | `$SFEMU_METADATA_DIR` | directory of Salesforce `.object` XML — teaches the emulator your objects/fields |
| `--hooks-file` | `$SFEMU_HOOKS_FILE` | declarative hooks JSON loaded at startup |
| `--db` | `:memory:` | SQLite DSN — `:memory:` (wiped on restart) or a file path (persists) |
| `version` | — | subcommand: print build SHA and exit |

---

## Environment variables

| var | effect |
| --- | --- |
| `SFEMU_METADATA_DIR` | same as `--metadata-dir` |
| `SFEMU_HOOKS_FILE` | same as `--hooks-file` |
| `SFEMU_APEX_SRC` | *(apexexec build)* directory of Apex to classify + run for EXECUTE objects |
| `SFEMU_CLIENT_SECRET` | if set, the token endpoint requires this `client_secret`; unset ⇒ accept any credentials |
| `SFEMU_LICENSE_KEY` | license key checked at startup (stub) |
| `SFEMU_LATENCY_MS` | add N ms latency to every `/services/data/` response |
| `SFEMU_FAULT_LOCK_ON_UPDATE` | arm `UNABLE_TO_LOCK_ROW` on updates — see [Fault injection](#fault-injection) |
| `SFEMU_FAULT_LIMIT_AFTER` | after N calls, return `REQUEST_LIMIT_EXCEEDED` (`<0` = off, the default) |

Boolean flags accept any value Go's `strconv.ParseBool` understands — `1`, `t`, `true`,
`TRUE`. Anything unset or unrecognized is off.

---

## Authentication

Auth realism is deliberately light in v0 — enough to test a client's token flow, not to
enforce security.

### `POST /services/oauth2/token`

Only `grant_type=client_credentials` is supported.

```bash
curl -sX POST localhost:8080/services/oauth2/token \
  -d grant_type=client_credentials -d client_id=x -d client_secret=y
```

```json
{
  "access_token": "00Demu.00D...",
  "instance_url": "http://localhost:8080",
  "token_type": "Bearer",
  "issued_at": 1753166400000
}
```

- If `SFEMU_CLIENT_SECRET` is set, a mismatched `client_secret` → `400 invalid_client`.
- Any other `grant_type` → `400 unsupported_grant_type`.

### Bearer tokens on data requests

- **No `Authorization` header → allowed.** You can hit the data API without a token.
- If you *do* send `Authorization: Bearer <t>`, it must be a token this instance issued,
  otherwise `401 INVALID_SESSION_ID`. (So a token from a restarted instance is rejected.)

---

## Data API (`/services/data/`)

Path shape: `/services/data/{version}/{sobjects|query}/...`

`{version}` must be `v<major>.<minor>` with **major ≥ 20** (e.g. `v62.0`). Anything else
→ `404`. Examples below use `v62.0`.

### Create — `POST /sobjects/{object}`

```bash
curl -sX POST localhost:8080/services/data/v62.0/sobjects/Account \
  -H 'Content-Type: application/json' -d '{"Name":"Acme"}'
```

```json
{ "id": "001...", "success": true, "errors": [] }
```

Runs your before/after-insert logic (hooks or interpreter), required-field and
field-type validation, then persists.

### Retrieve — `GET /sobjects/{object}/{id}`

```bash
curl -s localhost:8080/services/data/v62.0/sobjects/Account/001...
# projection: only the fields you ask for (+ attributes)
curl -s 'localhost:8080/services/data/v62.0/sobjects/Account/001...?fields=Id,Name'
```

Unknown record → `404`. Unknown field in `?fields=` → `400 INVALID_FIELD`.

### Update — `PATCH /sobjects/{object}/{id}`

```bash
curl -sX PATCH localhost:8080/services/data/v62.0/sobjects/Account/001... \
  -H 'Content-Type: application/json' -d '{"Rating":"Hot"}'
```

`204 No Content` on success. Updating a missing id → `404 INVALID_CROSS_REFERENCE_KEY`
(distinct from GET's `NOT_FOUND` — a real-org quirk the emulator reproduces).

### Delete — `DELETE /sobjects/{object}/{id}`

`204` on success; missing id → `404 INVALID_CROSS_REFERENCE_KEY`.

### Upsert — `PATCH /sobjects/{object}/{externalIdField}/{value}`

Matches on the external-id field: updates if found (`200`), creates if not (`201`).
Unknown external-id field → `400`.

### Query — `GET /query?q=<SOQL>`

```bash
curl -s --get localhost:8080/services/data/v62.0/query \
  --data-urlencode "q=SELECT Id, Name FROM Account WHERE Name != null"
```

```json
{ "totalSize": 1, "done": true, "records": [ { "attributes": {}, "Id": "001...", "Name": "Acme" } ] }
```

Unknown sObject → `400 INVALID_TYPE`; unknown column → `400 INVALID_FIELD`; unparseable
SOQL → `400 MALFORMED_QUERY`.

### Describe

| request | returns |
| --- | --- |
| `GET /sobjects` | global describe — every known object (`name`, `label`, `keyPrefix`) |
| `GET /sobjects/{object}` | basic info + empty `recentItems` |
| `GET /sobjects/{object}/describe` | field list (`name`, `label`, `type`), `keyPrefix`, `queryable` |

> **Objects come from your metadata.** Only `Account` and `Contact` exist out of the
> box; every other object — standard or custom — is learned from `--metadata-dir`. A
> trigger targeting an object not in your metadata won't have anything to run against.

---

## Fault injection

The whole point: make a real org's un-reproducible failures happen on demand, so your
retry/error-handling paths finally have something to catch. Faults are **transport-level
— checked before any trigger runs** — so they fire identically whether an object is
EXECUTE-classified (interpreter) or hooks-approximated.

### Fault catalog

| errorCode | HTTP | fires on |
| --- | --- | --- |
| `UNABLE_TO_LOCK_ROW` | 400 | armed op (default: `update`) |
| `REQUEST_LIMIT_EXCEEDED` | 403 | any data call, after N |

### Declarative (env vars, re-applied on reset)

| var | behaviour |
| --- | --- |
| `SFEMU_FAULT_LOCK_ON_UPDATE=1` | next update returns `UNABLE_TO_LOCK_ROW` (armed once) |
| `SFEMU_FAULT_LIMIT_AFTER=N` | first N data calls succeed, then every call returns `REQUEST_LIMIT_EXCEEDED` |
| `SFEMU_LATENCY_MS=N` | N ms added to every data response |

```bash
SFEMU_FAULT_LOCK_ON_UPDATE=1 SFEMU_APEX_SRC=mdapi \
  ./sfemu --addr :8080 --metadata-dir mdapi/objects
# every PATCH -> [{"errorCode":"UNABLE_TO_LOCK_ROW", ...}]
```

### Runtime (arm/clear without restart)

`POST /__emulator__/faults` arms one fault; `DELETE` clears all. Body:

| field | type | default | meaning |
| --- | --- | --- | --- |
| `errorCode` | string | — | one of the catalog above |
| `trigger` | string | `"*"` | op to fire on: `insert` / `update` / `delete`, or `"*"` for any data call |
| `afterN` | int | `0` | let N calls through first |
| `once` | bool | `true` | fire once then disarm, vs. every matching call |
| `latencyMs` | int | — | set global latency (can be sent alone) |

```bash
# fire UNABLE_TO_LOCK_ROW on the next delete, once
curl -sX POST localhost:8080/__emulator__/faults \
  -d '{"errorCode":"UNABLE_TO_LOCK_ROW","trigger":"delete"}'

# fail every call after the 5th, until cleared
curl -sX POST localhost:8080/__emulator__/faults \
  -d '{"errorCode":"REQUEST_LIMIT_EXCEEDED","afterN":5,"once":false}'

# clear everything
curl -sX DELETE localhost:8080/__emulator__/faults
```

---

## Control endpoints (`/__emulator__/`)

Admin-style, fenced under a double-underscore prefix — zero collision with
`/services/*`. Not part of the Salesforce API; specific to the emulator.

| endpoint | method | effect |
| --- | --- | --- |
| `/__emulator__/reset` | POST | wipe all data + runtime faults/hooks, then re-apply the startup baseline (env-var faults, hooks file) |
| `/__emulator__/faults` | POST / DELETE | arm one fault (see above) / clear all |
| `/__emulator__/hooks` | POST / DELETE | register one declarative hook / clear all |
| `/__emulator__/license` | GET | report license-stub status |

`reset` returns to your *configured* baseline, not to empty — so a lock fault armed via
`SFEMU_FAULT_LOCK_ON_UPDATE` comes back after a reset. Use it between test cases for a
clean, reproducible starting point.

---

## Error envelopes

DML/query errors use the documented Salesforce array shape:

```json
[ { "message": "unable to obtain exclusive access to this record or 1 records",
    "errorCode": "UNABLE_TO_LOCK_ROW",
    "fields": [] } ]
```

OAuth errors use the token-endpoint shape:

```json
{ "error": "invalid_client", "error_description": "invalid client credentials" }
```

Common codes you'll see: `INVALID_CROSS_REFERENCE_KEY` (patch/delete missing id),
`INVALID_TYPE` (unknown sObject), `INVALID_FIELD` (unknown column),
`MALFORMED_QUERY` (bad SOQL), `REQUIRED_FIELD_MISSING`, `JSON_PARSER_ERROR`,
`INVALID_SESSION_ID` (unrecognized bearer).

---

## Common workflows

### Point real integration code at the emulator

1. Start with your metadata + triggers loaded.
2. In your client, swap the instance URL for `http://localhost:8080` (auth optional —
   the client-credentials flow above works if your client insists on a token).
3. Run your suite. Records persist within the run (`--db file.sqlite` to persist across
   restarts).

### Test a lock-failure retry path

```bash
# terminal 1 — server with locks armed
SFEMU_FAULT_LOCK_ON_UPDATE=1 SFEMU_APEX_SRC=mdapi \
  ./sfemu --addr :8080 --metadata-dir mdapi/objects

# terminal 2
ID=$(curl -sX POST localhost:8080/services/data/v62.0/sobjects/Account \
  -H 'Content-Type: application/json' -d '{"Name":"Locke"}' | jq -r .id)
curl -sX PATCH localhost:8080/services/data/v62.0/sobjects/Account/$ID \
  -H 'Content-Type: application/json' -d '{"Rating":"Hot"}'
# -> UNABLE_TO_LOCK_ROW ; your retry logic now has a real failure to handle
```

To let updates succeed again: `curl -X DELETE localhost:8080/__emulator__/faults`
(or restart without the env var).

### Simulate hitting an API limit mid-batch

```bash
curl -sX POST localhost:8080/__emulator__/faults \
  -d '{"errorCode":"REQUEST_LIMIT_EXCEEDED","afterN":10,"once":false}'
# 11th call onward -> 403 REQUEST_LIMIT_EXCEEDED, until you DELETE it
```

---

*Setup (converting an SFDX project, the coverage report, macOS quarantine) is covered by
the `QUICKSTART.md` shipped inside each emulator bundle.*
