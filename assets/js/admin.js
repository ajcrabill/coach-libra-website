// Coach Libra admin console — admin-only OTP sign-in + live digest + operations.
const API = "https://esbcloud.taild49f53.ts.net"; // Tailscale Funnel -> box:8088
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
let OV = { rows: [], methods: [], tally: {} };
let SORT = { key: "", dir: 1 };          // "" = server order (newest-approved first)
let SEARCH = "";

function ovValue(r, key) {
  if (key === "author") return (r.author || "").toLowerCase();
  if (key === "title") return (r.title || "").toLowerCase();
  if (key === "stage") return (r.stage + " " + r.status || "").toLowerCase();
  if (key === "court") return (r.court || "").toLowerCase();
  if (key === "voice") return (r.voice || "").toLowerCase();
  if (key === "since") return r.since_hours == null ? Infinity : r.since_hours;  // hours, numeric
  if (key === "cost") return parseFloat(String(r.cost || "0").replace(/[^0-9.]/g, "")) || 0;
  return (r.inputs && r.inputs[key]) || 0;     // input-method counts (numeric)
}
function th(key, label, center) {
  const arrow = SORT.key === key ? (SORT.dir > 0 ? " ▲" : " ▼") : "";
  return `<th class="${center ? "c " : ""}sortable" data-sort="${key}">${esc(label)}${arrow}</th>`;
}
async function loadOverview() {
  const d = await (await api("/admin/overview")).json();
  OV = { rows: d.rows || [], methods: d.input_methods || [], tally: d.tally || {},
         cost: d.cost || {} };
  renderOverview();
}
function renderOverview() {
  const { methods, tally: t } = OV;
  const cost = OV.cost || {};
  $("tally").innerHTML =
    `<span class="pill">${OV.rows.length} projects</span>` +
    `<span class="pill you">${t.YOU || 0} need you</span>` +
    `<span class="pill">${t.author || 0} on author</span>` +
    `<span class="pill">${t.system || 0} in progress</span>` +
    `<span class="pill">${t.done || 0} delivered</span>` +
    (cost.total ? `<span class="pill" title="${esc(cost.note || "")}">${esc(cost.total)} LLM` +
      (cost.shared ? ` · ${esc(cost.shared)} shared` : "") + `</span>` : "");
  const q = SEARCH.trim().toLowerCase();
  let rows = OV.rows.filter(r => !q ||
    [r.author, r.title, r.stage, r.status].some(v => (v || "").toLowerCase().includes(q)));
  if (SORT.key) {
    rows = rows.slice().sort((a, b) => {
      const va = ovValue(a, SORT.key), vb = ovValue(b, SORT.key);
      return (va < vb ? -1 : va > vb ? 1 : 0) * SORT.dir;
    });
  }
  const head = th("author", "Author") + th("title", "Book") + th("stage", "Stage") +
    th("voice", "Voice-print") + methods.map(mth => th(mth, SHORT[mth] || mth, true)).join("") +
    th("cost", "LLM $") + th("since", "Last from author") + th("court", "Court") +
    `<th class="c">Manage</th>`;
  const body = rows.map(r => {
    const you = r.court_key === "YOU";
    const cells = methods.map(mth => `<td class="c">${r.inputs && r.inputs[mth] ? r.inputs[mth] : "·"}</td>`).join("");
    // Flag a long silence from the author (≥3 days) so stalls jump out.
    const stale = r.since_hours != null && r.since_hours >= 72;
    const sinceCell = `<td class="c soft${stale ? " stale" : ""}" title="Time since the author last emailed or sent a submission">${esc(r.since_author || "—")}</td>`;
    const costCell = `<td class="c soft" title="LLM spend attributed to this book (drafting, editing, reply handling)">${esc(r.cost || "$0")}</td>`;
    const manage = `<td class="c soft">` +
      (r.manuscript_id
        ? `<button class="link danger" data-del-book="${r.manuscript_id}" data-title="${esc(r.title)}" title="Delete just this book">delete book</button> · `
        : "") +
      `<button class="link danger" data-purge="${esc(r.author_email)}" title="Permanently delete this author and all their data">purge author</button></td>`;
    return `<tr class="${you ? "you" : ""}">` +
      `<td>${esc(r.author)}</td><td>${esc(r.title)}</td>` +
      `<td>${esc(r.stage)} <span class="status">(${esc(r.status)})</span></td>` +
      `<td class="soft">${esc(r.voice)}</td>${cells}${costCell}${sinceCell}` +
      `<td>${you ? "<b>" + esc(r.court) + " ◀</b>" : esc(r.court)}</td>${manage}</tr>`;
  }).join("") || `<tr><td colspan="${8 + methods.length}" class="soft">${q ? "No matches." : "No active projects."}</td></tr>`;
  $("overview").innerHTML = `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  $("overview").querySelectorAll("th[data-sort]").forEach(h =>
    h.addEventListener("click", () => {
      const k = h.dataset.sort;
      if (SORT.key === k) SORT.dir *= -1; else { SORT.key = k; SORT.dir = 1; }
      renderOverview();
    }));
  $("overview").querySelectorAll("button[data-del-book]").forEach(b =>
    b.addEventListener("click", () => deleteBook(b.dataset.delBook, b.dataset.title, b)));
  $("overview").querySelectorAll("button[data-purge]").forEach(b =>
    b.addEventListener("click", () => purgeAuthor(b.dataset.purge, b)));

  // needs-your-attention list (always full set, not filtered)
  const needs = OV.rows.filter(r => r.court_key === "YOU");
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

async function loadAll() { await Promise.all([loadFunnel(), loadOverview(), loadWaitlist(), loadSentinel(), loadEscalations()]); }

// ---- Sentinel: escalations awaiting AJ's reply ----
async function loadEscalations() {
  let d;
  try { d = await (await api("/admin/escalations")).json(); }
  catch (e) { return; }
  const escs = d.escalations || [];
  const fmtAt = (iso) => { const t = new Date(iso); return isNaN(t) ? "" : t.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
  // A compact, clickable list of books that need your response. Click a row -> it slides
  // open with the email interface, and a conversation-aware draft is generated for you.
  $("sentinel-escalations").innerHTML = escs.length ? `<ul class="esc-list">` + escs.map(x =>
    `<li class="esc-item" data-id="${x.id}" data-drafted="0">` +
      `<button class="esc-row" data-toggle>` +
        `<span class="esc-who"><b>${esc(x.author)}</b> · ${esc(x.book)}</span>` +
        `<span class="soft esc-meta">${esc(x.reason)} · ${esc(fmtAt(x.at))} <span class="esc-caret">▸</span></span>` +
      `</button>` +
      `<div class="esc-body">` +
        `<div class="esc-detail soft">${esc(x.last_message || x.detail || "(no message captured)")}</div>` +
        `<textarea class="held-draft" rows="8" placeholder="Drafting your reply…"></textarea>` +
        `<div class="held-actions">` +
          `<input class="held-instr" placeholder="Adjust the draft — e.g. 'warmer, and ask for the manuscript file' — then Redraft" />` +
          `<button class="btn small" data-act="redraft">Redraft</button>` +
          `<button class="btn small" data-act="reply">Send reply</button>` +
          `<button class="link danger" data-act="dismiss">Dismiss</button>` +
        `</div>` +
      `</div></li>`).join("") + `</ul>`
    : `<p class="soft">Nothing awaiting your reply. 🎉</p>`;
  $("sentinel-escalations").querySelectorAll(".esc-item").forEach(item => {
    const id = item.dataset.id;
    const draft = () => item.querySelector(".held-draft");
    const instr = () => item.querySelector(".held-instr");
    const genDraft = async () => {
      draft().value = ""; draft().placeholder = "Drafting your reply…";
      try {
        const res = await api(`/admin/escalations/${id}/draft`, { method: "POST",
          body: JSON.stringify({ instructions: instr().value || "" }) });
        const r = await res.json().catch(() => ({}));
        if (res.ok && r.draft) draft().value = r.draft;
        else draft().placeholder = (r.detail || "Couldn't draft") + " — type your reply here.";
      } catch (e) { draft().placeholder = "Couldn't draft — type your reply here."; }
    };
    item.querySelector("[data-toggle]").addEventListener("click", async () => {
      const opening = !item.classList.contains("open");
      item.classList.toggle("open");
      if (opening && item.dataset.drafted === "0") { item.dataset.drafted = "1"; await genDraft(); }
    });
    item.querySelector('[data-act="redraft"]').addEventListener("click", async (ev) => {
      ev.stopPropagation(); ev.target.disabled = true; ev.target.textContent = "Redrafting…";
      await genDraft(); ev.target.disabled = false; ev.target.textContent = "Redraft";
    });
    item.querySelector('[data-act="reply"]').addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!draft().value.trim()) { draft().focus(); return; }
      if (!confirm("Send this reply to the author now?")) return;
      ev.target.disabled = true;
      try {
        const res = await api(`/admin/escalations/${id}/reply`, { method: "POST",
          body: JSON.stringify({ draft: draft().value }) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || "Couldn't send."); ev.target.disabled = false; return; }
        await Promise.all([loadEscalations(), loadOverview()]);
      } catch (e) { ev.target.disabled = false; }
    });
    item.querySelector('[data-act="dismiss"]').addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!confirm("Dismiss without replying (you handled it yourself)?")) return;
      try {
        const res = await api(`/admin/escalations/${id}/dismiss`, { method: "POST" });
        if (res.ok) await Promise.all([loadEscalations(), loadOverview()]); else alert("Couldn't dismiss.");
      } catch (e) { alert("Something went wrong."); }
    });
  });
}

// ---- Sentinel (watchdog): held emails + alerts ----
async function loadSentinel() {
  let d;
  try { d = await (await api("/admin/sentinel")).json(); }
  catch (e) { return; }
  const c = d.counts || {};
  $("sentinel-strip").innerHTML =
    (c.held_open ? `<span class="pill you">${c.held_open} held</span>` : `<span class="pill">0 held</span>`) +
    (c.critical ? `<span class="pill" style="border-color:var(--oxblood);color:var(--oxblood)">🔴 ${c.critical}</span>` : "") +
    (c.warn ? `<span class="pill">🟡 ${c.warn}</span>` : "") +
    (c.auto_fixed ? `<span class="pill">${c.auto_fixed} auto-fixed</span>` : "") +
    (c.good_catch || c.false_alarm ? `<span class="pill" title="alerts you've labeled">✓ ${c.good_catch || 0} good · ✗ ${c.false_alarm || 0} false</span>` : "") +
    (c.unlabeled ? `<span class="pill">${c.unlabeled} to review</span>` : "");
  const held = d.held || [];
  $("sentinel-held").innerHTML = held.length ? held.map(h =>
    `<div class="held" data-id="${h.id}">` +
    `<div class="held-head"><b>${esc(h.author)}</b> · ${esc(h.book)} <span class="soft">(${esc(h.kind)})</span></div>` +
    `<div class="soft held-why">Held because: ${esc((h.issues || []).join("; ") || "reviewer flagged it")}</div>` +
    `<div class="soft">Subject: ${esc(h.subject)}</div>` +
    `<textarea class="held-draft" rows="8">${esc(h.draft)}</textarea>` +
    `<div class="held-verdict soft"></div>` +
    `<div class="held-actions"><input class="held-instr" placeholder="Rewrite instructions — e.g. 'name the book and drop the second question'" />` +
    `<button class="btn small" data-act="rewrite">Rewrite</button>` +
    `<button class="btn small" data-act="send">Send to author</button>` +
    `<button class="link danger" data-act="dismiss">Dismiss</button></div></div>`).join("")
    : `<p class="soft">No held emails. 🎉</p>`;
  $("sentinel-held").querySelectorAll(".held").forEach(card => {
    const id = card.dataset.id;
    const draft = () => card.querySelector(".held-draft");
    const instr = () => card.querySelector(".held-instr");
    const verdict = card.querySelector(".held-verdict");
    card.querySelector('[data-act="rewrite"]').addEventListener("click", async (ev) => {
      const b = ev.target; if (!instr().value.trim()) { instr().focus(); return; }
      b.disabled = true; b.textContent = "Rewriting…";
      try {
        const res = await api(`/admin/sentinel/holds/${id}/rewrite`, { method: "POST",
          body: JSON.stringify({ instructions: instr().value, draft: draft().value }) });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) { verdict.textContent = r.detail || "Rewrite failed."; }
        else {
          draft().value = r.draft || draft().value;
          const v = r.verdict || {};
          verdict.textContent = v.block ? ("⚠ reviewer still flags: " + (v.issues || []).join("; "))
            : "✓ reviewer is satisfied — your call to send.";
        }
      } catch (e) { verdict.textContent = "Something went wrong."; }
      b.disabled = false; b.textContent = "Rewrite";
    });
    card.querySelector('[data-act="send"]').addEventListener("click", async (ev) => {
      if (!confirm("Send this email to the author now?")) return;
      ev.target.disabled = true;
      try {
        const res = await api(`/admin/sentinel/holds/${id}/send`, { method: "POST",
          body: JSON.stringify({ draft: draft().value }) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || "Couldn't send."); ev.target.disabled = false; return; }
        await loadSentinel();
      } catch (e) { ev.target.disabled = false; }
    });
    card.querySelector('[data-act="dismiss"]').addEventListener("click", async () => {
      if (!confirm("Dismiss this held email without sending?")) return;
      try {
        const res = await api(`/admin/sentinel/holds/${id}/dismiss`, { method: "POST" });
        if (res.ok) await loadSentinel(); else alert("Couldn't dismiss.");
      } catch (e) { alert("Something went wrong."); }
    });
  });
  const feed = d.feed || [];
  $("sentinel-feed").innerHTML = feed.length ? `<ul class="needs feed-list">` + feed.map(f => {
    const dot = f.severity === "critical" ? "🔴" : f.severity === "warn" ? "🟡" : "⚪";
    const fixed = f.auto_fixed ? ` <span class="soft">[auto-fixed]</span>` : "";
    const label = f.feedback === "good_catch" ? `<span class="fb-label good">✓ good catch</span>`
      : f.feedback === "false_alarm" ? `<span class="fb-label bad">✗ false alarm</span>`
      : `<span class="fb-actions"><button class="link" data-fb="good_catch" data-id="${f.id}">✓ good catch</button> · <button class="link" data-fb="false_alarm" data-id="${f.id}">✗ false alarm</button></span>`;
    return `<li class="feed-row"><span>${dot} ${esc(f.summary || f.category || "")}${fixed}</span>${label}</li>`;
  }).join("") + `</ul>` : `<p class="soft">No recent alerts.</p>`;
  $("sentinel-feed").querySelectorAll("button[data-fb]").forEach(b =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const res = await api(`/admin/sentinel/alerts/${b.dataset.id}/feedback`, { method: "POST",
          body: JSON.stringify({ verdict: b.dataset.fb }) });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) { alert(r.detail || "Couldn't record that."); b.disabled = false; return; }
        if (r.learned) alert("Proposed a rule from this catch:\n\n“" + r.learned + "”\n\nIt's waiting for your approval under “Learned rules” — edit it, approve it, or decline it. Libra won't apply it until you approve.");
        await Promise.all([loadSentinel(), loadRules()]);
      } catch (e) { b.disabled = false; }
    }));
  await loadRules();
}

async function ruleUpdate(id, payload) {
  const res = await api(`/admin/rules/${id}`, { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || "Couldn't update."); return false; }
  return true;
}
function ruleCard(r, pending) {
  const tag = `<span class="soft">[${esc(r.scope)}${r.scope_key ? '/' + esc(r.scope_key) : ''}${r.is_hard ? ' · hard' : ''}]</span>`;
  const actions = pending
    ? `<button class="btn small" data-act="approve">Approve</button> <button class="link danger" data-act="decline">Decline</button>`
    : `<button class="btn small" data-act="save">Save edit</button> <button class="link danger" data-act="decline">Remove</button>`;
  return `<li class="rule-item" data-id="${r.id}">` +
    `<textarea class="rule-text" rows="2">${esc(r.correction)}</textarea>` +
    `<div class="rule-foot">${tag}<span class="rule-actions">${actions}</span></div></li>`;
}
async function loadRules() {
  let d;
  try { d = await (await api("/admin/rules")).json(); } catch (e) { return; }
  const box = $("sentinel-rules"); if (!box) return;
  const pend = d.pending || [], active = d.active || [];
  let html = "";
  if (pend.length) html += `<div class="rule-group-h">Awaiting your approval (${pend.length})</div>` +
    `<ul class="rule-list">` + pend.map(r => ruleCard(r, true)).join("") + `</ul>`;
  html += `<div class="rule-group-h">Active rules (${active.length})</div>` +
    (active.length ? `<ul class="rule-list">` + active.map(r => ruleCard(r, false)).join("") + `</ul>`
      : `<p class="soft">None yet — approve a proposed rule and it appears here.</p>`);
  box.innerHTML = html;
  box.querySelectorAll(".rule-item").forEach(item => {
    const id = item.dataset.id;
    const text = () => item.querySelector(".rule-text").value;
    const act = (a) => item.querySelector(`[data-act="${a}"]`);
    if (act("approve")) act("approve").addEventListener("click", async () => {
      if (await ruleUpdate(id, { correction: text(), status: "active" })) await loadRules();
    });
    if (act("save")) act("save").addEventListener("click", async (ev) => {
      ev.target.textContent = "Saving…"; await ruleUpdate(id, { correction: text() });
      ev.target.textContent = "Saved"; setTimeout(() => { ev.target.textContent = "Save edit"; }, 1500);
    });
    if (act("decline")) act("decline").addEventListener("click", async () => {
      if (!confirm("Remove this rule? Libra will stop applying it.")) return;
      if (await ruleUpdate(id, { status: "declined" })) await loadRules();
    });
  });
}

async function loadFunnel() {
  const d = await (await api("/admin/funnel")).json();
  const a = d.activation || {};
  let html = `<div class="funnel-act"><span class="big">${a.rate || 0}%</span> activated ` +
    `<span class="soft">(${a.started || 0} of ${a.welcomed || 0} welcomed started · ${a.never_started || 0} never started)</span></div>`;
  const stages = d.stages || [];
  if (stages.length) {
    const max = Math.max.apply(null, stages.map(s => s.count).concat([1]));
    html += `<div class="funnel-stages">` + stages.map(s =>
      `<div class="fstage"><span class="flabel">${esc(s.label)}</span>` +
      `<span class="fbar"><span class="fbar-fill" style="width:${Math.round(100 * s.count / max)}%"></span></span>` +
      `<span class="fcount">${s.count}</span></div>`).join("") + `</div>`;
  }
  const idle = d.waiting_idle || {};
  const idleStr = Object.keys(idle).length ? Object.entries(idle).map(([k, v]) => `${esc(k)}: ${v}`).join(" · ") : "none waiting";
  html += `<p class="soft funnel-idle">Waiting on author — ${idleStr}` +
    (d.stalled_over_7d ? ` · <b style="color:var(--oxblood)">${d.stalled_over_7d} stalled &gt;7d</b>` : "") + `</p>`;
  $("funnel").innerHTML = html;
}

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

async function deleteBook(msId, title, btn) {
  if (!confirm(`Delete the book "${title || "Untitled"}"? This removes its chapters, profile, and samples for this book only — the author and their other books stay. This can't be undone.`)) return;
  btn.disabled = true; btn.textContent = "deleting…";
  try {
    const res = await api("/admin/books/" + Number(msId) + "/delete", { method: "POST", body: JSON.stringify({ confirm: true }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || "Couldn't delete that book."); btn.disabled = false; btn.textContent = "delete book"; return; }
    await loadAll();
  } catch (e) { btn.disabled = false; btn.textContent = "delete book"; }
}
async function purgeAuthor(email, btn) {
  const typed = prompt(`Permanently delete this author and ALL their data (every book, message, and sample). This cannot be undone.\n\nType the author's email to confirm:\n${email}`);
  if (typed == null) return;
  if (typed.trim().toLowerCase() !== (email || "").trim().toLowerCase()) { alert("That didn't match — nothing was deleted."); return; }
  // purge_author is keyed by author id; resolve it from the row's email via the overview.
  const row = OV.rows.find(r => (r.author_email || "").toLowerCase() === (email || "").toLowerCase());
  if (!row || row.author_id == null) { alert("Couldn't resolve that author."); return; }
  btn.disabled = true; btn.textContent = "purging…";
  try {
    const res = await api("/admin/authors/" + Number(row.author_id) + "/purge", { method: "POST", body: JSON.stringify({ confirm: typed.trim() }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || "Couldn't purge that author."); btn.disabled = false; btn.textContent = "purge author"; return; }
    await loadAll();
  } catch (e) { btn.disabled = false; btn.textContent = "purge author"; }
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
  $("ov-search").addEventListener("input", e => { SEARCH = e.target.value; renderOverview(); });
  $("ap-btn").addEventListener("click", approve);
  $("nb-btn").addEventListener("click", newBook);
  $("al-btn").addEventListener("click", linkAlias);
  if (token()) { loadAll().then(() => show("dashboard")).catch(() => show("signin")); }
  else show("signin");
});
