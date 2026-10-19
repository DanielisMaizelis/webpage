/* =============================================================
   Shalosh — three words a day.

   Everything lives on this device: the words in localStorage, the
   media in IndexedDB. Nothing is uploaded, there is no account.
   ============================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SLOTS = 3;

const today = () => new Date().toLocaleDateString("sv");   // 2026-10-19, local time

/** DanielTube names files "Title [videoId].mp4" — the id is for the machine, not you. */
const clean = name => name.replace(/\s*\[[A-Za-z0-9_-]{11}\]\s*$/, "").replace(/\s+/g, " ").trim();

function pretty(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
           : `${m}:${String(s).padStart(2, "0")}`;
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* ------------------------------------------------------------ store */

const Store = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem("shalosh." + key)) ?? fallback; }
    catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem("shalosh." + key, JSON.stringify(value)); }
    catch { toast("This device won't let the app save — private browsing?"); }
  },
};

let state = {
  day: Store.read("day", { date: today(), slots: [null, null, null] }),
  history: Store.read("history", []),
  progress: Store.read("progress", {}),
  tab: "video",
  items: [],
  current: null,
};

/** A new day wipes the three slots and files them away. */
function rollover() {
  if (state.day.date === today()) return false;
  const kept = state.day.slots.filter(Boolean);
  if (kept.length) {
    state.history = [{ date: state.day.date, words: kept }, ...state.history].slice(0, 400);
    Store.write("history", state.history);
  }
  state.day = { date: today(), slots: [null, null, null] };
  Store.write("day", state.day);
  return true;
}

/* --------------------------------------------------------- media db */

