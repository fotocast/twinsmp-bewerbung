// Twin SMP – Bewerbungsseite (statisch, für GitHub Pages)
// Backend: Supabase (siehe supabase/schema.sql) oder Demo-Modus im Browser, wenn config.js leer ist.

const CFG = window.TWIN_CONFIG || {};
const LIVE = Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey);
const POLL_MS = 4000;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Sicherer Element-Baukasten: Texte landen immer als textContent (kein HTML aus Nutzereingaben). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const LABELS = {
  alter: "Alter",
  spielzeit: "Spielzeit pro Woche",
  discord_aktiv: "Discord-Aktivität",
  spielstil: "Spielstil",
  edition: "Edition",
  version: "Version",
  verrat: "Umgang mit Verrat",
  pvp: "Einstellung zu PvP",
};
const STATUS = { neu: "Neu", in_pruefung: "In Prüfung", angenommen: "Angenommen", abgelehnt: "Abgelehnt" };
const fmtTime = (iso) => new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3200);
}

// ======================================================================= Backends

async function liveApi() {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  const fail = (e) => { throw new Error(e?.message || String(e)); };
  return {
    async submit(d) {
      const { data, error } = await sb.rpc("submit_application", {
        p_mc_name: d.mc_name, p_discord: d.discord, p_email: d.email, p_answers: d.answers, p_first_message: d.first_message,
      });
      if (error) fail(error);
      const r = Array.isArray(data) ? data[0] : data;
      return { id: r.app_id, token: r.app_token };
    },
    async getChat(id, token) {
      const { data, error } = await sb.rpc("get_chat", { p_id: id, p_token: token });
      if (error) fail(error);
      return data;
    },
    async send(id, token, body) {
      const { error } = await sb.rpc("send_message", { p_id: id, p_token: token, p_body: body });
      if (error) fail(error);
    },
    async adminLogin(password) {
      if (!CFG.adminEmail) fail({ message: "adminEmail fehlt in config.js." });
      const { error } = await sb.auth.signInWithPassword({ email: CFG.adminEmail, password });
      if (error) fail({ message: "Falsches Passwort." });
      const { data } = await sb.from("admins").select("user_id").limit(1);
      if (!data || !data.length) {
        await sb.auth.signOut();
        fail({ message: "Dieses Konto ist nicht als Admin eingetragen." });
      }
    },
    async adminSession() {
      const { data } = await sb.auth.getSession();
      return Boolean(data.session);
    },
    async adminLogout() { await sb.auth.signOut(); },
    async listApps() {
      const { data, error } = await sb.from("applications")
        .select("id,created_at,mc_name,discord,email,answers,status,last_message_at,last_sender,admin_seen_at")
        .order("last_message_at", { ascending: false });
      if (error) fail(error);
      return data;
    },
    async adminMessages(id) {
      const { data, error } = await sb.from("messages").select("id,sender,body,created_at").eq("application_id", id).order("id");
      if (error) fail(error);
      return data;
    },
    async adminSend(id, body) {
      const { error } = await sb.from("messages").insert({ application_id: id, sender: "admin", body });
      if (error) fail(error);
    },
    async setStatus(id, status) {
      const { error } = await sb.from("applications").update({ status }).eq("id", id);
      if (error) fail(error);
    },
    async markSeen(id) {
      await sb.from("applications").update({ admin_seen_at: new Date().toISOString() }).eq("id", id);
    },
    async deleteApp(id) {
      const { error } = await sb.from("applications").delete().eq("id", id);
      if (error) fail(error);
    },
  };
}

