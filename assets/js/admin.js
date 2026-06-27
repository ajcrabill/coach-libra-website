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
  if (key === "sent") return r.since_sent_hours == null ? Infinity : r.since_sent_hours;
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
    th("cost", "LLM $") + th("since", "Last from author") + th("sent", "Last sent") +
    th("court", "Court") + `<th class="c">Manage</th>`;
  const body = rows.map(r => {
    const you = r.court_key === "YOU";
    const cells = methods.map(mth => `<td class="c">${r.inputs && r.inputs[mth] ? r.inputs[mth] : "·"}</td>`).join("");
    // Flag a long silence from the author (≥3 days) so stalls jump out.
    const stale = r.since_hours != null && r.since_hours >= 72;
    const sinceCell = `<td class="c soft${stale ? " stale" : ""}" title="Time since the author last emailed or sent a submission">${esc(r.since_author || "—")}</td>`;
    const sentCell = `<td class="c soft" title="Time since we last emailed this author">${esc(r.since_sent || "—")}</td>`;
    const costCell = `<td class="c soft" title="LLM spend attributed to this book (drafting, editing, reply handling)">${esc(r.cost || "$0")}</td>`;
    // Nudge only makes sense when the author is the one we're waiting on.
    const nudgeBtn = (r.court_key === "author" && r.author_email)
      ? `<button class="link" data-nudge="${esc(r.author_email)}" data-ms="${r.manuscript_id || ""}" title="Draft a re-engagement email — it waits in Sentinel for you to review & send">nudge</button> · `
      : "";
    const manage = `<td class="c soft">` + nudgeBtn +
      (r.manuscript_id
        ? `<button class="link danger" data-del-book="${r.manuscript_id}" data-title="${esc(r.title)}" title="Delete just this book">delete book</button> · `
        : "") +
      `<button class="link danger" data-purge="${esc(r.author_email)}" title="Permanently delete this author and all their data">purge author</button></td>`;
    return `<tr class="${you ? "you" : ""}">` +
      `<td>${esc(r.author)}</td><td>${esc(r.title)}</td>` +
      `<td>${esc(r.stage)} <span class="status">(${esc(r.status)})</span></td>` +
      `<td class="soft">${esc(r.voice)}</td>${cells}${costCell}${sinceCell}${sentCell}` +
      `<td>${you ? "<b>" + esc(r.court) + " ◀</b>" : esc(r.court)}</td>${manage}</tr>`;
  }).join("") || `<tr><td colspan="${9 + methods.length}" class="soft">${q ? "No matches." : "No active projects."}</td></tr>`;
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
  $("overview").querySelectorAll("button[data-nudge]").forEach(b =>
    b.addEventListener("click", () => doNudge(b.dataset.nudge, b.dataset.ms, b)));

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

async function loadLearning() {
  let d;
  try { d = await (await api("/admin/learning")).json(); }
  catch (e) { return; }
  const on = !!d.review_mode;
  $("learning-strip").innerHTML = on
    ? `<span class="pill you">Review mode ON</span>`
    : `<span class="pill">Review mode off</span>`;
  $("learning-controls").innerHTML =
    `<button id="rm-toggle" class="btn small">${on ? "Turn review mode OFF" : "Turn review mode ON"}</button>`
    + ` <span class="soft">${on ? "Passing emails wait in Held above for you to review & send."
                                : "Emails auto-send as usual."}</span>`;
  $("rm-toggle").addEventListener("click", async () => {
    const b = $("rm-toggle"); b.disabled = true; b.textContent = "…";
    try {
      await api("/admin/review-mode", { method: "POST", body: JSON.stringify({ on: !on }) });
      await loadLearning();
      if (!on) await loadSentinel();          // newly-held emails appear above
    } catch (e) { await loadLearning(); }
  });
  const steps = d.steps || {}, keys = Object.keys(steps).sort();
  if (!keys.length) {
    $("learning-table").innerHTML = `<p class="soft">No approved sends yet — once you review & send a few, the edit trend per email type shows here.</p>`;
    return;
  }
  const pct = (v) => v == null ? "—" : Math.round(v * 100) + "%";
  const rows = keys.map(k => {
    const s = steps[k];
    const trend = s.converging === true ? `<span class="pill you">↓ converging</span>`
      : s.converging === false ? `<span class="pill">→ not yet</span>` : "—";
    return `<tr><td>${esc(k)}</td><td class="c">${s.count}</td><td class="c">${s.edited_pct}%</td>`
      + `<td class="c soft">${pct(s.earlier_edit)}</td><td class="c">${pct(s.recent_edit)}</td><td class="c">${trend}</td></tr>`;
  }).join("");
  $("learning-table").innerHTML =
    `<table class="grid"><thead><tr><th>Email type</th><th class="c">Sent</th><th class="c">You edited</th>`
    + `<th class="c">Edit · earlier</th><th class="c">Edit · recent</th><th class="c">Trend</th></tr></thead>`
    + `<tbody>${rows}</tbody></table>`;
}

