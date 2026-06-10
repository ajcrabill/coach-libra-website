// Coach Libra author portal — email-OTP sign-in + dashboard. Talks to the box API.
const API = "https://esbserver-m4.taild49f53.ts.net"; // Tailscale Funnel -> box:8088 (invisible to users)
const TKEY = "cl_token";
const $ = (id) => document.getElementById(id);
const token = () => localStorage.getItem(TKEY);
const setToken = (t) => { t ? localStorage.setItem(TKEY, t) : localStorage.removeItem(TKEY); if (window.syncNavAuth) window.syncNavAuth(); };

async function api(path, opts = {}) {
  const h = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (token()) h["Authorization"] = "Bearer " + token();
  const res = await fetch(API + path, Object.assign({}, opts, { headers: h }));
  if (res.status === 401) { setToken(null); show("signin"); throw new Error("signin"); }
  return res;
}
function show(view) {
  $("view-signin").hidden = view !== "signin";
  $("view-dashboard").hidden = view !== "dashboard";
}
function note(id, msg, ok) { const e = $(id); e.textContent = msg || ""; e.className = "note" + (ok ? " ok" : msg ? " err" : ""); }

// ---- sign in ----
async function sendCode() {
  const email = $("email").value.trim();
  if (!email) { $("email").focus(); return; }
  $("btn-send").disabled = true; $("btn-send").textContent = "Sending…";
  try {
    await api("/auth/request", { method: "POST", body: JSON.stringify({ email }) });
    $("email-echo").textContent = email; $("step-email").hidden = true; $("step-code").hidden = false;
    note("signin-note", ""); $("code").focus();
  } catch (e) { note("signin-note", "Something went wrong — try again."); }
  $("btn-send").disabled = false; $("btn-send").textContent = "Send my code";
}
async function verify() {
  const email = $("email").value.trim(), code = $("code").value.trim();
  if (!/^\d{6}$/.test(code)) { $("code").focus(); return; }
  $("btn-verify").disabled = true; $("btn-verify").textContent = "Signing in…";
  try {
    const res = await api("/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });
    if (!res.ok) { note("signin-note", "That code didn't work. Check it and try again."); }
    else { const d = await res.json(); setToken(d.token); await loadDashboard(); show("dashboard"); }
  } catch (e) { note("signin-note", "Something went wrong — try again."); }
  $("btn-verify").disabled = false; $("btn-verify").textContent = "Sign in";
}

// ---- dashboard ----
async function loadDashboard() { await Promise.all([loadMe(), loadProgress(), loadDeliverables(), loadSettings()]); }
async function loadMe() {
  const d = await (await api("/me")).json();
  $("me-name").textContent = (d.name||"").split(" ")[0] || "there";
  $("profile-name").value = d.name || "";
  $("me-email").textContent = d.email || "";
  const al = (d.aliases || []);
  $("me-aliases").hidden = al.length === 0;
  $("me-aliases-val").textContent = al.join(", ");
}
function fmtWhen(iso) {
  if (!iso) return "";
  const dt = new Date(iso); if (isNaN(dt)) return "";
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " +
         dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function esc(s){ return (s||"").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function bookCard(b, showTitle) {
  const court = b.court === "you" ? "It's your turn" : b.court === "done" ? "Done!" : "We're on it";
  const stages = b.stages || [], cur = b.stage || 0;
  let steps = stages.length ? `<ol class="steps">` + stages.map((label, i) => {
    const n = i + 1, cls = n < cur ? "done" : n === cur ? "current" : "todo";
    return `<li class="${cls}"><span class="num">${n < cur ? "✓" : n}</span><span class="lbl">${esc(label)}</span></li>`;
  }).join("") + `</ol>` : "";
  let last = b.last_email ? `<p class="lastmail">📩 Last email from me: <b>${esc(b.last_email.subject)}</b>` +
    (b.last_email.at ? ` <span class="muted">· ${fmtWhen(b.last_email.at)}</span>` : "") + `</p>` : "";
  let title = showTitle ? `<div class="book-title">${esc(b.title || "Untitled book")}</div>` : "";
  return `<div class="bookcard">${title}${steps}` +
    `<div class="bigstep"><span class="dot ${b.court}"></span><div><div class="stepname">${esc(b.step_label)}</div>` +
    `<div class="muted">${court}</div></div></div>` +
    `<p class="next"><b>Next:</b> ${esc(b.next)}</p>${last}</div>`;
}
async function loadProgress() {
  const d = await (await api("/me/progress")).json();
  const books = d.books || [];
  let vp = d.voiceprint ? `<p class="muted vp-line">Voice captured: ${d.voiceprint.pieces} piece(s)${d.voiceprint.words ? ", ~" + Math.round(d.voiceprint.words / 1000) + "k words" : ""}.</p>` : "";
  if (!books.length) {
    $("progress-body").innerHTML = `<p class="next"><b>Next:</b> ${esc(d.next_overall || "We'll be in touch soon.")}</p>${vp}`;
    return;
  }
  const multi = books.length > 1;   // label each book only when there's more than one
  $("progress-body").innerHTML = books.map(b => bookCard(b, multi)).join("") + vp;
}
const DELIV_DESC = {
  profile: "Your book profile on one page — who it's for, the promise, your unique angle, what readers feel, and how it's organized. It unlocks once every part of your profile is captured.",
  bio: "A polished one-page About the Author, written in your voice from the facts you shared.",
  voiceprint: "Your Author Voice Print — a plain-language read on how you sound: your tone, how you make a point, your imagery, and the writers your style resembles. It's the voice your book is written from.",
  chapter1: "Your first chapter, formatted and ready to read — the first real taste of your book in your voice.",
  manuscript: "Your complete, finished book — every chapter, edited and assembled, ready to share.",
};
async function loadDeliverables() {
  const d = await (await api("/me/deliverables")).json();
  const books = d.books || [];
  if (!books.length) {
    $("deliverables-list").innerHTML = `<li><span class="muted">Your downloads will appear here as your book takes shape.</span></li>`;
    return;
  }
  const multi = books.length > 1;   // only label books when there's more than one
  $("deliverables-list").innerHTML = books.map(bk =>
    (multi ? `<li class="book-head">${esc(bk.title)}</li>` : "") +
    bk.items.map(it =>
      `<li class="deliv"><div class="deliv-row">` +
      `<button class="deliv-title" data-toggle>${esc(it.label)}</button>` +
      (it.available
        ? `<button class="btn small" data-book="${bk.id}" data-kind="${it.kind}">Download</button>`
        : `<span class="soon">not ready yet</span>`) +
      `</div><div class="deliv-desc"><div class="dd-inner"><p>${esc(DELIV_DESC[it.kind] || "")}</p></div></div></li>`).join("")
  ).join("");
  $("deliverables-list").querySelectorAll("button[data-kind]").forEach(b =>
    b.addEventListener("click", () => downloadKind(b.dataset.book, b.dataset.kind, b)));
  $("deliverables-list").querySelectorAll("button[data-toggle]").forEach(b =>
    b.addEventListener("click", () => b.closest(".deliv").classList.toggle("open")));
}
async function downloadKind(bookId, kind, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = "Preparing…";
  try {
    const res = await api("/me/deliverables/" + bookId + "/" + kind + "/download");
    if (!res.ok) throw new Error();
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = kind + ".pdf"; a.click();
    URL.revokeObjectURL(url);
  } catch (e) { alert("That file isn't ready yet."); }
  btn.disabled = false; btn.textContent = old;
}
async function loadSettings() {
  const d = await (await api("/me/settings")).json();
  const dials = [
    ["tone", "My tone", { warm: "Warm", balanced: "Balanced", direct: "Direct" },
     "How I sound when I write to you — warm and encouraging, an even balance, or direct and to the point."],
    ["batch", "Questions at a time", { fewer: "Fewer", normal: "Normal", more: "More" },
     "How much I ask at once. Fewer keeps each step light; more lets you cover ground faster when you're in a groove."],
    ["complexity", "Depth", { simple: "Simple", normal: "Normal", complex: "In-depth" },
     "How deep we go. Simple keeps things clear and plain; in-depth digs into nuance and detail."],
    ["cadence", "Pace", { as_completed: "As I reply", daily: "One a day" },
     "How often we move forward — as soon as you reply, or one calm step each day."],
    ["handholding", "How much help", { less: "Less", normal: "Normal", more: "More" },
     "How much I guide you along the way — a lighter touch, or more reassurance and direction at each step."],
  ];
  $("settings-body").innerHTML = dials.map(([key, label, opts, desc]) =>
    `<div class="dial" data-dial="${key}"><div class="dial-row">` +
    `<button class="dial-title" data-toggle="${key}">${esc(label)}</button>` +
    `<span class="seg" data-key="${key}">` +
    Object.entries(opts).map(([v, t]) =>
      `<button class="${d.settings[key]===v?'on':''}" data-key="${key}" data-val="${v}">${esc(t)}</button>`).join("") +
    `</span></div><div class="dial-desc"><div class="dd-inner"><p>${esc(desc)}</p></div></div></div>`).join("");
  $("settings-body").querySelectorAll("button[data-val]").forEach(b =>
    b.addEventListener("click", () => saveSetting(b.dataset.key, b.dataset.val)));
  $("settings-body").querySelectorAll("button[data-toggle]").forEach(b =>
    b.addEventListener("click", () => b.closest(".dial").classList.toggle("open")));
}
async function saveSetting(key, val) {
  await api("/me/settings", { method: "PUT", body: JSON.stringify({ settings: { [key]: val } }) });
  loadSettings();
}
async function saveProfile() {
  const name = $("profile-name").value.trim();
  $("btn-save-profile").disabled = true;
  await api("/me/profile", { method: "PUT", body: JSON.stringify({ name }) });
  await loadMe(); $("btn-save-profile").disabled = false; note("upload-note", "");
}
async function doUpload() {
  const f = $("file").files[0]; if (!f) return;
  $("btn-upload").disabled = true; note("upload-note", "Uploading…", true);
  try {
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch(API + "/me/uploads", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd });
    note("upload-note", res.ok ? "Got it — thank you! I'll fold it in." : "That didn't upload. Try a different file.", res.ok);
  } catch (e) { note("upload-note", "That didn't upload. Try again."); }
  $("btn-upload").disabled = false; $("file").value = "";
}

document.addEventListener("DOMContentLoaded", () => {
  $("btn-send").addEventListener("click", sendCode);
  $("btn-verify").addEventListener("click", verify);
  $("code").addEventListener("keydown", e => { if (e.key === "Enter") verify(); });
  $("email").addEventListener("keydown", e => { if (e.key === "Enter") sendCode(); });
  $("btn-back").addEventListener("click", () => { $("step-code").hidden = true; $("step-email").hidden = false; });
  $("btn-signout").addEventListener("click", () => { setToken(null); show("signin"); });
  $("btn-upload").addEventListener("click", doUpload);
  $("btn-save-profile").addEventListener("click", saveProfile);
  if (token()) { loadDashboard().then(() => show("dashboard")).catch(() => show("signin")); }
  else show("signin");
});