/** Demo-Backend: alles in localStorage dieses Browsers. Admin-Passwort "demo". */
function demoApi() {
  const KEY = "twin-demo-db";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { apps: [], msgs: [], seq: 1 }; } catch { return { apps: [], msgs: [], seq: 1 }; } };
  const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* privates Fenster */ } };
  const now = () => new Date().toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const touch = (db, id, sender, at) => { const a = db.apps.find((x) => x.id === id); if (a) { a.last_message_at = at; a.last_sender = sender; } };
  const find = (db, id, token) => { const a = db.apps.find((x) => x.id === id && x.token === token); if (!a) throw new Error("Bewerbung nicht gefunden."); return a; };
  return {
    async submit(d) {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(d.mc_name)) throw new Error("Ungültiger Minecraft-Name.");
      if (!d.discord && !d.email) throw new Error("Bitte gib deinen Discord-Namen oder deine E-Mail an.");
      const db = load();
      const a = { id: uuid(), token: uuid(), created_at: now(), mc_name: d.mc_name, discord: d.discord || null, email: d.email || null,
        answers: d.answers, status: "neu", last_message_at: now(), last_sender: null, admin_seen_at: null };
      db.apps.push(a);
      if (d.first_message) { const at = now(); db.msgs.push({ id: db.seq++, application_id: a.id, sender: "bewerber", body: d.first_message, created_at: at }); touch(db, a.id, "bewerber", at); }
      save(db);
      return { id: a.id, token: a.token };
    },
    async getChat(id, token) {
      const db = load(); const a = find(db, id, token);
      return { status: a.status, mc_name: a.mc_name, created_at: a.created_at, answers: a.answers,
        messages: db.msgs.filter((m) => m.application_id === id).sort((x, y) => x.id - y.id) };
    },
    async send(id, token, body) {
      const db = load(); find(db, id, token); const at = now();
      db.msgs.push({ id: db.seq++, application_id: id, sender: "bewerber", body, created_at: at }); touch(db, id, "bewerber", at); save(db);
    },
    async adminLogin(pw) { if (pw !== "demo") throw new Error("Falsches Passwort."); sessionStorage.setItem("twin-demo-admin", "1"); },
    async adminSession() { return sessionStorage.getItem("twin-demo-admin") === "1"; },
    async adminLogout() { sessionStorage.removeItem("twin-demo-admin"); },
    async listApps() { return load().apps.slice().sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)); },
    async adminMessages(id) { return load().msgs.filter((m) => m.application_id === id).sort((x, y) => x.id - y.id); },
    async adminSend(id, body) { const db = load(); const at = now(); db.msgs.push({ id: db.seq++, application_id: id, sender: "admin", body, created_at: at }); touch(db, id, "admin", at); save(db); },
    async setStatus(id, status) { const db = load(); const a = db.apps.find((x) => x.id === id); if (a) a.status = status; save(db); },
    async markSeen(id) { const db = load(); const a = db.apps.find((x) => x.id === id); if (a) a.admin_seen_at = now(); save(db); },
    async deleteApp(id) { const db = load(); db.apps = db.apps.filter((a) => a.id !== id); db.msgs = db.msgs.filter((m) => m.application_id !== id); save(db); },
  };
}

// ======================================================================= Gemerkte Bewerbung

const CRED_KEY = "twin-application";
function getCreds() { try { return JSON.parse(localStorage.getItem(CRED_KEY)); } catch { return null; } }
function setCreds(c) { try { localStorage.setItem(CRED_KEY, JSON.stringify(c)); } catch { /* egal */ } }
function secretLink(c) { return `${location.origin}${location.pathname}#chat/${c.id}.${c.token}`; }

// ======================================================================= Chat-Darstellung

function renderMessages(box, messages, mineSender, labels) {
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const sig = messages.map((m) => m.id).join(",");
  if (box.dataset.sig === sig) return;
  const first = !box.dataset.sig;
  box.dataset.sig = sig;
  box.replaceChildren();
  if (!messages.length) {
    box.append(h("p", { class: "msg-empty" }, labels.empty));
    return;
  }
  for (const m of messages) {
    const mine = m.sender === mineSender;
    box.append(h("div", { class: `msg ${mine ? "mine" : "theirs"}` },
      h("span", { class: "meta" }, h("b", {}, mine ? labels.me : labels.them), " · ", fmtTime(m.created_at)),
      h("div", { class: "bubble" }, m.body)));
  }
  if (first || atBottom) box.scrollTop = box.scrollHeight;
}

function renderAnswers(dl, answers, cls) {
  dl.replaceChildren();
  for (const [k, label] of Object.entries(LABELS)) {
    const v = answers?.[k];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    const pair = [h("dt", {}, label), h("dd", {}, Array.isArray(v) ? v.join(", ") : String(v))];
    dl.append(cls ? h("div", { class: cls }, ...pair) : pair[0], ...(cls ? [] : [pair[1]]));
  }
}

function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }
function enterToSend(textarea, form) {
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  textarea.addEventListener("input", () => autoGrow(textarea));
}

// ======================================================================= App

let api;
let pollTimer = null;

const LOCAL = ["localhost", "127.0.0.1", ""].includes(location.hostname);
/** Oeffentlich ohne Supabase: nichts annehmen, was verloren ginge. */
const CLOSED = !LIVE && !LOCAL;