const DB = {
  open() {
    return this._p ||= new Promise((resolve, reject) => {
      const req = indexedDB.open("shalosh", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("media", mode);
      const req = fn(tx.objectStore("media"));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  all() { return this.run("readonly", s => s.getAll()); },
  put(item) { return this.run("readwrite", s => s.put(item)); },
  remove(key) { return this.run("readwrite", s => s.delete(key)); },
};

/* ------------------------------------------------------------ slots */

function renderSlots() {
  const wrap = $("#slots");
  wrap.innerHTML = "";
  const names = ["one", "two", "three"];
  state.day.slots.forEach((word, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot " + (word ? "filled" : "empty");
    btn.setAttribute("aria-label", word ? `Edit word ${names[i]}: ${word.en}` : `Add word ${names[i]}`);
    btn.innerHTML = word
      ? `<span class="n">${String(i + 1).padStart(2, "0")}</span>
         <span class="he">${esc(word.he)}</span>
         <span class="en">${esc(word.en)}</span>
         ${word.tr ? `<span class="tr">${esc(word.tr)}</span>` : ""}`
      : `<span class="n">${String(i + 1).padStart(2, "0")}</span>
         <span class="plus"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span>
         <span class="hint">add word</span>`;
    btn.addEventListener("click", () => openSheet(i));
    wrap.appendChild(btn);
  });
  $("#today-date").textContent = pretty(state.day.date);
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ------------------------------------------------------------ sheet */

let sheetIndex = null;
let resumeAfterSheet = false;

function openSheet(i) {
  sheetIndex = i;
  const word = state.day.slots[i] || { he: "", en: "", tr: "" };
  $("#sheet-label").textContent = `Word ${["one", "two", "three"][i]}`;
  $("#f-he").value = word.he;
  $("#f-en").value = word.en;
  $("#f-tr").value = word.tr || "";
  $("#sheet-del").hidden = !state.day.slots[i];
  $("#sheet-wrap").hidden = false;
  renderSuggestions("");

  const video = $("#video");
  resumeAfterSheet = !$("#player").hidden && !video.paused;
  if (resumeAfterSheet) video.pause();
  setTimeout(() => $("#f-he").focus(), 120);
}

function closeSheet() {
  $("#sheet-wrap").hidden = true;
  sheetIndex = null;
  if (resumeAfterSheet) $("#video").play().catch(() => {});
  resumeAfterSheet = false;
}

/** Words of the video being watched, so a word is two taps instead of typing Hebrew. */
function renderSuggestions(query) {
  const box = $("#suggest");
  const list = (state.current && state.current.words) || [];
  if (!list.length) { box.hidden = true; return; }
  const q = query.trim().toLowerCase();
  const hits = (q
    ? list.filter(w => w.he.includes(q) || w.en.toLowerCase().startsWith(q) ||
                       (w.tr || "").toLowerCase().startsWith(q))
    : list).slice(0, 8);
  if (!hits.length) { box.hidden = true; return; }
  box.innerHTML = "";
  hits.forEach(w => {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<b>${esc(w.he)}</b> ${esc(w.en)}`;
    b.addEventListener("click", () => {
      $("#f-he").value = w.he;
      $("#f-en").value = w.en;
      $("#f-tr").value = w.tr || "";
      box.hidden = true;
      $("#f-en").focus();
    });
    box.appendChild(b);
  });
  box.hidden = false;
}

function saveWord(event) {
  event.preventDefault();
  const he = $("#f-he").value.trim();
  const en = $("#f-en").value.trim();
  const tr = $("#f-tr").value.trim();
  if (!he && !en) { closeSheet(); return; }
  state.day.slots[sheetIndex] = { he, en, tr, at: Date.now() };
  Store.write("day", state.day);
  renderSlots();
  closeSheet();
  toast("Saved for today");
}

function removeWord() {
  state.day.slots[sheetIndex] = null;
  Store.write("day", state.day);
  renderSlots();
  closeSheet();
}

/* ---------------------------------------------------------- library */

function renderLibrary() {
  const main = $("#library");
  main.innerHTML = "";

  if (state.tab === "words") return renderHistory(main);

  const items = state.items
    .filter(i => i.kind === state.tab)
    .sort((a, b) => b.added - a.added);

  if (!items.length) {
    main.innerHTML = `
      <div class="empty-state">
        <h2>${state.tab === "video" ? "No videos yet" : "Nothing to listen to yet"}</h2>
        <p>Files are copied onto this device, so they play with no signal — on a plane, on the Tube, anywhere.</p>
        <div class="steps">
          <div><b>01</b><span>Tap <strong>Add from Files</strong> below.</span></div>
          <div><b>02</b><span>Browse to <strong>iCloud Drive → Hebrew Videos</strong>.</span></div>
          <div><b>03</b><span>Select the ${state.tab === "video" ? "mp4" : "mp3"} together with its <strong>.jpg</strong> cover and <strong>.json</strong> word list — all three at once.</span></div>
        </div>
      </div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "grid";
  items.forEach(item => grid.appendChild(card(item)));
  main.appendChild(grid);
}

/* one object URL per cover, kept for the life of the page instead of a new
   one on every re-render */
const thumbs = new WeakMap();
function thumbURL(blob) {
  if (!thumbs.has(blob)) thumbs.set(blob, URL.createObjectURL(blob));
  return thumbs.get(blob);
}

function card(item) {
  const seen = state.progress[item.key];
  const pct = seen && item.duration ? Math.min(100, (seen / item.duration) * 100) : 0;
  const el = document.createElement("button");
  el.type = "button";
  el.className = `item ${item.kind}`;
  el.innerHTML = `
    <div class="thumb">
      ${item.cover
        ? `<img alt="" src="${thumbURL(item.cover)}">`
        : `<span class="fallback"><svg viewBox="0 0 24 24">${item.kind === "video"
            ? '<path d="M4 6h16v12H4z"/><path d="M10 9.5l5 2.5-5 2.5z"/>'
            : '<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'}
          </svg></span>`}
      <span class="kill" role="button" aria-label="Remove from device">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </span>
      ${pct ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ""}
    </div>
    <div class="meta">
      <p>${esc(item.name)}</p>
      <span>${item.duration ? fmt(item.duration) : "—"}${item.words ? " · word list" : ""}</span>
    </div>`;

  el.addEventListener("click", event => {
    if (event.target.closest(".kill")) {
      event.stopPropagation();
      if (confirm(`Remove "${item.name}" from this device?`)) forget(item);
      return;
    }
    openPlayer(item);
  });
  return el;
}

function renderHistory(main) {
  const days = [...state.history];
  const live = state.day.slots.filter(Boolean);
  if (live.length) days.unshift({ date: state.day.date, words: live });

  if (!days.length) {
    main.innerHTML = `
      <div class="empty-state">
        <h2>Three a day adds up</h2>
        <p>Words you add are kept here once the day rolls over — thirty days from now that's ninety words you met in something you actually watched.</p>
      </div>`;
    return;
  }

  days.forEach(day => {
    const block = document.createElement("section");
    block.className = "day";
    block.innerHTML = `<h3>${day.date === state.day.date ? "Today" : pretty(day.date)}</h3>
      <ul>${day.words.map(w => `<li>
        <span class="he">${esc(w.he)}</span>
        <span class="en">${esc(w.en)}</span>
        ${w.tr ? `<span class="tr">${esc(w.tr)}</span>` : ""}
      </li>`).join("")}</ul>`;
    main.appendChild(block);
  });
}

/* ------------------------------------------------------- adding files */

/* Copying a film off iCloud Drive takes as long as it takes. The panel
   below reports every step so it is never a button that does nothing. */

const Imp = {
  open(total) {
    this.total = Math.max(1, total);
    this.at = 0;
    this.now = "";
    $("#imp-list").innerHTML = "";
    $("#imp-done").hidden = true;
    $("#imp-spin").hidden = false;
    $("#imp-stage").textContent = "Copying onto this device";
    $("#imp-fill").style.width = "0%";
    $("#imp-now").textContent = "";
    $("#import-wrap").hidden = false;
    this.count();
    quota();
  },
  count() { $("#imp-count").textContent = `${Math.min(this.at + 1, this.total)} of ${this.total}`; },
  file(name) { this.now = name; this.count(); this.step(""); this.bar(0); },
  step(text) { $("#imp-now").textContent = text ? `${this.now} — ${text}` : this.now; },
  bar(fraction) {
    const whole = (this.at + Math.max(0, Math.min(1, fraction))) / this.total;
    $("#imp-fill").style.width = (whole * 100).toFixed(1) + "%";
  },
  next() { this.at++; },
  row(ok, name, why) {
    const li = document.createElement("li");
    li.className = ok ? "ok" : "no";
    li.innerHTML = `<svg class="tick" viewBox="0 0 24 24">${ok
        ? '<path d="M4 13l5 5L20 7"/>'
        : '<circle cx="12" cy="12" r="9"/><path d="M12 7v7M12 17h.01"/>'}</svg>
      <span><b>${esc(name)}</b>${why ? `<span class="why">${esc(why)}</span>` : ""}</span>`;
    $("#imp-list").appendChild(li);
    $("#imp-list").scrollTop = 1e6;
  },
  finish(summary) {
    $("#imp-fill").style.width = "100%";
    $("#imp-spin").hidden = true;
    $("#imp-stage").textContent = "Finished";
    $("#imp-count").textContent = summary;
    $("#imp-now").textContent = "";
    $("#imp-done").hidden = false;
    quota();
  },
  close() { $("#import-wrap").hidden = true; },
};

async function quota() {
  if (!navigator.storage || !navigator.storage.estimate) return;
  try {
    const { usage = 0, quota: q = 0 } = await navigator.storage.estimate();
    const gb = n => n < 1e9 ? Math.round(n / 1e6) + " MB" : (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + " GB";
    $("#imp-quota").textContent = q ? `${gb(usage)} used of ${gb(q)}` : `${gb(usage)} used`;
  } catch { /* nothing to show */ }
}

/* Reads the file through once and throws the bytes away. That forces
   iCloud to hand over a real file, surfaces a read error instead of a
   silent nothing, and gives an honest percentage — all at constant memory. */
async function prefetch(file, onProgress) {
  if (!file.stream) return;
  const reader = file.stream().getReader();
  let read = 0, painted = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      if (performance.now() - painted > 90) { painted = performance.now(); onProgress(read / (file.size || 1)); }
    }
  } finally {
    try { reader.cancel(); } catch { /* already closed */ }
  }
  onProgress(1);
}

const SUSPECT = /\.(mkv|avi|wmv|flv|ts|ogv|ogg|opus|wma|m2ts)$/i;

function why(file) {
  if (/\.mkv$/i.test(file.name))
    return "Safari cannot open Matroska. Turn on the MP4 phone copy in DanielTube and add that instead.";
  if (SUSPECT.test(file.name))
    return "This container is not one Safari can play — an MP4 or an MP3 will work.";
  return "This device could not read the file. It may still be downloading from iCloud.";
}

async function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const base = name => name.replace(/\.[^.]+$/, "");

  /* split the batch: media, cover art, word lists */
  const covers = new Map(), lists = new Map(), side = new Set();
  for (const f of files) {
    if (f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name)) { covers.set(base(f.name), f); side.add(f); }
    else if (/\.json$/i.test(f.name)) { lists.set(base(f.name), f); side.add(f); }
  }
  const media = files.filter(f => !side.has(f));

  /* one video and one word list in the same batch belong together, whatever they are called */
  const lone = media.length === 1 ? base(media[0].name) : null;
  if (lone && lists.size === 1 && !lists.has(lone)) lists.set(lone, [...lists.values()][0]);
  if (lone && covers.size === 1 && !covers.has(lone)) covers.set(lone, [...covers.values()][0]);

  /* art or a word list on its own: attach it to something already here */
  if (!media.length) return attachSidecars(covers, lists);

  Imp.open(media.length);
  let added = 0, skipped = 0, failed = 0, firstKind = null;

  for (const f of media) {
    const name = clean(base(f.name)) || base(f.name);
    Imp.file(name);

    const kind = f.type.startsWith("video/") ? "video"
               : f.type.startsWith("audio/") ? "audio"
               : /\.(mp4|m4v|mov|mkv|webm|avi|ogv|ts|m2ts)$/i.test(f.name) ? "video"
               : /\.(mp3|m4a|aac|wav|opus|ogg|flac|wma)$/i.test(f.name) ? "audio" : null;
    if (!kind) { Imp.row(false, f.name, "Not a video or an audio file."); failed++; Imp.next(); continue; }

    const key = `${f.name}:${f.size}`;
    if (state.items.some(i => i.key === key)) {
      Imp.row(true, name, "Already on this device.");
      skipped++; Imp.next(); continue;
    }

    try {
      Imp.step("reading from iCloud");
      await prefetch(f, fraction => Imp.bar(fraction * 0.8));
    } catch (err) {
      Imp.row(false, name, "iCloud never finished handing the file over — open it once in the Files app, then try again.");
      failed++; Imp.next(); continue;
    }

    Imp.step("checking it plays");
    Imp.bar(0.84);
    const cover = covers.get(base(f.name)) || null;
    const read = await probe(f, kind, !cover);
    if (!read.ok) {
      Imp.row(false, name, why(f));
      failed++; Imp.next(); continue;
    }

    Imp.step("reading cover art");
    Imp.bar(0.9);
    const data = lists.has(base(f.name)) ? await readJSON(lists.get(base(f.name))) : null;
    const record = {
      key, kind, name, blob: f, added: Date.now(),
      duration: read.duration || 0,
      cover: cover || read.cover || (kind === "audio" ? await coverFromTags(f) : null),
      words: normaliseWords(data),
      cues: normaliseCues(data),
    };

    Imp.step("saving to the device");
    Imp.bar(0.95);
    try {
      await DB.put(record);
      state.items.push(record);
      firstKind = firstKind || kind;
      added++;
      const notes = [record.duration ? fmt(record.duration) : null,
                     record.cues ? `${record.cues.length} subtitle lines` : null,
                     record.cover ? "cover art" : null].filter(Boolean);
      Imp.row(true, name, notes.join(" · "));
    } catch (err) {
      const full = err && /quota/i.test(err.name + err.message);
      Imp.row(false, name, full
        ? "No room left in the app's storage. Remove something from the library first."
        : "The device refused to store it.");
      failed++;
      Imp.next();
      if (full) break;
      continue;
    }
    Imp.next();
  }

  if (firstKind && state.tab !== firstKind) selectTab(firstKind);
  renderLibrary();
  updateStorage();
  Imp.finish([added && `${added} added`, skipped && `${skipped} already here`,
              failed && `${failed} could not be added`].filter(Boolean).join(" · ") || "Nothing to add");
  if (!failed && !skipped) setTimeout(() => { if (!$("#import-wrap").hidden) Imp.close(); }, 1400);
}

/** A .jpg or a .json dropped in on its own, for a file already stored. */
async function attachSidecars(covers, lists) {
  let touched = 0;
  for (const item of state.items) {
    const match = [...covers.keys(), ...lists.keys()].find(k => clean(k) === item.name || k === item.name);
    if (!match) continue;
    if (covers.has(match)) item.cover = covers.get(match);
    if (lists.has(match)) {
      const data = await readJSON(lists.get(match));
      item.words = normaliseWords(data) || item.words;
      item.cues = normaliseCues(data) || item.cues;
    }
    await DB.put(item).catch(() => {});
    touched++;
  }
  renderLibrary();
  toast(touched ? `Updated ${touched} item${touched > 1 ? "s" : ""}` : "Add the cover or word list together with its video");
}

async function readJSON(file) {
  try { return JSON.parse(await file.text()); } catch { return null; }
}

/** Accepts a plain list of words, or DanielTube's own lines.json. */
function normaliseWords(data) {
  if (!data) return null;
  const out = [];
  const push = (he, en, tr) => { if (he && en) out.push({ he, en, tr: tr || "" }); };
  if (Array.isArray(data)) {
    data.forEach(entry => {
      if (entry && Array.isArray(entry.words)) {
        entry.words.forEach(w => push(w.text || w.he, w.gloss || w.en, w.translit || w.tr));
      } else if (entry) {
        push(entry.he || entry.text, entry.en || entry.gloss, entry.tr || entry.translit);
      }
    });
  }
  const seen = new Set();
  const list = out.filter(w => !seen.has(w.he) && seen.add(w.he)).slice(0, 2000);
  return list.length ? list : null;
}

/** Timed lines out of lines.json, so the app can draw the subtitles itself. */
function normaliseCues(data) {
  if (!Array.isArray(data)) return null;
  const cues = [];
  for (const line of data) {
    if (!line || !Array.isArray(line.words)) continue;
    const words = line.words.map(w => ({
      he: w.pointed || w.text || w.he || "",
      gl: w.gloss || w.en || "",
      a: Number(w.start) || 0,
      b: Number(w.end) || 0,
    })).filter(w => w.he && w.b >= w.a);
    if (!words.length || !words.some(w => w.b > 0)) continue;
    const first = words[0].a;
    const last = words[words.length - 1].b;
    cues.push({
      a: first,
      b: Math.max(last, first + 0.4),
      words,
      groups: (Array.isArray(line.groups) ? line.groups : []).filter(g =>
        g && g.meaning && Number.isInteger(g.from) && Number.isInteger(g.to) &&
        g.from >= 0 && g.to > g.from && g.to < words.length),
    });
  }
  cues.sort((x, y) => x.a - y.a);
  return cues.length ? cues : null;
}

/* ------------------------------------------------------- cover art in tags */

/** An mp3 from DanielTube carries its artwork inside; dig it out. */
async function coverFromTags(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head.length === 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const hit = id3Cover(head[3], new Uint8Array(await file.slice(10,
        10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9])).arrayBuffer()));
      if (hit) return hit;
    }
    return await mp4Cover(file);
  } catch {
    return null;
  }
}

