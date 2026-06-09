# coachlibra.com

Public marketing site for **Coach Libra** — a rockstar author coach who captures
your real voice and turns your expertise into a finished, publish-ready
manuscript, faster and more easily than you thought possible.

Static single-page site. No build step. Deployed via **Cloudflare Pages**.

## Files
- `index.html` — the landing page (self-contained: styles + JS inline)
- `404.html` — branded not-found page
- `favicon.svg` — quill/scales mark
- `_headers` — security headers (Cloudflare Pages)
- `robots.txt`

## Local preview
```bash
python3 -m http.server 4173
# open http://localhost:4173
```

## Deploy (Cloudflare Pages)
Connect this repo in the Cloudflare dashboard → Pages → Create → Connect to Git.
- Framework preset: **None**
- Build command: *(empty)*
- Build output directory: **/** (root)
Then add the custom domain `coachlibra.com` (and `www`) under the project's
Custom domains tab.

## Waitlist
The form POSTs to a Cloudflare Pages Function at `functions/api/waitlist.js`
(`/api/waitlist`), which stores each signup in KV. **One-time binding setup:**
1. Cloudflare → Workers & Pages → **KV** → Create namespace `coachlibra-waitlist`.
2. Your Pages project → **Settings → Functions → KV namespace bindings** → add
   binding: variable name **`WAITLIST`** → namespace `coachlibra-waitlist`.
3. Redeploy (any push, or "Retry deployment").

View signups: KV namespace → browse keys (`signup:<email>`), or
`wrangler kv:key list --binding WAITLIST`. Until the binding exists the endpoint
still returns success (so no signup bounces), but nothing is stored — set it up
before launch.

## Design
Literary-atelier aesthetic: ink on cream paper, oxblood + gold accents, Fraunces
display / Hanken Grotesk body, grain overlay, staggered load + scroll reveals.
Respects `prefers-reduced-motion`.