async function main() {
  $("#demo-banner").hidden = LIVE;
  if (CLOSED) {
    $("#demo-banner").textContent = "Die Bewerbung wird gerade eingerichtet – schau bald wieder vorbei!";
    $("#apply-form").replaceChildren(h("p", {}, "Bewerbungen sind in Kürze möglich. Die Seite wird gerade eingerichtet."));
    $(".stepper").hidden = true;
    $("#login-form").replaceChildren(h("p", { class: "muted" }, "Noch nicht eingerichtet."));
  }
  try {
    api = LIVE ? await liveApi() : demoApi();
  } catch (e) {
    console.error(e);
    api = demoApi();
    $("#demo-banner").hidden = false;
    $("#demo-banner").textContent = "Verbindung zu Supabase fehlgeschlagen – Demo-Modus aktiv.";
  }
  if (!CLOSED) {
    setupForm();
    setupAdmin();
  }
  setupChat();
  window.addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) route(); });
  route();
}

function showView(name) {
  for (const v of $$(".view")) v.hidden = v.dataset.view !== name;
  for (const a of $$("[data-nav]")) a.classList.toggle("active", a.dataset.nav === name);
  const has = Boolean(getCreds());
  $("#nav-chat").hidden = !has;
  $("#hero-chat").hidden = !has;
}

function route() {
  clearInterval(pollTimer);
  const hash = location.hash.replace(/^#/, "") || "start";
  if (hash.startsWith("chat/")) {
    const [id, token] = hash.slice(5).split(".");
    if (id && token) setCreds({ id, token });
    history.replaceState(null, "", "#chat");
    return route();
  }
  const view = ["start", "team", "bewerben", "chat", "admin"].includes(hash) ? hash : "start";
  showView(view);
  if (view === "chat") openChat();
  if (view === "admin") openAdmin();
  window.scrollTo({ top: 0 });
}

// ----------------------------------------------------------------------- Formular

function setupForm() {
  const form = $("#apply-form");
  let step = 1;
  const steps = $$("fieldset[data-step]", form);
  const errBox = $("#form-error");

  $$("#playstyle .chip").forEach((c) => c.addEventListener("click", () => {
    c.classList.toggle("active");
    c.setAttribute("aria-pressed", c.classList.contains("active"));
    $("#playstyle").classList.remove("invalid");
  }));
  form.addEventListener("input", (e) => e.target.classList?.remove("invalid"));

  const val = (n) => (form.elements[n]?.value || "").trim();
  const playstyle = () => $$("#playstyle .chip.active").map((c) => c.dataset.value);

  function check(s) {
    const bad = [];
    const mark = (name, msg) => { const el = form.elements[name]; if (el) el.classList.add("invalid"); bad.push(msg); };
    if (s === 1) {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(val("mc_name"))) mark("mc_name", "Minecraft-Name: 3–16 Zeichen, nur Buchstaben, Zahlen und _.");
      if (!val("discord") && !val("email")) { mark("discord"); mark("email", "Gib deinen Discord-Namen oder deine E-Mail an."); }
      if (val("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("email"))) mark("email", "Die E-Mail-Adresse sieht nicht richtig aus.");
      const a = Number(val("alter"));
      if (!val("alter") || !Number.isInteger(a) || a < 6 || a > 99) mark("alter", "Bitte gib dein Alter an.");
    }
    if (s === 2) {
      if (!val("spielzeit")) mark("spielzeit", "Wie viel Zeit hast du pro Woche?");
      if (!val("discord_aktiv")) mark("discord_aktiv", "Bist du auf Discord aktiv?");
      if (!playstyle().length) { $("#playstyle").classList.add("invalid"); bad.push("Wähle mindestens einen Spielstil."); }
      if (!val("edition")) mark("edition", "Java oder Bedrock?");
    }
    if (s === 3) {
      if (val("verrat").length < 10) mark("verrat", "Erzähl uns etwas mehr, wie du mit Verrat umgehst (mind. 10 Zeichen).");
      if (val("pvp").length < 10) mark("pvp", "Erzähl uns etwas mehr über deine Einstellung zu PvP (mind. 10 Zeichen).");
    }
    const msgs = bad.filter(Boolean);
    errBox.hidden = !msgs.length;
    errBox.textContent = msgs.join(" ");
    return !msgs.length;
  }

  function show(s) {
    step = s;
    steps.forEach((f) => (f.hidden = Number(f.dataset.step) !== s));
    $$(".step-dot").forEach((d) => {
      const n = Number(d.dataset.dot);
      d.classList.toggle("current", n === s);
      d.classList.toggle("done", n < s);
    });
    $("#btn-back").hidden = s === 1;
    $("#btn-next").hidden = s === 3;
    $("#btn-submit").hidden = s !== 3;
    errBox.hidden = true;
    steps[s - 1].querySelector("input, select, textarea")?.focus({ preventScroll: true });
  }

  $("#btn-next").addEventListener("click", () => { if (check(step)) show(step + 1); });
  $("#btn-back").addEventListener("click", () => show(step - 1));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!check(3)) return;
    const btn = $("#btn-submit");
    btn.disabled = true;
    btn.textContent = "Wird gesendet …";
    try {
      const answers = {
        alter: Number(val("alter")),
        spielzeit: val("spielzeit"),
        discord_aktiv: val("discord_aktiv"),
        spielstil: playstyle(),
        edition: val("edition"),
        version: val("version"),
        verrat: val("verrat"),
        pvp: val("pvp"),
      };
      const creds = await api.submit({
        mc_name: val("mc_name"), discord: val("discord"), email: val("email"), answers, first_message: val("first_message"),
      });
      setCreds(creds);
      form.reset();
      $$(".invalid", document).forEach((x) => x.classList.remove("invalid"));
      $$("#playstyle .chip").forEach((c) => c.classList.remove("active"));
      show(1);
      location.hash = "#chat";
      toast("Bewerbung gesendet! Speichere dir den Link rechts.");
    } catch (err) {
      errBox.hidden = false;
      errBox.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Bewerbung absenden";
    }
  });
  show(1);
}