function id3Cover(version, buf) {
  const headLen = version === 2 ? 6 : 10;
  const idLen = version === 2 ? 3 : 4;
  let i = 0;
  while (i + headLen <= buf.length) {
    const id = String.fromCharCode(...buf.subarray(i, i + idLen));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) return null;
    const s = buf.subarray(i + idLen);
    const len = version === 2 ? (s[0] << 16) | (s[1] << 8) | s[2]
              : version === 4 ? (s[0] << 21) | (s[1] << 14) | (s[2] << 7) | s[3]
              :                 (s[0] << 24) | (s[1] << 16) | (s[2] << 8) | s[3];
    if (len <= 0 || i + headLen + len > buf.length) return null;
    if (id === "APIC" || id === "PIC") {
      const hit = apicBlob(buf.subarray(i + headLen, i + headLen + len), id === "PIC");
      if (hit) return hit;
    }
    i += headLen + len;
  }
  return null;
}

/** APIC: encoding, mime (or a 3-letter format), picture type, description, bytes. */
function apicBlob(body, legacy) {
  if (body.length < 6) return null;
  const enc = body[0];
  let mime = "image/jpeg", p = 1;
  if (legacy) {
    mime = String.fromCharCode(...body.subarray(1, 4)).toUpperCase() === "PNG" ? "image/png" : "image/jpeg";
    p = 4;
  } else {
    let end = p;
    while (end < body.length && body[end] !== 0) end++;
    const text = String.fromCharCode(...body.subarray(p, end));
    if (/^image\//i.test(text)) mime = text.toLowerCase();
    else if (/png/i.test(text)) mime = "image/png";
    p = end + 1;
  }
  p += 1;                                        // picture type
  if (enc === 1 || enc === 2) {                  // UTF-16 description ends on two zeroes
    while (p + 1 < body.length && !(body[p] === 0 && body[p + 1] === 0)) p += 2;
    p += 2;
  } else {
    while (p < body.length && body[p] !== 0) p++;
    p += 1;
  }
  return p < body.length - 8 ? new Blob([body.subarray(p)], { type: mime }) : null;
}

/** m4a / mp4 keep artwork in moov → udta → meta → ilst → covr. */
async function mp4Cover(file) {
  let off = 0;
  for (let box = 0; box < 32 && off + 8 < file.size; box++) {
    const dv = new DataView(await file.slice(off, off + 16).arrayBuffer());
    if (dv.byteLength < 8) return null;
    let size = dv.getUint32(0), head = 8;
    const type = String.fromCharCode(dv.getUint8(4), dv.getUint8(5), dv.getUint8(6), dv.getUint8(7));
    if (size === 1 && dv.byteLength >= 16) { size = Number(dv.getBigUint64(8)); head = 16; }
    if (size < head) return null;
    if (type === "moov") {
      if (size > 24e6) return null;              // not worth reading a huge moov on a phone
      return findCovr(new Uint8Array(await file.slice(off + head, off + size).arrayBuffer()), 0);
    }
    off += size;
  }
  return null;
}

const NESTED = ["moov", "udta", "meta", "ilst", "trak"];

function findCovr(buf, depth) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 0;
  while (i + 8 <= buf.length) {
    const size = dv.getUint32(i);
    const type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
    if (size < 8 || i + size > buf.length) return null;
    if (type === "covr" && i + 24 <= buf.length) {
      const kind = dv.getUint32(i + 16) & 0xffffff;        // 13 = jpeg, 14 = png
      return new Blob([buf.subarray(i + 24, i + size)], { type: kind === 14 ? "image/png" : "image/jpeg" });
    }
    if (depth < 5 && NESTED.includes(type)) {
      const skip = type === "meta" ? 4 : 0;                // meta carries version + flags first
      const hit = findCovr(buf.subarray(i + 8 + skip, i + size), depth + 1);
      if (hit) return hit;
    }
    i += size;
  }
  return null;
}

