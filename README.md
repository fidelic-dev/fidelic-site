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
conformance, **14 MB** image, **~2 s** boot, and the partner quote. Do not invent
others.

## Deploy (Vercel)

1. Push this repo to GitHub (done — `fidelic-dev/fidelic-site`).
2. In Vercel: **Add New… → Project → Import** this repo.
3. Framework preset: **Astro** (auto-detected). Leave the defaults:
   - Build command: `astro build` (or `npm run build`)
   - Output directory: `dist`
   - Install command: `npm install`
4. Deploy. Vercel gives you a `*.vercel.app` URL.
5. **Domains → Add** `fidelic.dev` and `www.fidelic.dev`, then set DNS below.

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