// ----------------------------------------------------------------------- Bewerber-Chat

function setupChat() {
  const form = $("#chat-form");
  const input = $("#chat-input");
  enterToSend(input, form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = getCreds();
    const body = input.value.trim();
    if (!c || !body) return;
    input.disabled = true;
    try {
      await api.send(c.id, c.token, body);
      input.value = "";
      autoGrow(input);
      await loadChat();
    } catch (err) {
      toast(err.message);
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
  $("#btn-copy-link").addEventListener("click", async () => {
    const c = getCreds();
    if (!c) return;
    try { await navigator.clipboard.writeText(secretLink(c)); toast("Link kopiert."); }
    catch { toast("Kopieren nicht möglich – markiere den Link rechts."); }
  });
}

async function openChat() {
  const c = getCreds();
  $(".chat-layout").hidden = !c;
  $("#chat-empty").hidden = Boolean(c);
  if (!c) return;
  $("#secret-link").textContent = secretLink(c);
  $("#chat-messages").dataset.sig = "";
  await loadChat();
  pollTimer = setInterval(() => { if (!document.hidden) loadChat(); }, POLL_MS);
}

async function loadChat() {
  const c = getCreds();
  if (!c) return;
  try {
    const d = await api.getChat(c.id, c.token);
    $("#chat-title").textContent = `Bewerbung von ${d.mc_name}`;
    const st = $("#chat-status");
    st.textContent = STATUS[d.status] || d.status;
    st.dataset.s = d.status;
    renderAnswers($("#chat-answers"), d.answers);
    renderMessages($("#chat-messages"), d.messages || [], "bewerber", {
      me: "Du", them: "Team Twin SMP",
      empty: "Noch keine Nachrichten. Schreib dem Team hier – wir antworten so bald wie möglich.",
    });
    if (d.status === "angenommen" && CFG.serverAddress && !$("#chat-messages").dataset.ipShown) {
      $("#chat-messages").dataset.ipShown = "1";
      toast(`Angenommen! Server: ${CFG.serverAddress}`);
    }
  } catch (err) {
    clearInterval(pollTimer);
    $(".chat-layout").hidden = true;
    $("#chat-empty").hidden = false;
    $("#chat-empty p").textContent = `${err.message} Prüfe deinen Link oder bewirb dich neu.`;
  }
}

// ----------------------------------------------------------------------- Admin

let adminState = { filter: "alle", selected: null, apps: [] };

function setupAdmin() {
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error");
    err.hidden = true;
    try {
      await api.adminLogin($("#admin-password").value);
      $("#admin-password").value = "";
      openAdmin();
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    }
  });
  $("#btn-logout").addEventListener("click", async () => {
    await api.adminLogout();
    adminState.selected = null;
    openAdmin();
  });
  $$("#filters .chip").forEach((c) => c.addEventListener("click", () => {
    adminState.filter = c.dataset.filter;
    $$("#filters .chip").forEach((x) => x.classList.toggle("active", x === c));
    renderAppList();
  }));
}

async function openAdmin() {
  clearInterval(pollTimer);
  const ok = await api.adminSession();
  $("#admin-login").hidden = ok;
  $("#admin-panel").hidden = !ok;
  if (!ok) { $("#admin-password")?.focus(); return; }
  await refreshAdmin();
  pollTimer = setInterval(() => { if (!document.hidden) refreshAdmin(); }, POLL_MS);
}

