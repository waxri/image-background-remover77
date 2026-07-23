# ListingReady

ListingReady is a Next.js and Tailwind CSS app that turns ordinary product photos into marketplace-ready images for small ecommerce sellers. It uses a Cloudflare Pages Function to call Remove.bg, then performs alpha-bound detection, centering, background composition, compliance checks, and JPG/PNG/WebP export in the browser.

The homepage is intentionally focused on Amazon US main images. The existing background-removal SEO direction remains available at `/image-background-remover`.

## MVP features

- Amazon, Shopify, and custom output presets
- Pure-white, transparent, and brand-color backgrounds
- Automatic product centering and frame-coverage controls
- One-click Amazon clean, soft-shadow, and transparent export recipes
- Natural, crisp, and fine-detail edge refinement modes
- Optional contact and soft product shadows
- Standard/high export quality with source-resolution diagnostics
- Amazon-oriented compliance checklist
- Browser-side JPG, PNG, and WebP export
- Cloudflare Turnstile and optional KV rate limiting
- No persistent image storage
- Privacy, terms, and contact routes for public launch readiness

## Local development

```bash
npm install
npm run dev
```

The static frontend works in demo mode without credentials. Live background removal requires the Cloudflare Function and `REMOVE_BG_API_KEY`.

To exercise Pages Functions and Turnstile locally, add `REMOVE_BG_API_KEY` to
`.dev.vars`, then use:

```bash
npm run dev:pages
```

`dev:pages` uses Cloudflare's always-pass Turnstile test credentials on
`localhost`. Production continues to use the real site key and secret configured
in Cloudflare Pages.

## Cloudflare Pages

- Project: `image-background-remover77`
- Production URL: `https://image-background-remover77.pages.dev`
- Git source: `waxri/image-background-remover77`, production branch `main`
- Build command: `npm run build`
- Output directory: `out`
- Secrets: `REMOVE_BG_API_KEY`, `TURNSTILE_SECRET_KEY`
- Recommended secret when KV limiting is enabled: `RATE_LIMIT_SALT`
- Build variables: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SITE_URL`
- Optional build variable: `NEXT_PUBLIC_SUPPORT_EMAIL`
- Optional runtime variables: `MAX_UPLOAD_BYTES`, `RATE_LIMIT_PER_MINUTE`
- Optional KV binding: `RATE_LIMIT`

Images are streamed back to the browser and are not written to storage.