/** Duration, whether it plays at all, and a poster frame if nothing else offers one. */
function probe(file, kind, wantPoster) {
  return new Promise(resolve => {
    const el = document.createElement(kind === "video" ? "video" : "audio");
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = extra => {
      if (settled) return;
      settled = true;
      clearTimeout(bail);
      el.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(extra || { ok: false });
    };
    const bail = setTimeout(() => done({ ok: false }), 15000);

    el.preload = "metadata";
    el.muted = true;
    el.playsInline = true;
    el.src = url;

    el.onerror = () => done({ ok: false });
    el.onloadedmetadata = () => {
      const duration = isFinite(el.duration) ? el.duration : 0;
      if (kind === "video" && !el.videoWidth && !duration) return done({ ok: false });
      if (kind !== "video" || !wantPoster) return done({ ok: true, duration });
      el.currentTime = Math.min(duration * 0.1 || 1, 8);
      el.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = 480 / (el.videoWidth || 480);
          canvas.width = 480;
          canvas.height = Math.round((el.videoHeight || 270) * scale);
          canvas.getContext("2d").drawImage(el, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => done({ ok: true, duration, cover: blob || null }), "image/jpeg", 0.8);
        } catch { done({ ok: true, duration }); }
      };
    };
  });
}

async function forget(item) {
  await DB.remove(item.key);
  state.items = state.items.filter(i => i.key !== item.key);
  delete state.progress[item.key];
  Store.write("progress", state.progress);
  renderLibrary();
  updateStorage();
}