// ---- Author preference defaults & per-option intensities ----
const PREF_LABELS = {
  batch: "Questions at a time", complexity: "Question complexity", cadence: "Pace",
  handholding: "Hand-holding", tone: "Tone", prompt_time: "Daily question time",
  language: "Language",
};
async function loadPrefConfig() {
  let d;
  try { d = await (await api("/admin/pref-config")).json(); }
  catch (e) { return; }
  const dims = d.dimensions || [], counts = d.batch_counts || {};
  const intRow = (label, control) =>
    `<div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0">` +
    `<label style="min-width:96px;padding-top:4px" class="soft">${esc(label)}</label>${control}</div>`;
  const blocks = dims.map(dim => {
    const label = PREF_LABELS[dim.key] || dim.key;
    const ctrl = dim.freeform
      ? `<input class="pc-def" data-dim="${dim.key}" type="text" value="${esc(dim.default || "")}" style="max-width:200px" />`
      : `<select class="pc-def" data-dim="${dim.key}">` +
        dim.options.map(o => `<option value="${o}"${o === dim.default ? " selected" : ""}>${esc(o)}</option>`).join("") +
        `</select>`;
    let extra = "";
    if (dim.tunable) {
      const custom = new Set(dim.customized || []);
      const rows = dim.options.map(o => {
        const cur = (dim.overrides || {})[o] || "";          // current text: override or built-in
        const mark = custom.has(o) ? ` <span class="soft" style="font-size:11px">· edited</span>` : "";
        return `<div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0">` +
          `<label style="min-width:140px;padding-top:4px" class="soft">${esc(o)}${mark}</label>` +
          `<textarea class="pc-dir" data-dim="${dim.key}" data-opt="${o}" rows="3" ` +
          `style="flex:1;min-width:300px" placeholder="(no built-in directive — leave blank to keep the default)">` +
          `${esc(cur)}</textarea></div>`;
      }).join("");
      extra = `<details style="margin:4px 0 0 4px"><summary class="muted">Tune intensities</summary>` +
        `<p class="soft" style="margin:6px 0 2px">Each box shows the current wording. Edit to re-tune; ` +
        `clear a box to revert it to Libra's built-in.</p>${rows}</details>`;
    } else if (dim.key === "batch") {
      const rows = ["fewer", "normal", "more", "many"].map(w => intRow(w,
        `<input class="pc-count" data-word="${w}" type="number" min="1" max="9" ` +
        `value="${counts[w] ?? ""}" style="width:64px" />`)).join("");
      extra = `<details style="margin:4px 0 0 4px"><summary class="muted">Questions per size</summary>${rows}</details>`;
    }
    return `<div style="margin:14px 0">` +
      `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">` +
      `<span style="font-weight:600;min-width:160px">${esc(label)}</span>` +
      `<span class="soft">default:</span> ${ctrl}</div>${extra}</div>`;
  }).join("");
  $("prefcfg").innerHTML = blocks;
  $("prefcfg-strip").innerHTML = `<span class="pill">${dims.length} dials</span>`;
  $("prefcfg-save").onclick = async () => {
    const btn = $("prefcfg-save"), note = $("prefcfg-note");
    btn.disabled = true; note.textContent = "Saving…";
    const defaults = {}, directives = {}, batch_counts = {};
    document.querySelectorAll("#prefcfg .pc-def").forEach(el => { defaults[el.dataset.dim] = el.value; });
    document.querySelectorAll("#prefcfg .pc-dir").forEach(el => {
      const v = el.value.trim(); if (!v) return;
      (directives[el.dataset.dim] = directives[el.dataset.dim] || {})[el.dataset.opt] = v;
    });
    document.querySelectorAll("#prefcfg .pc-count").forEach(el => {
      if (el.value) batch_counts[el.dataset.word] = Number(el.value);
    });
    try {
      const res = await api("/admin/pref-config", { method: "POST",
        body: JSON.stringify({ defaults, directives, batch_counts }) });
      if (!res.ok) throw new Error();
      note.textContent = "Saved — new authors get these defaults; intensity edits are live within a minute.";
      await loadPrefConfig();
    } catch (e) { note.textContent = "Couldn't save — try again."; }
    finally { btn.disabled = false; }
  };
}