const isUnread = (a) => a.last_sender === "bewerber" && (!a.admin_seen_at || a.last_message_at > a.admin_seen_at);

async function refreshAdmin() {
  try {
    adminState.apps = await api.listApps();
    renderAppList();
    if (adminState.selected) await renderDetail(adminState.selected, false);
  } catch (err) {
    toast(err.message);
  }
}

function renderAppList() {
  const list = $("#app-list");
  const apps = adminState.apps.filter((a) => adminState.filter === "alle" || a.status === adminState.filter);
  list.replaceChildren();
  if (!apps.length) { list.append(h("li", { class: "muted" }, "Keine Bewerbungen.")); return; }
  for (const a of apps) {
    list.append(h("li", {},
      h("button", { class: `app-item${a.id === adminState.selected ? " selected" : ""}`, type: "button", onclick: () => selectApp(a.id) },
        h("span", { class: "top" },
          h("span", { class: "name" }, a.mc_name),
          isUnread(a) ? h("span", { class: "unread", title: "Neue Nachricht" }) : null),
        h("span", { class: "sub" },
          h("span", { class: "status", dataset: { s: a.status } }, STATUS[a.status] || a.status), " ", fmtTime(a.last_message_at)))));
  }
}

async function selectApp(id) {
  adminState.selected = id;
  renderAppList();
  await renderDetail(id, true);
  api.markSeen(id).then(() => {
    const a = adminState.apps.find((x) => x.id === id);
    if (a) { a.admin_seen_at = new Date().toISOString(); renderAppList(); }
  });
}

async function renderDetail(id, fresh) {
  const a = adminState.apps.find((x) => x.id === id);
  const box = $("#admin-detail");
  if (!a) { box.replaceChildren(h("p", { class: "muted" }, "Diese Bewerbung gibt es nicht mehr.")); adminState.selected = null; return; }
  const messages = await api.adminMessages(id);

  if (fresh || box.dataset.id !== id) {
    box.dataset.id = id;
    const answers = h("dl", { class: "answer-grid" });
    renderAnswers(answers, a.answers, "answer");
    const msgBox = h("div", { class: "messages", id: "admin-messages", "aria-live": "polite" });
    const input = h("textarea", { rows: 1, maxlength: 2000, placeholder: `Antwort an ${a.mc_name} …`, "aria-label": "Antwort" });
    const form = h("form", { class: "composer" }, input, h("button", { class: "btn btn-gold", type: "submit" }, "Senden"));
    enterToSend(input, form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      try {
        await api.adminSend(id, body);
        input.value = "";
        autoGrow(input);
        await api.markSeen(id);
        await refreshAdmin();
      } catch (err) { toast(err.message); }
    });
    const statusBtns = Object.entries(STATUS).map(([k, label]) =>
      h("button", { class: `btn btn-small ${k === "angenommen" ? "btn-ok" : k === "abgelehnt" ? "btn-danger" : "btn-ghost"}`, type: "button",
        dataset: { status: k },
        onclick: async () => { try { await api.setStatus(id, k); await refreshAdmin(); toast(`Status: ${label}`); } catch (err) { toast(err.message); } } },
        label));
    const del = h("button", { class: "btn btn-small btn-danger", type: "button", onclick: async () => {
      if (!confirm(`Bewerbung von ${a.mc_name} endgültig löschen?`)) return;
      try { await api.deleteApp(id); adminState.selected = null; box.replaceChildren(h("p", { class: "muted" }, "Gelöscht.")); await refreshAdmin(); }
      catch (err) { toast(err.message); }
    } }, "Löschen");

    box.replaceChildren(
      h("div", { class: "detail-head" },
        h("div", {},
          h("h2", {}, a.mc_name),
          h("div", { class: "contact" },
            a.discord ? h("span", {}, "Discord: ", h("b", {}, a.discord)) : null,
            a.email ? h("span", {}, "E-Mail: ", h("a", { href: `mailto:${a.email}` }, a.email)) : null,
            h("span", {}, "Eingegangen: ", fmtTime(a.created_at)))),
        h("div", { class: "status-actions" }, ...statusBtns, del)),
      answers,
      h("div", { class: "admin-chat" }, msgBox, form));
  }
  // Status-Knopf hervorheben
  $$("#admin-detail [data-status]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.status === a.status));
  $$("#admin-detail [data-status]").forEach((b) => (b.style.outline = b.dataset.status === a.status ? "3px solid var(--gold)" : ""));
  renderMessages($("#admin-messages"), messages, "admin", {
    me: "Team", them: a.mc_name, empty: "Noch keine Nachrichten.",
  });
}

main();