/* ----------------------------------------------------------- player */

let url = null;
let hideTimer = null;
let lastTap = 0;

function openPlayer(item) {
  state.current = item;
  const video = $("#video");
  const player = $("#player");

  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(item.blob);
  video.src = url;

  $("#now-title").textContent = item.name;
  $("#now-kind").textContent = item.kind === "video" ? "Video" : "Audio";

  const art = $("#art");
  if (item.kind === "audio" && item.cover) {
    const cover = thumbURL(item.cover);
    $("#art-img").src = cover;
    art.style.background = `url("${cover}") center/cover`;
    art.hidden = false;
  } else {
    art.hidden = true;
    $("#art-img").removeAttribute("src");
  }

  player.hidden = false;
  document.body.style.overflow = "hidden";
  $("#player .stage").insertBefore($("#today"), $("#chrome"));   // the words ride on top

  const seen = state.progress[item.key];
  if (seen && (!item.duration || seen < item.duration - 10)) video.currentTime = seen;

  cueAt = -1;
  $("#subs").innerHTML = "";
  setLocked(false);
  closeSlider();
  applyBright();
  applyVolume();
  video.playbackRate = rate;
  $("#speed-btn").classList.toggle("is-on", rate !== 1);
  // a dead control is worse than none: in a home-screen app there is no
  // fullscreen to request, the window already is one
  $("#full-btn").hidden = !fullscreenAvailable();
  video.play().then(() => armHide()).catch(() => showChrome());
  mediaSession(item);
  setTimeout(syncCC, 400);          // native tracks only appear once metadata lands
}

/* --------------------------------------------- picture, sound, lock */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let bright = clamp(Store.read("bright", 1), 0.2, 1.8);
let volume = clamp(Store.read("volume", 1), 0, 1.5);
let rate = Store.read("rate", 1);
let locked = false;

/** Dimming is a composited black overlay; brightening needs a filter. */
function applyBright() {
  $("#dim").style.opacity = bright < 1 ? (1 - bright).toFixed(3) : 0;
  const lift = bright > 1 ? `brightness(${bright.toFixed(2)})` : "";
  $("#video").style.filter = lift;
  $("#art").style.filter = lift;
}

/* iOS ignores video.volume outright, so the sound goes through Web Audio —
   which also allows a boost past 100% for a quiet recording. If the audio
   graph will not start, the element is reconnected and nothing is lost. */
const sound = { ctx: null, src: null, gain: null, dead: false };

function applyVolume() {
  const video = $("#video");
  if (!sound.dead && (sound.ctx || volume !== 1)) {
    try {
      if (!sound.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error("no web audio");
        sound.ctx = new AC();
        sound.src = sound.ctx.createMediaElementSource(video);
        sound.gain = sound.ctx.createGain();
        sound.src.connect(sound.gain).connect(sound.ctx.destination);
      }
      sound.gain.gain.value = volume;
      sound.ctx.resume().then(() => {
        if (sound.ctx.state !== "running") bypass();
      }).catch(bypass);
      video.volume = 1;
      return;
    } catch {
      bypass();
    }
  }
  video.volume = clamp(volume, 0, 1);
}

/** Give up on the audio graph and let the element play straight through. */
function bypass() {
  if (sound.src) {
    try { sound.gain.disconnect(); sound.src.disconnect(); sound.src.connect(sound.ctx.destination); }
    catch { /* nothing more to do */ }
  }
  sound.dead = true;
  $("#video").volume = clamp(volume, 0, 1);
}

function setLocked(on) {
  locked = on;
  $("#player").classList.toggle("locked", on);
  $("#unlock-btn").hidden = !on;
  $("#lock-btn").classList.toggle("is-on", on);
  if (on) { showChrome(); armHide(); } else showChrome();
}

/* ------------------------------------------------------- the readout */

const GLYPH = {
  bright: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>',
  volume: '<svg viewBox="0 0 24 24"><path d="M5 10v4h3l4 3V7L8 10H5z"/><path d="M16 9.5a3.5 3.5 0 010 5M18.5 7a7 7 0 010 10"/></svg>',
  mute:   '<svg viewBox="0 0 24 24"><path d="M5 10v4h3l4 3V7L8 10H5z"/><path d="M16 10l4 4M20 10l-4 4"/></svg>',
  seek:   '<svg viewBox="0 0 24 24"><path d="M4 12h14M13 7l5 5-5 5"/></svg>',
};

let hudTimer;
function hud(kind, fraction, label) {
  $("#hud-icon").innerHTML = GLYPH[kind === "volume" && fraction <= 0 ? "mute" : kind];
  $("#hud-fill").style.width = (clamp(fraction, 0, 1) * 100).toFixed(0) + "%";
  $("#hud-val").textContent = label;
  $("#hud").hidden = false;
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => ($("#hud").hidden = true), 850);
}

/* ------------------------------------------------- the slider drawer */