async function loadAll() { await Promise.all([loadFunnel(), loadOverview(), loadWaitlist(), loadSentinel(), loadEscalations(), loadLearning(), loadPrefConfig(), loadCohorts(), loadCircle(), loadVouchers(), loadFinance(), loadStaff(), loadDeals(), loadAudit(), loadSecretsStatus(), loadCosts(), loadExemplars()]); }

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
    (c.actionable ? `<span class="pill you">${c.actionable} to review</span>` : "");
  const held = d.held || [];
  $("sentinel-held").innerHTML = held.length ? held.map(h =>
    `<div class="held" data-id="${h.id}">` +
    `<div class="held-head"><b>${esc(h.author)}</b> · ${esc(h.book)} <span class="soft">(${esc(h.kind)})</span></div>` +
    `<div class="soft held-why">Held because: ${esc((h.issues || []).join("; ") || "reviewer flagged it")}</div>` +
    `<div class="soft">Subject: ${esc(h.subject)}</div>` +
    `<textarea class="held-draft" rows="8">${esc(h.draft)}</textarea>` +
    ((h.can_attach || []).length ? `<div class="held-att soft">📎 Attach: ` +
      h.can_attach.map(c => `<label class="att-opt"><input type="checkbox" data-att="${c.key}"${c.default ? " checked" : ""}/> ${esc(c.label)}</label>`).join("") +
      `</div>` : "") +
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
          let msg = v.block ? ("⚠ reviewer still flags: " + (v.issues || []).join("; "))
            : "✓ reviewer is satisfied — your call to send.";
          if (r.attachments && r.attachments.length) msg += "  📎 will attach: " + r.attachments.join(", ");
          verdict.textContent = msg;
        }
      } catch (e) { verdict.textContent = "Something went wrong."; }
      b.disabled = false; b.textContent = "Rewrite";
    });
    card.querySelector('[data-act="send"]').addEventListener("click", async (ev) => {
      if (!confirm("Send this email to the author now?")) return;
      ev.target.disabled = true;
      try {
        const attach = [...card.querySelectorAll("input[data-att]:checked")].map(i => i.dataset.att);
        const res = await api(`/admin/sentinel/holds/${id}/send`, { method: "POST",
          body: JSON.stringify({ draft: draft().value, attach }) });
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
  const allFeed = d.feed || [];
  const open = allFeed.filter(f => !f.handled);
  const handled = allFeed.filter(f => f.handled);
  const renderFeed = (showHandled) => {
    const list = showHandled ? allFeed : open;
    const rows = list.length ? `<ul class="needs feed-list">` + list.map(f => {
      const dot = f.severity === "critical" ? "🔴" : f.severity === "warn" ? "🟡" : "⚪";
      const fixed = f.auto_fixed ? ` <span class="soft">[auto-fixed]</span>` : "";
      const label = f.feedback === "good_catch" ? `<span class="fb-label good">✓ good catch</span>`
        : f.feedback === "false_alarm" ? `<span class="fb-label bad">✗ false alarm</span>`
        : f.feedback === "ignored" ? `<span class="soft fb-label">– ignored</span>`
        : f.auto_fixed ? `<span class="soft fb-label">handled</span>`
        : `<span class="fb-actions"><button class="link" data-fb="good_catch" data-id="${f.id}">✓ good catch</button> · <button class="link" data-fb="false_alarm" data-id="${f.id}">✗ false alarm</button> · <button class="link" data-fb="ignored" data-id="${f.id}" title="Clear this alert without teaching Libra either way">– ignore</button></span>`;
      return `<li class="feed-row"><span>${dot} ${esc(f.summary || f.category || "")}${fixed}</span>${label}</li>`;
    }).join("") + `</ul>` : `<p class="soft">Nothing needs your review. 🎉</p>`;
    const toggle = handled.length
      ? `<button class="link" id="feed-toggle">${showHandled ? "hide handled" : `show ${handled.length} handled`}</button>` : "";
    $("sentinel-feed").innerHTML = rows + toggle;
    const t = $("feed-toggle");
    if (t) t.addEventListener("click", () => { renderFeed(!showHandled); wireFeedButtons(); });
  };
  function wireFeedButtons() {
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
  }
  renderFeed(false);
  wireFeedButtons();
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

async function doNudge(email, msId, btn) {
  if (!confirm("Create a re-engagement draft for this author? It'll wait in the Sentinel queue for you to review, edit, and send.")) return;
  btn.disabled = true; btn.textContent = "drafting…";
  try {
    const payload = { email };
    if (msId) payload.manuscript_id = Number(msId);
    const res = await api("/admin/nudge", { method: "POST", body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    btn.disabled = false; btn.textContent = "nudge";
    if (!res.ok) { alert(d.detail || "Couldn't create the draft."); return; }
    alert(d.message || "Nudge draft created — review and send it from the Sentinel queue.");
    await loadSentinel();   // refresh the holds so the new draft is there
  } catch (e) { btn.disabled = false; btn.textContent = "nudge"; }
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

// ---- #90 cohorts (institutional teams) ----
async function loadCohorts() {
  let d; try { d = await (await api("/admin/cohorts")).json(); } catch (e) { return; }
  const cs = d.cohorts || [];
  $("cohorts").innerHTML = cs.length
    ? `<ul class="needs">` + cs.map(c =>
        `<li><span><b>${esc(c.name)}</b> <span class="soft">${esc(c.buyer_email || "")}</span>` +
        ` — ${c.seats_redeemed}/${c.seats} seats used</span>` +
        `<span class="wl-actions"><button class="btn small" data-cohort="${c.cohort_id}">View</button></span></li>`).join("") + `</ul>`
    : `<p class="soft">No institutional teams yet.</p>`;
  $("cohorts").querySelectorAll("button[data-cohort]").forEach(b =>
    b.addEventListener("click", () => viewCohort(b.dataset.cohort)));
}
async function viewCohort(id) {
  let d; try { d = await (await api("/admin/cohorts/" + Number(id))).json(); } catch (e) { return; }
  const dash = d.dashboard || {}, codes = d.codes || [], members = dash.members || [];
  const rows = members.map(mb =>
    `<tr><td>#${mb.author_number}</td><td>${esc(mb.stage)}</td>` +
    `<td>${mb.last_activity_days == null ? "—" : mb.last_activity_days + "d ago"}</td>` +
    `<td>${mb.stalled ? "⚠︎ stalled" : "on track"}</td></tr>`).join("");
  const codeRows = codes.map(c =>
    `<tr><td>#${c.seat_number}</td><td><code>${esc(c.code)}</code></td><td>${c.redeemed ? "redeemed" : esc(c.status)}</td></tr>`).join("");
  $("cohort-detail").innerHTML =
    `<h3 class="sub">${esc(dash.name || "")} — ${dash.seats_redeemed}/${dash.seats_total} seats used, ${dash.stalled} stalled</h3>` +
    `<p class="muted">Buyer link (anonymized — safe to share with the institution): <code>${esc(d.buyer_link || "")}</code></p>` +
    `<div class="tablewrap"><table><thead><tr><th>Member</th><th>Stage</th><th>Last activity</th><th>Health</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    `<h4 class="sub">Seat codes</h4><div class="tablewrap"><table><thead><tr><th>Seat</th><th>Code</th><th>Status</th></tr></thead><tbody>${codeRows}</tbody></table></div>` +
    `<h4 class="sub">Team admins</h4>` +
    `<div class="form-row" style="margin-bottom:8px"><input id="ca-email" type="email" placeholder="add admin email" /><button class="btn small" id="ca-add">Add</button></div>` +
    `<div id="cohort-admins"></div>`;
  $("ca-add").addEventListener("click", () => addCohortAdmin(id));
  loadCohortAdmins(id);
}
async function loadCohortAdmins(id) {
  let res; try { res = await api("/admin/cohorts/" + Number(id) + "/admins"); } catch (e) { return; }
  if (!res.ok) { $("cohort-admins").innerHTML = ""; return; }
  const admins = (await res.json()).admins || [];
  $("cohort-admins").innerHTML = admins.length
    ? `<ul class="needs">` + admins.map(a => `<li><span>${esc(a.email)}</span> <button class="link" data-ca="${a.id}">remove</button></li>`).join("") + `</ul>`
    : `<p class="soft">No extra admins (the original buyer always has the link).</p>`;
  $("cohort-admins").querySelectorAll("button[data-ca]").forEach(b => b.addEventListener("click", async () => {
    try { await api("/admin/cohorts/" + Number(id) + "/admins/" + b.dataset.ca, { method: "DELETE" }); } catch (e) {}
    loadCohortAdmins(id);
  }));
}
async function addCohortAdmin(id) {
  const email = $("ca-email").value.trim();
  if (!email) { $("ca-email").focus(); return; }
  try { await api("/admin/cohorts/" + Number(id) + "/admins", { method: "POST", body: JSON.stringify({ email }) }); $("ca-email").value = ""; } catch (e) {}
  loadCohortAdmins(id);
}

// ---- Circle in-window roster ----
async function loadCircle() {
  let d; try { d = await (await api("/admin/circle")).json(); } catch (e) { return; }
  const n = d.in_window || 0;
  $("circle").innerHTML =
    `<p><b>${n}</b> author${n === 1 ? "" : "s"} in window (${d.window_days || 90}-day support).</p>` +
    ((d.members || []).length
      ? `<div class="tablewrap"><table><thead><tr><th>Member</th><th>Days in</th><th>Days left</th></tr></thead><tbody>` +
        d.members.map(mb => `<tr><td>#${mb.author_number}</td><td>${mb.days_in_window}</td><td>${mb.days_remaining}</td></tr>`).join("") +
        `</tbody></table></div>` : "");
}

// ---- vouchers & codes ----
async function loadVouchers() {
  let d; try { d = await (await api("/admin/billing/vouchers")).json(); } catch (e) { return; }
  const vs = d.vouchers || [];
  $("vouchers").innerHTML = vs.length
    ? `<table><thead><tr><th>Code</th><th>Type</th><th>Status</th><th>Left</th><th>Used</th><th>Created by</th><th></th></tr></thead><tbody>` +
      vs.map(v =>
        `<tr><td><code>${esc(v.code)}</code></td><td>${esc(v.vtype)}</td><td>${esc(v.status)}</td>` +
        `<td>${v.uses_remaining == null ? "∞" : v.uses_remaining}</td><td>${v.redemptions}</td>` +
        `<td class="soft">${esc(v.created_by || "system")}</td>` +
        `<td>${v.status === "active" ? `<button class="link" data-void="${v.id}">void</button>` : ""}</td></tr>`).join("") +
      `</tbody></table>`
    : `<p class="soft">No vouchers yet.</p>`;
  $("vouchers").querySelectorAll("button[data-void]").forEach(b =>
    b.addEventListener("click", () => voidVoucher(b.dataset.void)));
}
async function mintVoucher() {
  const vtype = $("vm-type").value, author = $("vm-author").value.trim();
  const body = { vtype }; if (author) body.issued_to_author_id = Number(author);
  try {
    const d = await (await api("/admin/billing/vouchers", { method: "POST", body: JSON.stringify(body) })).json();
    if (d.code) { note("voucher-note", "Minted " + d.code, true); $("vm-author").value = ""; await loadVouchers(); }
    else note("voucher-note", d.error || "Couldn't mint that.", false);
  } catch (e) { note("voucher-note", "Couldn't mint that.", false); }
}
async function voidVoucher(id) {
  if (!confirm("Void this voucher? It can no longer be redeemed.")) return;
  try { await api("/admin/billing/vouchers/" + Number(id) + "/void", { method: "POST" }); await loadVouchers(); } catch (e) {}
}

// ---- manuscript timeline (#86) ----
async function loadTimeline() {
  const id = $("tl-id").value.trim(); if (!id) { $("tl-id").focus(); return; }
  let d; try { d = await (await api("/admin/manuscripts/" + Number(id) + "/timeline")).json(); }
  catch (e) { $("timeline").innerHTML = `<p class="note err">Couldn't load that timeline.</p>`; return; }
  if (d.error) { $("timeline").innerHTML = `<p class="note err">Not found.</p>`; return; }
  const ev = d.events || [];
  $("timeline").innerHTML =
    `<p><b>${esc(d.title || "Untitled")}</b> — phase ${esc(String(d.current_phase))}, ${esc(d.phase_status || "")} ` +
    `<span class="soft">(${esc(d.whose_turn || "")}'s turn)</span></p>` +
    (d.blocked_reason ? `<p class="note err">Blocked: ${esc(d.blocked_reason)}</p>` : "") +
    (ev.length
      ? `<div class="tablewrap"><table><thead><tr><th>When</th><th>Event</th></tr></thead><tbody>` +
        ev.map(e => `<tr><td class="soft">${esc((e.at || "").replace("T", " ").slice(0, 16))}</td><td>${esc(e.kind || "")}</td></tr>`).join("") +
        `</tbody></table></div>`
      : `<p class="soft">No events recorded.</p>`);
}

// ---- finance ----
async function loadFinance() {
  let res; try { res = await api("/admin/finance"); } catch (e) { return; }
  if (!res.ok) { $("finance").innerHTML = `<p class="soft">No finance access.</p>`; return; }
  const d = await res.json(), s = d.summary || {};
  const usd = c => "$" + Math.round((c || 0) / 100).toLocaleString();
  $("finance-strip").innerHTML = `<p>${s.orders || 0} orders · billed ${usd(s.total_billed_cents)} · collected ${usd(s.total_collected_cents)}</p>`;
  const orders = d.orders || [];
  $("finance").innerHTML = orders.length
    ? `<table><thead><tr><th>Buyer</th><th>Product</th><th>Amount</th><th>Paid</th><th>Status</th><th>When</th></tr></thead><tbody>` +
      orders.map(o => `<tr><td>${esc(o.buyer_email || "—")}</td><td>${esc(o.product || "")}</td><td>${usd(o.amount_cents)}</td><td>${usd(o.amount_paid_cents)}</td><td>${esc(o.payment_status)}</td><td class="soft">${esc((o.at || "").slice(0, 10))}</td></tr>`).join("") +
      `</tbody></table>`
    : `<p class="soft">No orders yet.</p>`;
}

// ---- staff & roles (owner-only) ----
async function loadStaff() {
  let res; try { res = await api("/admin/staff"); } catch (e) { return; }
  if (!res.ok) { $("staff").innerHTML = `<p class="soft">Owner-only — you don't have access to staff management.</p>`; return; }
  const d = await res.json(), staff = d.staff || [], roles = d.assignable_roles || [], rolesInfo = d.roles_info || [];
  $("staff").innerHTML = (staff.length
    ? `<table><thead><tr><th>Email</th><th>Roles</th><th>Status</th><th></th></tr></thead><tbody>` +
      staff.map(st => `<tr><td>${esc(st.email)}</td>` +
        `<td><input class="st-roles-edit" data-id="${st.id}" value="${esc((st.roles || []).join(','))}" style="width:180px" /></td>` +
        `<td>${esc(st.status)}</td>` +
        `<td><button class="link" data-save-roles="${st.id}">save roles</button> · ` +
        (st.status === "active" ? `<button class="link" data-deact="${st.id}">deactivate</button>` : `<button class="link" data-act="${st.id}">activate</button>`) +
        `</td></tr>`).join("") + `</tbody></table>`
    : `<p class="soft">No staff yet.</p>`) +
    (rolesInfo.length
      ? `<h3 class="sub" style="margin-top:18px">What each role can do</h3>` + rolesInfo.map(r =>
          `<details style="margin:6px 0;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08)">` +
          `<summary style="cursor:pointer"><b>${esc(r.label)}</b> <span class="soft">(${esc(r.role)})</span></summary>` +
          `<p class="muted" style="margin:6px 0">${esc(r.description)}</p>` +
          `<p style="margin:6px 0"><b>Can:</b> ${(r.can || []).map(esc).join(", ")}</p>` +
          (r.is_owner ? "" : `<p class="soft" style="margin:6px 0"><b>Can't:</b> manage staff &amp; roles (owner-only), or anything not listed.</p>`) +
          `</details>`).join("")
      : `<p class="muted">Assignable roles: ${roles.map(esc).join(", ")}</p>`);
  $("staff").querySelectorAll("button[data-save-roles]").forEach(b => b.addEventListener("click", () => {
    const inp = $("staff").querySelector(`.st-roles-edit[data-id="${b.dataset.saveRoles}"]`);
    staffApi("PUT", `/admin/staff/${b.dataset.saveRoles}/roles`, { roles: inp.value.split(",").map(x => x.trim()).filter(Boolean) });
  }));
  $("staff").querySelectorAll("button[data-deact]").forEach(b => b.addEventListener("click", () => staffApi("POST", `/admin/staff/${b.dataset.deact}/deactivate`)));
  $("staff").querySelectorAll("button[data-act]").forEach(b => b.addEventListener("click", () => staffApi("POST", `/admin/staff/${b.dataset.act}/activate`)));
}
async function staffApi(method, path, body) {
  try {
    const res = await api(path, { method, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) { const e = await res.json().catch(() => ({})); note("staff-note", e.detail || "Couldn't do that.", false); return; }
    const d = await res.json();
    if (d.error) note("staff-note", "Couldn't do that: " + d.error, false);
    else { note("staff-note", "Done.", true); await loadStaff(); }
  } catch (e) { note("staff-note", "Couldn't do that.", false); }
}
async function addStaff() {
  const email = $("st-email").value.trim(), name = $("st-name").value.trim();
  const roles = $("st-roles").value.split(",").map(x => x.trim()).filter(Boolean);
  if (!email) { $("st-email").focus(); return; }
  try {
    const res = await api("/admin/staff", { method: "POST", body: JSON.stringify({ email, name, roles }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); note("staff-note", "Couldn't add: " + (e.detail || "denied"), false); return; }
    const d = await res.json();
    if (d.error) note("staff-note", "Couldn't add: " + d.error, false);
    else { note("staff-note", "Added " + email, true); $("st-email").value = ""; $("st-name").value = ""; $("st-roles").value = ""; await loadStaff(); }
  } catch (e) { note("staff-note", "Couldn't add that.", false); }
}

// ---- settings (generic config) ----
async function loadConfig() {
  const key = $("cfg-key").value;
  let res; try { res = await api("/admin/config/" + key); } catch (e) { return; }
  if (!res.ok) { $("cfg-json").value = ""; note("cfg-note", "No access to " + key + ".", false); return; }
  const d = await res.json();
  $("cfg-json").value = JSON.stringify(d.value, null, 2);
  note("cfg-note", "");
}
// Keys that change live behaviour (routing, money, limits) get a firmer confirm before saving.
const CFG_SENSITIVE = new Set(["models", "pricing", "plans", "tripwires", "limits"]);
async function saveConfig() {
  const key = $("cfg-key").value;
  const label = $("cfg-key").selectedOptions[0] ? $("cfg-key").selectedOptions[0].textContent : key;
  let value; try { value = JSON.parse($("cfg-json").value); } catch (e) { note("cfg-note", "Invalid JSON.", false); return; }
  const msg = CFG_SENSITIVE.has(key)
    ? `Change "${label}"? This affects live behaviour (model routing, pricing, or limits). A bad value safely falls back to the default, but please double-check before saving.`
    : `Save changes to "${label}"?`;
  if (!confirm(msg)) return;
  try {
    const res = await api("/admin/config/" + key, { method: "POST", body: JSON.stringify({ value }) });
    if (res.ok) note("cfg-note", "Saved.", true);
    else { const e = await res.json().catch(() => ({})); note("cfg-note", e.detail || "Couldn't save.", false); }
  } catch (e) { note("cfg-note", "Couldn't save.", false); }
}
async function loadCosts() {
  const days = ($("cost-days") && $("cost-days").value) || 30;
  let res; try { res = await api("/admin/costs?days=" + days); } catch (e) { return; }
  if (!res.ok) { $("cost-body").innerHTML = `<p class="soft">No finance access.</p>`; return; }
  const d = await res.json();
  const usd = n => "$" + (Number(n) || 0).toFixed(2);
  $("cost-strip").innerHTML =
    `<span class="pill">${usd(d.total_usd)} total</span>` +
    `<span class="pill">${usd(d.attributed_usd)} per-book</span>` +
    `<span class="pill">${usd(d.shared_usd)} shared</span>` +
    `<span class="pill">${d.days}d</span>`;
  const arr = d.by_day || [];
  const maxd = Math.max(0.0001, ...arr.map(x => x.usd));
  const bars = arr.map(x =>
    `<div class="cbar" title="${x.date}: ${usd(x.usd)}"><span style="height:${Math.round(100 * x.usd / maxd)}%"></span></div>`).join("");
  const tbl = (rows, head) => rows ? `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>` : `<p class="soft">—</p>`;
  const byModel = tbl((d.by_model || []).map(x => `<tr><td>${esc(x.model)}</td><td>${usd(x.usd)}</td></tr>`).join(""), "<th>Model</th><th>Cost</th>");
  const byCall = tbl((d.by_call_type || []).map(x => `<tr><td>${esc(x.call_type)}</td><td>${usd(x.usd)}</td></tr>`).join(""), "<th>Call type</th><th>Cost</th>");
  const byBook = (d.by_book || []).length
    ? tbl(d.by_book.map(x => `<tr><td>#${x.manuscript_id} ${esc(x.title || "")} <span class="soft">${esc(x.author || "")}</span></td><td>${usd(x.usd)}</td></tr>`).join(""), "<th>Book</th><th>Cost</th>")
    : `<p class="soft">No per-book costs in this window.</p>`;
  $("cost-body").innerHTML =
    `<div class="cchart">${bars}</div>` +
    `<div class="cgrid"><div><h4 class="sub">By model</h4>${byModel}</div>` +
    `<div><h4 class="sub">By call type</h4>${byCall}</div></div>` +
    `<h4 class="sub">Top books</h4>${byBook}`;
}
async function loadExemplars() {
  let res; try { res = await api("/admin/exemplars"); } catch (e) { return; }
  if (!res.ok) { $("exemplars").innerHTML = `<p class="soft">No access.</p>`; return; }
  const steps = (await res.json()).steps || [];
  $("exemplars").innerHTML = steps.map(s => {
    const badge = s.source === "promoted" ? `<span class="pill you">promoted</span>`
      : (s.source === "seed" ? `<span class="pill">seed</span>` : `<span class="pill">none</span>`);
    const body = s.has ? `<pre class="exemplar-body">${esc(s.body)}</pre>`
      : `<p class="soft">No exemplar yet — Libra writes this one fresh each time.</p>`;
    return `<details><summary><b>${esc(s.step)}</b> ${badge}${s.subject ? ` <span class="soft">· ${esc(s.subject)}</span>` : ""}</summary>${body}</details>`;
  }).join("");
}
async function loadSecretsStatus() {
  let res; try { res = await api("/admin/secrets-status"); } catch (e) { return; }
  if (!res.ok) { $("secrets-status").innerHTML = `<p class="soft">No access.</p>`; return; }
  const secrets = (await res.json()).secrets || [];
  $("secrets-status").innerHTML = `<ul class="needs">` + secrets.map(s =>
    `<li><span>${esc(s.label)} <span class="soft">(${esc(s.env)})</span></span>` +
    `<span class="pill${s.present ? "" : " you"}">${s.present ? "✓ configured" : "✗ missing"}</span></li>`).join("") +
    `</ul>`;
}
// ---- circle ops ----
async function scheduleCircle() {
  try {
    const res = await api("/admin/circle/schedule", { method: "POST", body: JSON.stringify({ date: $("circ-date").value, join_url: $("circ-url").value }) });
    note("circ-note", res.ok ? "Schedule saved." : "Couldn't save.", res.ok);
  } catch (e) { note("circ-note", "Couldn't save.", false); }
}
async function messageCircle() {
  const subject = $("circ-subj").value.trim(), body = $("circ-body").value.trim();
  if (!subject || !body) { note("circ-note", "Subject and body required.", false); return; }
  if (!confirm("Send this to everyone currently in their Circle window?")) return;
  try {
    const res = await api("/admin/circle/message", { method: "POST", body: JSON.stringify({ subject, body }) });
    if (res.ok) { const d = await res.json(); note("circ-note", "Sent to " + d.sent + ".", true); $("circ-subj").value = ""; $("circ-body").value = ""; }
    else note("circ-note", "Couldn't send.", false);
  } catch (e) { note("circ-note", "Couldn't send.", false); }
}
// ---- institutional deals ----
async function loadDeals() {
  let res; try { res = await api("/admin/deals"); } catch (e) { return; }
  if (!res.ok) { $("deals").innerHTML = `<p class="soft">No access.</p>`; return; }
  const deals = (await res.json()).deals || [];
  $("deals").innerHTML = deals.length
    ? `<table><thead><tr><th>Org</th><th>Contact</th><th>Seats</th><th>Value</th><th>Stage</th></tr></thead><tbody>` +
      deals.map(d => `<tr><td>${esc(d.org)}</td><td class="soft">${esc(d.contact_email || "")}</td><td>${d.seats}</td>` +
        `<td>$${Math.round((d.value_cents || 0) / 100).toLocaleString()}</td>` +
        `<td><select data-deal="${d.id}" data-org="${esc(d.org)}">` +
        ["prospect", "proposal", "won", "lost"].map(s => `<option ${s === d.stage ? "selected" : ""}>${s}</option>`).join("") +
        `</select></td></tr>`).join("") + `</tbody></table>`
    : `<p class="soft">No deals yet.</p>`;
  $("deals").querySelectorAll("select[data-deal]").forEach(sel => sel.addEventListener("change", () =>
    api("/admin/deals/" + sel.dataset.deal, { method: "POST", body: JSON.stringify({ org: sel.dataset.org, stage: sel.value }) }).then(loadDeals)));
}
async function addDeal() {
  const org = $("deal-org").value.trim();
  if (!org) { $("deal-org").focus(); return; }
  const seats = Number($("deal-seats").value || 0), value_cents = Math.round(Number($("deal-value").value || 0) * 100);
  try {
    const res = await api("/admin/deals", { method: "POST", body: JSON.stringify({ org, seats, value_cents }) });
    if (res.ok) { $("deal-org").value = ""; $("deal-seats").value = ""; $("deal-value").value = ""; note("deal-note", "Added.", true); await loadDeals(); }
    else note("deal-note", "Couldn't add.", false);
  } catch (e) { note("deal-note", "Couldn't add.", false); }
}
// ---- refund ----
async function refundOrder() {
  const id = Number($("rf-order").value || 0);
  if (!id) { $("rf-order").focus(); return; }
  if (!confirm("Record a refund on order " + id + "?")) return;
  const amt = $("rf-amount").value.trim();
  const body = { order_id: id };
  if (amt) body.amount_cents = Math.round(Number(amt) * 100);
  try {
    const d = await (await api("/admin/billing/refund", { method: "POST", body: JSON.stringify(body) })).json();
    if (d.ok) { note("rf-note", "Refunded — order now " + d.payment_status + ".", true); loadFinance(); }
    else note("rf-note", d.error || "Couldn't refund.", false);
  } catch (e) { note("rf-note", "Couldn't refund.", false); }
}
// ---- audit log ----
async function loadAudit() {
  let res; try { res = await api("/admin/audit"); } catch (e) { return; }
  if (!res.ok) { $("audit").innerHTML = `<p class="soft">No audit access.</p>`; return; }
  const ev = (await res.json()).events || [];
  $("audit").innerHTML = ev.length
    ? `<table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>` +
      ev.map(e => `<tr><td class="soft">${esc((e.at || "").replace("T", " ").slice(0, 16))}</td><td>${esc(e.actor || "")}</td><td>${esc(e.kind || "")}</td><td>${esc(e.detail || "")}</td></tr>`).join("") +
      `</tbody></table>`
    : `<p class="soft">No actions logged yet.</p>`;
}

// Make every dashboard panel collapsible (collapsed by default) and remember each panel's open/closed
// state. State is saved server-side (per staff member) so the layout follows you across browsers and
// devices; localStorage is a same-device cache for an instant, flicker-free first paint.
const PANEL_KEY = "cl_admin_panels";
let panelPrefs = {};

const DEFAULT_OPEN = new Set(["Needs your attention"]);   // the action hub starts expanded

function applyPanelState() {
  document.querySelectorAll("#admin-dashboard .panel[data-key]").forEach(panel => {
    const saved = panelPrefs[panel.dataset.key];
    const open = saved ? saved === "open" : DEFAULT_OPEN.has(panel.dataset.key);
    panel.classList.toggle("collapsed", !open);          // default collapsed, except the action hub
  });
}

function savePanelPrefs() {
  try { localStorage.setItem(PANEL_KEY, JSON.stringify(panelPrefs)); } catch (e) {}
  api("/admin/ui-prefs", { method: "PUT", body: JSON.stringify({ panels: panelPrefs }) }).catch(() => {});
}

async function syncPanelPrefsFromServer() {
  try {
    const r = await api("/admin/ui-prefs");
    if (!r.ok) return;
    const d = await r.json();
    if (d && d.panels && typeof d.panels === "object") {
      panelPrefs = d.panels;
      try { localStorage.setItem(PANEL_KEY, JSON.stringify(panelPrefs)); } catch (e) {}
      applyPanelState();
    }
  } catch (e) {}
}

function setupCollapsiblePanels() {
  try { panelPrefs = JSON.parse(localStorage.getItem(PANEL_KEY) || "{}"); } catch (e) { panelPrefs = {}; }
  document.querySelectorAll("#admin-dashboard .panel").forEach(panel => {
    const h2 = panel.querySelector("h2");
    if (!h2 || panel.dataset.coll) return;
    panel.dataset.coll = "1";
    panel.dataset.key = h2.textContent.trim().slice(0, 50);
    h2.addEventListener("click", () => {
      panel.classList.toggle("collapsed");
      panelPrefs[panel.dataset.key] = panel.classList.contains("collapsed") ? "closed" : "open";
      savePanelPrefs();
    });
  });
  applyPanelState();              // instant paint from the local cache (collapsed where unknown)
  syncPanelPrefsFromServer();     // then reconcile with the server (cross-device)
}

document.addEventListener("DOMContentLoaded", () => {
  setupCollapsiblePanels();
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
  $("abtn-cohorts").addEventListener("click", () => loadCohorts());
  $("abtn-vouchers").addEventListener("click", () => loadVouchers());
  $("vm-btn").addEventListener("click", mintVoucher);
  $("tl-btn").addEventListener("click", loadTimeline);
  $("abtn-finance").addEventListener("click", () => loadFinance());
  $("abtn-staff").addEventListener("click", () => loadStaff());
  $("st-add").addEventListener("click", addStaff);
  $("cfg-load").addEventListener("click", loadConfig);
  $("cfg-save").addEventListener("click", saveConfig);
  $("cfg-key").addEventListener("change", loadConfig);
  $("circ-sched").addEventListener("click", scheduleCircle);
  $("circ-send").addEventListener("click", messageCircle);
  $("abtn-deals").addEventListener("click", () => loadDeals());
  $("deal-add").addEventListener("click", addDeal);
  $("rf-btn").addEventListener("click", refundOrder);
  $("abtn-audit").addEventListener("click", () => loadAudit());
  $("cost-days").addEventListener("change", loadCosts);
  $("abtn-exemplars").addEventListener("click", () => loadExemplars());
  if (token()) { loadAll().then(() => show("dashboard")).catch(() => show("signin")); }
  else show("signin");
});
