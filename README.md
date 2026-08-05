# fidelic-site

Marketing + blog site for Fidelic. Astro, static output, zero client-side JavaScript
(the only interactive element is the waitlist form, which posts to an external endpoint
with plain HTML).

## Stack

- [Astro](https://astro.build) — static site generator
- Markdown blog posts in `src/content/blog/`
- RSS at `/rss.xml`
- No web fonts, no client JS, no external requests at runtime

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
npm run preview  # serve the build locally
```

## Writing posts

Add a Markdown file to `src/content/blog/`. Frontmatter:

```yaml
---
title: "Post title"
description: "One-line summary (shown in the index and RSS)."
date: 2026-07-20
draft: false   # true = visible in dev, hidden in the production build and RSS
---
```

The filename becomes the URL slug (`my-post.md` → `/blog/my-post`).

## Before you edit copy

Every claim on the site must be provable. The load-bearing numbers today are: **68/68**
conformance, **17.6 MB** image, **~2 s** boot, and the partner quote. Do not invent
others.

## Deploying

Hosted on Vercel, built from `main`.

1. Push this repo to GitHub (done — `fidelic-dev/fidelic-site`).
2. In Vercel: **Add New… → Project → Import** this repo.
3. Framework preset: **Astro** (auto-detected). Leave the defaults:
   - Build command: `astro build` (or `npm run build`)
   - Output directory: `dist`
   - Install command: `npm install`
4. **Set the environment variables below** (see [Environment variables](#environment-variables))
   — the build fetches docs from a private repo and will fail without them.
5. Deploy. Vercel gives you a `*.vercel.app` URL.
6. **Domains → Add** `fidelic.dev` and `www.fidelic.dev`, then set DNS below.

### Environment variables

The build mirrors the emulator's docs into `/docs` at build time
(`scripts/sync-docs.mjs`, run automatically by `prebuild`). It reads the source from
`sfemu/docs/API.md`. Locally that resolves to the `../sfemu` sibling checkout with no
config. **On Vercel the `sfemu` repo isn't present and is private**, so the build fetches
the file from GitHub and needs a token.

Set these in **Vercel → Project → Settings → Environment Variables** (apply to
Production + Preview; Development doesn't need them if you have the sibling checkout):

| Variable | Required | Value |
| --- | --- | --- |
| `SFEMU_DOCS_TOKEN` | **Yes** | A GitHub **fine-grained PAT**, **read-only**, **Contents: Read** permission, **scoped to `fidelic-dev/sfemu` ONLY** (Repository access → Only select repositories → `sfemu`). Nothing else — no other repos, no write, no extra scopes. |
| `SFEMU_DOCS_REF` | No | Git ref to pull docs from. Defaults to `main`. Set it to pin a tag/branch. |

> Create the PAT at **GitHub → Settings → Developer settings → Fine-grained tokens**.
> Because it's scoped to one repo with only Contents:Read, a leak exposes nothing but
> already-shipped docs. Rotate it if in doubt; update the Vercel var and redeploy.

### If the docs sync fails

The doc mirror runs **before** Astro, in the `prebuild` step, so a failure aborts the
build early with a Node stack trace — not an Astro error. Two signatures to recognize:

- **No token at all** (var missing/misspelled):

  ```
  Error: cannot locate docs/API.md: no $SFEMU_REPO, no ../sfemu sibling, and no
  $SFEMU_DOCS_TOKEN for a GitHub fetch. Set one so the site can render the doc.
  ```

  → `SFEMU_DOCS_TOKEN` isn't set on the environment being built. Add it and redeploy.

- **Token present but rejected** (expired, wrong scope, or lost repo access):

  ```
  Error: fetch https://raw.githubusercontent.com/fidelic-dev/sfemu/main/docs/API.md -> 404 Not Found
  ```

  → GitHub returns `404` (not `403`) for a private file when the token can't read it.
  Check the PAT hasn't expired and still has **Contents: Read** on `fidelic-dev/sfemu`.

Either way the fix is the token, not the site code. The failure is deliberate — a
missing doc aborts the build rather than shipping a `/docs` page with a hole in it.

### DNS records for `fidelic.dev`

At your registrar / DNS provider:

| Type  | Name  | Value                    | Notes                          |
| ----- | ----- | ------------------------ | ------------------------------ |
| A     | `@`   | `76.76.21.21`            | Vercel apex IP                 |
| CNAME | `www` | `cname.vercel-dns.com.`  | www → Vercel                   |

Set the apex (`fidelic.dev`) as the primary domain and redirect `www` to it (Vercel does
this from the Domains tab). Vercel provisions HTTPS automatically once DNS resolves.

> If your DNS provider doesn't allow a CNAME/ALIAS at the apex, use the `A` record above.
> Vercel shows the exact expected values under **Project → Settings → Domains** — prefer
> those if they differ (Vercel occasionally rotates the apex IP).