let sliderKind = null, sliderTimer;
function openSlider(kind) {
  if (sliderKind === kind) return closeSlider();
  sliderKind = kind;
  const range = $("#s-range");
  $("#s-icon").innerHTML = GLYPH[kind];
  range.max = kind === "bright" ? 180 : 150;
  range.min = kind === "bright" ? 20 : 0;
  range.value = Math.round((kind === "bright" ? bright : volume) * 100);
  $("#s-val").textContent = range.value + "%";
  $("#slider-row").hidden = false;
  $("#bright-btn").classList.toggle("is-on", kind === "bright");
  $("#vol-btn").classList.toggle("is-on", kind === "volume");
  nudgeSliderTimer();
}

function closeSlider() {
  sliderKind = null;
  $("#slider-row").hidden = true;
  $("#bright-btn").classList.remove("is-on");
  $("#vol-btn").classList.remove("is-on");
}

function nudgeSliderTimer() {
  clearTimeout(sliderTimer);
  sliderTimer = setTimeout(closeSlider, 5000);
}

/* ------------------------------------------------- the options panel */

const TICK = '<svg viewBox="0 0 24 24"><path d="M4 13l5 5L20 7"/></svg>';

function openPanel(title, note, rows) {
  $("#panel-title").textContent = title;
  $("#panel-note").textContent = note || "";
  $("#panel-note").hidden = !note;
  const list = $("#panel-list");
  list.innerHTML = "";
  rows.forEach(row => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<span>${esc(row.label)}${row.sub ? `<span class="sub">${esc(row.sub)}</span>` : ""}</span>
                   <span class="on">${row.on ? TICK : ""}</span>`;
    b.addEventListener("click", () => { closePanel(); row.pick(); });
    li.appendChild(b);
    list.appendChild(li);
  });
  $("#panel-wrap").hidden = false;
  resumeAfterPanel = !$("#video").paused;
  if (resumeAfterPanel) $("#video").pause();
}

let resumeAfterPanel = false;
function closePanel() {
  $("#panel-wrap").hidden = true;
  if (resumeAfterPanel) $("#video").play().catch(() => {});
  resumeAfterPanel = false;
  armHide();
}

function subtitlePanel() {
  const item = state.current;
  const native = [...($("#video").textTracks || [])];
  const note = item && item.cues
    ? null
    : native.length
      ? "This file carries its own subtitle track."
      : "This video came without a word list, so there is nothing to switch. Re-render it in DanielTube with the phone copy on, and add the .json beside the video.";
  const rows = SUB_MODES.map((label, i) => ({
    label: i === 0 ? "Off" : label,
    on: subMode === i,
    pick: () => { subMode = i; Store.write("subs", i); syncCC(); },
  }));
  openPanel("Subtitles", note, rows);
}

const RATES = [0.5, 0.75, 0.85, 1, 1.25, 1.5, 2];
function speedPanel() {
  openPanel("Playback speed", null, RATES.map(r => ({
    label: r === 1 ? "Normal (1×)" : r + "×",
    on: Math.abs(rate - r) < 0.001,
    pick: () => {
      rate = r;
      Store.write("rate", r);
      $("#video").playbackRate = r;
      $("#speed-btn").classList.toggle("is-on", r !== 1);
      toast(r === 1 ? "Normal speed" : `Speed ${r}×`);
    },
  })));
}

/* --------------------------------------------------------- full screen */

function fullscreenAvailable() {
  const el = $("#stage");
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
                     window.navigator.standalone === true;
  return !standalone && !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

function toggleFullscreen() {
  const el = $("#stage");
  const doc = document;
  const on = doc.fullscreenElement || doc.webkitFullscreenElement;
  try {
    if (on) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  } catch { /* refused */ }
  if (screen.orientation && screen.orientation.lock && !on) {
    screen.orientation.lock("landscape").catch(() => {});
  }
  armHide();
}

/* ------------------------------------------------------------ subtitles */

const SUB_MODES = ["off", "Hebrew and meaning", "Hebrew only"];
let subMode = Math.min(2, Math.max(0, Store.read("subs", 1)));
let cueAt = -1;

/** Shows or hides the CC pill, and keeps a native track in step with our own. */
function syncCC() {
  const item = state.current;
  const native = [...($("#video").textTracks || [])];
  const mine = !!(item && item.cues);
  $("#subs-btn").disabled = !mine && !native.length;
  $("#subs-btn").classList.toggle("is-on", subMode > 0 && (mine || native.length));
  $("#subs").classList.toggle("bare", subMode === 2);
  native.forEach(t => { t.mode = !mine && subMode > 0 ? "showing" : "disabled"; });
  if (!subMode) { $("#subs").innerHTML = ""; cueAt = -1; }
  else renderCue(true);
}

function cycleCC() {
  subMode = (subMode + 1) % 3;
  Store.write("subs", subMode);
  syncCC();
  toast(subMode ? `Subtitles — ${SUB_MODES[subMode]}` : "Subtitles off");
  armHide();
}

function renderCue(force) {
  const box = $("#subs");
  const cues = state.current && state.current.cues;
  if (!cues || !subMode) {
    if (box.firstChild) { box.innerHTML = ""; cueAt = -1; }
    return;
  }
  const t = $("#video").currentTime;

  let i = cueAt >= 0 && cues[cueAt] && t >= cues[cueAt].a ? cueAt : 0;
  while (i + 1 < cues.length && cues[i + 1].a <= t) i++;
  while (i > 0 && cues[i].a > t) i--;

  const cue = cues[i];
  if (!cue || t < cue.a - 0.08 || t > cue.b + 0.4) {
    if (cueAt !== -1) { box.innerHTML = ""; cueAt = -1; }
    return;
  }
  if (i !== cueAt || force) { box.innerHTML = cueHTML(cue); cueAt = i; }

  /* light the word being said, and keep it lit until the next one starts —
     the gaps between words are tiny and a blinking highlight is worse than none */
  let live = -1;
  cue.words.forEach((w, n) => { if (w.a <= t + 0.02) live = n; });
  const spans = box.querySelectorAll(".w");
  spans.forEach((span, n) => span.classList.toggle("on", n === live));
}

/** Words right to left, each under its own meaning; an idiom shares one. */
function cueHTML(cue) {
  const inside = new Map();
  cue.groups.forEach((g, gi) => { for (let n = g.from; n <= g.to; n++) inside.set(n, gi); });

  let out = "", open = -1;
  const shut = () => (open === -1 ? "" : `</span><span class="gl">${esc(cue.groups[open].meaning)}</span></span>`);

  cue.words.forEach((w, n) => {
    const gi = inside.has(n) ? inside.get(n) : -1;
    if (gi !== open) {
      out += shut();
      if (gi !== -1) out += '<span class="unit"><span class="row">';
      open = gi;
    }
    out += `<span class="w"><span class="he">${esc(w.he)}</span>${
      gi === -1 && w.gl ? `<span class="gl">${esc(w.gl)}</span>` : ""}</span>`;
  });
  out += shut();
  return `<div class="cue">${out}</div>`;
}

function closePlayer() {
  const video = $("#video");
  saveProgress();
  video.pause();
  video.removeAttribute("src");
  video.load();
  if (url) { URL.revokeObjectURL(url); url = null; }
  $("#player").hidden = true;
  $("#subs").innerHTML = "";
  closeSlider();
  setLocked(false);
  cueAt = -1;
  document.body.style.overflow = "";
  $("#shell").insertBefore($("#today"), $("#tabs"));
  state.current = null;
  renderLibrary();
}

function showChrome() {
  $("#player").classList.remove("ui-off");
  clearTimeout(hideTimer);
}
function armHide() {
  showChrome();
  hideTimer = setTimeout(() => {
    if (!$("#video").paused) $("#player").classList.add("ui-off");
  }, 2800);
}

function saveProgress() {
  const item = state.current;
  const video = $("#video");
  if (!item || !video.duration) return;
  state.progress[item.key] = video.currentTime;
  if (!item.duration) {
    item.duration = video.duration;
    DB.put(item).catch(() => {});
  }
  Store.write("progress", state.progress);
}

function mediaSession(item) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.name,
      artist: "Shalosh",
      artwork: item.cover ? [{ src: thumbURL(item.cover), sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => $("#video").play());
    navigator.mediaSession.setActionHandler("pause", () => $("#video").pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => nudge(-10));
    navigator.mediaSession.setActionHandler("seekforward", () => nudge(10));
  } catch { /* not supported here */ }
}

function nudge(seconds) {
  const video = $("#video");
  video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
  armHide();
}

/* ------------------------------------------------------------- wire */

function wire() {
  /* tabs */
  $$(".tab").forEach(tab => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));
  window.addEventListener("resize", moveInk);
  window.addEventListener("orientationchange", () => setTimeout(moveInk, 120));

  /* files */
  $("#add-btn").addEventListener("click", () => $("#filepick").click());
  $("#filepick").addEventListener("change", event => {
    addFiles(event.target.files);
    event.target.value = "";
  });
  $("#imp-done").addEventListener("click", () => Imp.close());
  $("#storage-btn").addEventListener("click", async () => {
    await quota();
    toast($("#imp-quota").textContent || "Storage unknown on this device");
  });

  /* sheet */
  $("#sheet").addEventListener("submit", saveWord);
  $("#sheet-cancel").addEventListener("click", closeSheet);
  $("#sheet-bg").addEventListener("click", closeSheet);
  $("#sheet-del").addEventListener("click", removeWord);
  $("#f-he").addEventListener("input", e => renderSuggestions(e.target.value));
  $("#f-en").addEventListener("input", e => { if (!$("#f-he").value) renderSuggestions(e.target.value); });

  /* player */
  const video = $("#video");
  $("#back-btn").addEventListener("click", closePlayer);
  $("#play-btn").addEventListener("click", () => (video.paused ? video.play() : video.pause()));
  $("#back10").addEventListener("click", () => nudge(-10));
  $("#fwd10").addEventListener("click", () => nudge(10));
  $("#full-btn").addEventListener("click", toggleFullscreen);
  $("#lock-btn").addEventListener("click", () => {
    setLocked(true);
    toast("Controls locked");
  });
  $("#unlock-btn").addEventListener("click", () => setLocked(false));
  $("#subs-btn").addEventListener("click", subtitlePanel);
  $("#speed-btn").addEventListener("click", speedPanel);
  $("#bright-btn").addEventListener("click", () => openSlider("bright"));
  $("#vol-btn").addEventListener("click", () => openSlider("volume"));
  $("#panel-close").addEventListener("click", closePanel);
  $("#panel-bg").addEventListener("click", closePanel);

  $("#s-range").addEventListener("input", event => {
    const v = Number(event.target.value) / 100;
    if (sliderKind === "bright") { bright = v; applyBright(); }
    else { volume = v; applyVolume(); }
    $("#s-val").textContent = event.target.value + "%";
    nudgeSliderTimer();
  });
  $("#s-range").addEventListener("change", () => {
    Store.write("bright", bright);
    Store.write("volume", volume);
  });

  /* VLC-style gestures: swipe up and down on the left for brightness and
     on the right for volume, sideways to scrub, double tap to skip. */
  const stage = $("#stage");
  let g = null;

  stage.addEventListener("pointerdown", event => {
    if (event.target.closest(".chrome") || event.target.closest("#today") ||
        event.target.closest(".unlock")) return;
    g = {
      x: event.clientX, y: event.clientY, at: Date.now(),
      axis: null,
      right: event.clientX > stage.clientWidth / 2,
      bright0: bright, volume0: volume, time0: video.currentTime,
    };
  });

  stage.addEventListener("pointermove", event => {
    if (!g || locked) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      g.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      if (g.axis === "y") closeSlider();
    }

    if (g.axis === "y") {
      const span = Math.max(160, stage.clientHeight * 0.65);
      const step = -dy / span;
      if (g.right) {
        volume = clamp(g.volume0 + step * 1.5, 0, 1.5);
        applyVolume();
        hud("volume", volume / 1.5, Math.round(volume * 100) + "%");
      } else {
        bright = clamp(g.bright0 + step * 1.6, 0.2, 1.8);
        applyBright();
        hud("bright", (bright - 0.2) / 1.6, Math.round(bright * 100) + "%");
      }
    } else {
      const span = Math.max(200, stage.clientWidth);
      g.seek = clamp(g.time0 + (dx / span) * Math.min(video.duration || 0, 180),
                     0, video.duration || 0);
      const delta = Math.round(g.seek - g.time0);
      hud("seek", video.duration ? g.seek / video.duration : 0,
          (delta >= 0 ? "+" : "−") + fmt(Math.abs(delta)));
    }
  });

  stage.addEventListener("pointerup", event => {
    if (!g) return;
    const moved = g.axis !== null;
    const quick = Date.now() - g.at < 320;
    const held = g;
    g = null;

    if (moved) {
      if (held.axis === "x" && held.seek != null) { video.currentTime = held.seek; renderCue(true); }
      if (held.axis === "y") {
        Store.write("bright", bright);
        Store.write("volume", volume);
      }
      armHide();
      return;
    }
    if (!quick) return;
    if (locked) { showChrome(); armHide(); return; }

    const now = Date.now();
    if (now - lastTap < 300) {                       // double tap: skip
      const side = event.clientX < stage.clientWidth / 2 ? -10 : 10;
      nudge(side);
      hud("seek", video.duration ? video.currentTime / video.duration : 0,
          (side < 0 ? "−" : "+") + "10s");
      lastTap = 0;
      return;
    }
    closeSlider();
    $("#player").classList.contains("ui-off") ? armHide() : $("#player").classList.add("ui-off");
    lastTap = now;
  });

  stage.addEventListener("pointercancel", () => { g = null; });

  video.addEventListener("play", () => { setPlayIcon(true); armHide(); });
  video.addEventListener("pause", () => { setPlayIcon(false); showChrome(); saveProgress(); });
  video.addEventListener("ended", () => { setPlayIcon(false); showChrome(); });
  video.addEventListener("timeupdate", () => {
    const d = video.duration || 0;
    const p = d ? (video.currentTime / d) * 100 : 0;
    $("#fill").style.width = p + "%";
    $("#knob").style.left = p + "%";
    if (!dragging) $("#seek").value = Math.round(p * 10);
    $("#t-now").textContent = fmt(video.currentTime);
    $("#t-left").textContent = "-" + fmt(d - video.currentTime);
    renderCue(false);
    if (Math.floor(video.currentTime) % 5 === 0) saveProgress();
  });
  video.addEventListener("seeked", () => renderCue(true));
  video.addEventListener("loadedmetadata", syncCC);

  /* scrubbing */
  const seek = $("#seek");
  let dragging = false;
  const start = () => { dragging = true; $("#scrub").classList.add("dragging"); showChrome(); };
  const end = () => { dragging = false; $("#scrub").classList.remove("dragging"); armHide(); };
  seek.addEventListener("pointerdown", start);
  seek.addEventListener("pointerup", end);
  seek.addEventListener("pointercancel", end);
  seek.addEventListener("input", () => {
    const d = video.duration || 0;
    const p = seek.value / 1000;
    $("#fill").style.width = p * 100 + "%";
    $("#knob").style.left = p * 100 + "%";
    $("#t-now").textContent = fmt(p * d);
    if (!dragging) start();
  });
  seek.addEventListener("change", () => {
    video.currentTime = (seek.value / 1000) * (video.duration || 0);
    end();
  });

  /* keep the buffered stripe behind the scrubber honest */
  video.addEventListener("progress", () => {
    const d = video.duration || 0;
    const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    $("#buf").style.width = d ? (end / d) * 100 + "%" : "0%";
  });

  /* keyboard, for testing on a laptop */
  document.addEventListener("keydown", event => {
    if (event.target.matches("input")) {
      if (event.key === "Escape") closeSheet();
      return;
    }
    if ($("#player").hidden) return;
    if (event.key === " ") { event.preventDefault(); video.paused ? video.play() : video.pause(); }
    if (event.key === "ArrowLeft") nudge(-10);
    if (event.key === "ArrowRight") nudge(10);
    if (event.key === "c") cycleCC();
    if (event.key === "f") toggleFullscreen();
    if (event.key === "ArrowUp") { volume = clamp(volume + 0.1, 0, 1.5); applyVolume(); hud("volume", volume / 1.5, Math.round(volume * 100) + "%"); }
    if (event.key === "ArrowDown") { volume = clamp(volume - 0.1, 0, 1.5); applyVolume(); hud("volume", volume / 1.5, Math.round(volume * 100) + "%"); }
    if (event.key === "Escape") closePlayer();
  });

  /* a new day, even if the app was left open */
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && rollover()) { renderSlots(); renderLibrary(); }
  });
  setInterval(() => { if (rollover()) { renderSlots(); renderLibrary(); } }, 60000);
}

function setPlayIcon(playing) {
  $("#play-icon").innerHTML = playing
    ? '<path d="M8 5h3v14H8zM13 5h3v14h-3z"/>'
    : '<path d="M7 4l13 8-13 8z"/>';
  $("#play-btn").setAttribute("aria-label", playing ? "Pause" : "Play");
}

function selectTab(name) {
  $$(".tab").forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle("is-on", on);
    t.setAttribute("aria-selected", on);
  });
  state.tab = name;
  moveInk();
  renderLibrary();
}

function moveInk() {
  const on = $(".tab.is-on");
  const ink = $("#tab-ink");
  ink.style.width = on.offsetWidth + "px";
  ink.style.transform = `translateX(${on.offsetLeft - 4}px)`;
}

async function updateStorage() {
  if (!navigator.storage || !navigator.storage.estimate) return;
  try {
    const { usage } = await navigator.storage.estimate();
    $("#storage-text").textContent = usage > 1e9
      ? (usage / 1e9).toFixed(1) + " GB"
      : Math.max(0, Math.round(usage / 1e6)) + " MB";
  } catch { /* nothing to show */ }
}

/* ------------------------------------------------------------- boot */

async function boot() {
  rollover();
  renderSlots();
  wire();
  moveInk();

  try {
    state.items = (await DB.all()) || [];
  } catch {
    toast("Storage is blocked in this browser");
  }
  renderLibrary();
  updateStorage();

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
