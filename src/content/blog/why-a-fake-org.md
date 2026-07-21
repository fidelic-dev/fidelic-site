---
title: "Why a fake org, and not a better sandbox"
description: "A template post — headings, code, and terminal output — kept as a draft while the real posts get written."
date: 2026-07-20
draft: true
---

This post is a **draft**. It exists to show what the blog template renders — headings,
inline `code`, fenced code blocks, terminal output, lists, and a quote. The real posts
replace it.

## The problem with sandboxes

A sandbox is a real org. That's the whole trouble. You can't ask a real org to fail on
purpose, because "on purpose" still means for everyone on the tenant. So the failures
that actually break integrations in production — the row lock, the API limit, the
throttle — are the exact failures you can never rehearse.

Inline code looks like this: set `SFEMU_FAULT_LOCK_ON_UPDATE=true` and every update
starts returning a lock error.

## A code block

```bash
docker run -p 8080:8080 fidelic/emulator --apex-src ./force-app
export SFEMU_FAULT_LOCK_ON_UPDATE=true
```

Fenced blocks render in the same monospace treatment as the terminal, so a snippet you
can copy and a session you're reading look consistent.

## Terminal output

```
$ curl -sX PATCH $ORG/services/data/v62.0/sobjects/Account/001xx0000
{ "errorCode": "UNABLE_TO_LOCK_ROW",
  "message": "unable to obtain exclusive access to this record" }
```

## Lists and a quote

Three labels, and only three:

- **Executed** — it ran for real.
- **Simulated** — it was modeled honestly and said so.
- **Refused** — it stopped, with a file and a line.

> An emulator that quietly does the wrong thing is worse than no emulator. The whole
> value is knowing which of the three you're looking at.

That's the template. Delete this post when the first real one ships.
