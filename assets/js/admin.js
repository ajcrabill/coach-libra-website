// Coach Libra admin console — admin-only OTP sign-in + live digest + operations.
const API = "https://esbserver-m4.taild49f53.ts.net"; // Tailscale Funnel -> box:8088
const TKEY = "cl_admin_token";
const $ = (id) => document.getElementById(id);
const token = () => localStorage.getItem(TKEY);
const setToken = (t) => t ? localStorage.setItem(TKEY, t) : localStorage.removeItem(TKEY);
const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

async function api(path, opts = {}) {
  const h = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (token()) h["Authorization"] = "Bearer " + token();
  const res = await fetch(API + path, Object.assign({}, opts, { headers: h }));
  if (res.status === 401) { setToken(null); show("signin"); throw new Error("signin"); }
  return res;
}
function show(view) {
  $("admin-signin").hidden = view !== "signin";
  $("admin-dashboard").hidden = view !== "dashboard";
}
function note(id, msg, ok) { const e = $(id); if (e) { e.textContent = msg || ""; e.className = "note" + (ok ? " ok" : msg ? " err" : ""); } }

// ---- sign in ----
async function sendCode() {
  const email = $("aemail").value.trim();
  if (!email) { $("aemail").focus(); return; }
  $("abtn-send").disabled = true; $("abtn-send").textContent = "Sending…";
  try {
    await api("/admin/auth/request", { method: "POST", body: JSON.stringify({ email }) });
    $("aemail-echo").textContent = email; $("astep-email").hidden = true; $("astep-code").hidden = false;
    note("asignin-note", ""); $("acode").focus();
  } catch (e) { note("asignin-note", "Something went wrong — try again."); }
  $("abtn-send").disabled = false; $("abtn-send").textContent = "Send my code";
}
async function verify() {
  const email = $("aemail").value.trim(), code = $("acode").value.trim();
  if (!/^\d{6}$/.test(code)) { $("acode").focus(); return; }
  $("abtn-verify").disabled = true; $("abtn-verify").textContent = "Signing in…";
  try {
    const res = await api("/admin/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });
    if (!res.ok) { note("asignin-note", "That code didn't work. Check it and try again."); }
    else { const d = await res.json(); setToken(d.token); await loadAll(); show("dashboard"); }
  } catch (e) { note("asignin-note", "Something went wrong — try again."); }
  $("abtn-verify").disabled = false; $("abtn-verify").textContent = "Sign in";
}

// ---- overview ----
const SHORT = { "Voice memo": "Voice", "Doc": "Doc", "Link": "Link", "Email": "Email" };
async function loadOverview() {
  const d = await (await api("/admin/overview")).json();
  const methods = d.input_methods || [];
  const t = d.tally || {};
  $("tally").innerHTML =
    `<span class="pill">${(d.rows || []).length} projects</span>` +
    `<span class="pill you">${t.YOU || 0} need you</span>` +
    `<span class="pill">${t.author || 0} on author</span>` +
    `<span class="pill">${t.system || 0} in progress</span>` +
    `<span class="pill">${t.done || 0} delivered</span>`;
  const head =
    `<tr><th>Author</th><th>Book</th><th>Stage</th><th>Voice-print</th>` +
    methods.map(mth => `<th class="c">${esc(SHORT[mth] || mth)}</th>`).join("") +
    `<th>Court</th></tr>`;
  const body = (d.rows || []).map(r => {
    const you = r.court_key === "YOU";
    const cells = methods.map(mth => `<td class="c">${r.inputs && r.inputs[mth] ? r.inputs[mth] : "·"}</td>`).join("");
    return `<tr class="${you ? "you" : ""}">` +
      `<td>${esc(r.author)}</td><td>${esc(r.title)}</td>` +
      `<td>${esc(r.stage)} <span class="status">(${esc(r.status)})</span></td>` +
      `<td class="soft">${esc(r.voice)}</td>${cells}` +
      `<td>${you ? "<b>" + esc(r.court) + " ◀</b>" : esc(r.court)}</td></tr>`;
  }).join("") || `<tr><td colspan="${5 + methods.length}" class="soft">No active projects.</td></tr>`;
  $("overview").innerHTML = `<table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>`;

  // needs-your-attention list, with a deliver button where a book is ready to release
  const needs = (d.rows || []).filter(r => r.court_key === "YOU");
  $("needs").innerHTML = needs.length
    ? `<ul class="needs">` + needs.map(r =>
      `<li><span><b>${esc(r.author)}</b> — ${esc(r.title)} <span class="soft">(${esc(r.status)})</span></span>` +
      (r.deliverable
        ? `<button class="btn small" data-deliver="${r.manuscript_id}">Deliver to author</button>`
        : `<span class="soft">${esc(r.stage)}</span>`) + `</li>`).join("") + `</ul>`
    : `<p class="soft">Nothing needs you right now. 🎉</p>`;
  $("needs").querySelectorAll("button[data-deliver]").forEach(b =>
    b.addEventListener("click", () => doDeliver(b.dataset.deliver, b)));
}

async function loadAll() { await Promise.all([loadOverview(), loadWaitlist()]); }

async function loadWaitlist() {
  const d = await (await api("/admin/waitlist")).json();
  const items = d.items || [];
  $("waitlist").innerHTML = items.length
    ? `<ul class="needs">` + items.map(it =>
      `<li><span><b>${esc(it.name || it.email)}</b> <span class="soft">${esc(it.email)}</span>` +
      (it.note ? ` — ${esc(it.note)}` : "") + `</span>` +
      `<span class="wl-actions"><button class="btn small" data-wl-approve="${it.id}">Approve</button>` +
      `<button class="link" data-wl-dismiss="${it.id}">dismiss</button></span></li>`).join("") + `</ul>`
    : `<p class="soft">No one waiting right now.</p>`;
  $("waitlist").querySelectorAll("button[data-wl-approve]").forEach(b =>
    b.addEventListener("click", () => wlAction("/admin/waitlist/approve", b.dataset.wlApprove, b)));
  $("waitlist").querySelectorAll("button[data-wl-dismiss]").forEach(b =>
    b.addEventListener("click", () => wlAction("/admin/waitlist/dismiss", b.dataset.wlDismiss, b)));
}
async function wlAction(path, id, btn) {
  btn.disabled = true;
  try {
    const res = await api(path, { method: "POST", body: JSON.stringify({ entry_id: Number(id) }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || "Couldn't do that."); btn.disabled = false; return; }
    await loadAll();
  } catch (e) { btn.disabled = false; }
}

async function doDeliver(msId, btn) {
  if (!confirm("Deliver this finished manuscript to the author? This sends it to them.")) return;
  btn.disabled = true; btn.textContent = "Delivering…";
  try {
    const res = await api("/admin/deliver", { method: "POST", body: JSON.stringify({ manuscript_id: Number(msId) }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || "Couldn't deliver that."); btn.disabled = false; btn.textContent = "Deliver to author"; return; }
    await loadOverview();
  } catch (e) { btn.disabled = false; btn.textContent = "Deliver to author"; }
}

// ---- actions ----
async function post(path, payload, noteId, btnId, okMsg) {
  const btn = $(btnId); btn.disabled = true;
  try {
    const res = await api(path, { method: "POST", body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { note(noteId, d.detail || "Couldn't do that.", false); }
    else { note(noteId, okMsg, true); await loadOverview(); }
  } catch (e) { note(noteId, "Something went wrong — try again.", false); }
  btn.disabled = false;
}
function approve() {
  const email = $("ap-email").value.trim(), name = $("ap-name").value.trim();
  if (!email || !name) { note("ap-note", "Need an email and a full name.", false); return; }
  post("/admin/approve", { email, name }, "ap-note", "ap-btn", "Approved — welcome sent.").then(() => { $("ap-email").value = ""; $("ap-name").value = ""; });
}
function newBook() {
  const email = $("nb-email").value.trim(), n = $("nb-note").value.trim();
  if (!email) { note("nb-msg", "Need the author's email.", false); return; }
  post("/admin/newbook", { email, note: n }, "nb-msg", "nb-btn", "Next-book invite sent.").then(() => { $("nb-email").value = ""; $("nb-note").value = ""; });
}
function linkAlias() {
  const primary_email = $("al-primary").value.trim(), alias_email = $("al-alias").value.trim();
  if (!primary_email || !alias_email) { note("al-note", "Need both emails.", false); return; }
  post("/admin/alias", { primary_email, alias_email }, "al-note", "al-btn", "Alias linked.").then(() => { $("al-alias").value = ""; });
}

document.addEventListener("DOMContentLoaded", () => {
  $("abtn-send").addEventListener("click", sendCode);
  $("abtn-verify").addEventListener("click", verify);
  $("acode").addEventListener("keydown", e => { if (e.key === "Enter") verify(); });
  $("aemail").addEventListener("keydown", e => { if (e.key === "Enter") sendCode(); });
  $("abtn-back").addEventListener("click", () => { $("astep-code").hidden = true; $("astep-email").hidden = false; });
  $("abtn-signout").addEventListener("click", () => { setToken(null); show("signin"); });
  $("abtn-refresh").addEventListener("click", () => loadAll());
  $("ap-btn").addEventListener("click", approve);
  $("nb-btn").addEventListener("click", newBook);
  $("al-btn").addEventListener("click", linkAlias);
  if (token()) { loadAll().then(() => show("dashboard")).catch(() => show("signin")); }
  else show("signin");
});
