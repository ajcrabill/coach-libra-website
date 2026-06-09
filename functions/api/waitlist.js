// Cloudflare Pages Function — POST /api/waitlist
// Persists waitlist signups to a KV namespace bound as WAITLIST.
//
// One-time setup in the Cloudflare dashboard:
//   1. Workers & Pages → KV → Create namespace "coachlibra-waitlist"
//   2. Your Pages project → Settings → Functions → KV namespace bindings
//      → Add binding: Variable name = WAITLIST, Namespace = coachlibra-waitlist
// View signups: KV namespace → browse keys (signup:<email>), or `wrangler kv:key list`.

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let email = "";
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      email = (body.email || "").toString();
    } else {
      const form = await request.formData().catch(() => null);
      email = form ? (form.get("email") || "").toString() : "";
    }
    email = email.trim().toLowerCase();

    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) return json({ ok: false, error: "invalid_email" }, 400);

    const record = {
      email,
      ts: new Date().toISOString(),
      ua: request.headers.get("user-agent") || "",
      ref: request.headers.get("referer") || "",
      ip: request.headers.get("cf-connecting-ip") || "",
      country: (request.cf && request.cf.country) || "",
    };

    if (env.WAITLIST) {
      // Keyed by email → re-signups update rather than duplicate.
      await env.WAITLIST.put(`signup:${email}`, JSON.stringify(record), {
        metadata: { ts: record.ts },
      });
      return json({ ok: true, stored: true });
    }

    // KV not bound yet — accept gracefully so no signup is lost to UX during setup.
    return json({ ok: true, stored: false });
  } catch (err) {
    return json({ ok: false, error: "server_error" }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
