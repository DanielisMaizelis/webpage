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
          <div><b>02</b><span>Browse to iCloud Drive → Hebrew Videos.</span></div>
          <div><b>03</b><span>Select the ${state.tab === "video" ? "mp4" : "mp3"} and its .jpg cover together.</span></div>
        </div>
      </div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "grid";
  items.forEach(item => grid.appendChild(card(item)));
  main.appendChild(grid);
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
        ? `<img alt="" src="${URL.createObjectURL(item.cover)}">`
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

async function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;

  const base = name => name.replace(/\.[^.]+$/, "");
  const covers = new Map();
  const lists = new Map();
  for (const f of files) {
    if (f.type.startsWith("image/")) covers.set(base(f.name), f);
    else if (/\.json$/i.test(f.name)) lists.set(base(f.name), f);
  }

  let added = 0, skipped = 0;
  for (const f of files) {
    const kind = f.type.startsWith("video/") ? "video"
               : f.type.startsWith("audio/") ? "audio"
               : /\.(mp4|m4v|mov|mkv|webm)$/i.test(f.name) ? "video"
               : /\.(mp3|m4a|aac|wav|opus)$/i.test(f.name) ? "audio" : null;
    if (!kind) continue;

    const key = `${f.name}:${f.size}`;
    if (state.items.some(i => i.key === key)) { skipped++; continue; }

    toast(`Copying ${base(f.name)}…`);
    const record = {
      key, kind, name: clean(base(f.name)) || base(f.name), blob: f, added: Date.now(), duration: 0,
      cover: covers.get(base(f.name)) || null,
      words: lists.has(base(f.name)) ? normaliseWords(await readJSON(lists.get(base(f.name)))) : null,
    };
    Object.assign(record, await probe(f, kind, !record.cover));
    try {
      await DB.put(record);
      state.items.push(record);
      added++;
    } catch (err) {
      toast("Not enough room on the device for that one");
      break;
    }
  }

  renderLibrary();
  updateStorage();
  if (added) toast(`${added} added${skipped ? `, ${skipped} already here` : ""}`);
  else if (skipped) toast("Already on this device");
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
  return out.filter(w => !seen.has(w.he) && seen.add(w.he)).slice(0, 2000);
}

/** Duration, and a poster frame for a video with no cover beside it. */
function probe(file, kind, wantPoster) {
  return new Promise(resolve => {
    const el = document.createElement(kind === "video" ? "video" : "audio");
    const url = URL.createObjectURL(file);
    const done = extra => { URL.revokeObjectURL(url); resolve(extra || {}); };
    const bail = setTimeout(() => done(), 9000);

    el.preload = "metadata";
    el.muted = true;
    el.playsInline = true;
    el.src = url;

    el.onerror = () => { clearTimeout(bail); done(); };
    el.onloadedmetadata = () => {
      const duration = el.duration || 0;
      if (kind !== "video" || !wantPoster) { clearTimeout(bail); return done({ duration }); }
      el.currentTime = Math.min(duration * 0.1 || 1, 8);
      el.onseeked = () => {
        clearTimeout(bail);
        try {
          const canvas = document.createElement("canvas");
          const scale = 480 / (el.videoWidth || 480);
          canvas.width = 480;
          canvas.height = Math.round((el.videoHeight || 270) * scale);
          canvas.getContext("2d").drawImage(el, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => done({ duration, cover: blob || null }), "image/jpeg", 0.8);
        } catch { done({ duration }); }
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
    const cover = URL.createObjectURL(item.cover);
    $("#art-img").src = cover;
    art.style.background = `url(${cover}) center/cover`;
    art.hidden = false;
  } else {
    art.hidden = true;
  }

  player.hidden = false;
  document.body.style.overflow = "hidden";
  $("#player .stage").insertBefore($("#today"), $("#chrome"));   // the words ride on top

  const seen = state.progress[item.key];
  if (seen && (!item.duration || seen < item.duration - 10)) video.currentTime = seen;

  video.play().then(() => armHide()).catch(() => showChrome());
  mediaSession(item);
}

function closePlayer() {
  const video = $("#video");
  saveProgress();
  video.pause();
  video.removeAttribute("src");
  video.load();
  if (url) { URL.revokeObjectURL(url); url = null; }
  $("#player").hidden = true;
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
      artwork: item.cover ? [{ src: URL.createObjectURL(item.cover), sizes: "512x512" }] : [],
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
  $$(".tab").forEach(tab => tab.addEventListener("click", () => {
    $$(".tab").forEach(t => { t.classList.toggle("is-on", t === tab); t.setAttribute("aria-selected", t === tab); });
    state.tab = tab.dataset.tab;
    moveInk();
    renderLibrary();
  }));
  window.addEventListener("resize", moveInk);

  /* files */
  $("#add-btn").addEventListener("click", () => $("#filepick").click());
  $("#filepick").addEventListener("change", event => {
    addFiles(event.target.files);
    event.target.value = "";
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

  $("#stage").addEventListener("click", event => {
    if (event.target.closest(".chrome") || event.target.closest("#today")) return;
    const now = Date.now();
    if (now - lastTap < 300) {                       // double tap: skip
      const side = event.clientX < window.innerWidth / 2 ? -10 : 10;
      nudge(side);
      toast(side < 0 ? "− 10 seconds" : "+ 10 seconds");
    } else {
      $("#player").classList.contains("ui-off") ? armHide() : $("#player").classList.add("ui-off");
    }
    lastTap = now;
  });

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
    if (Math.floor(video.currentTime) % 5 === 0) saveProgress();
  });

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

  const rates = [1, 1.25, 1.5, 0.75];
  let rateAt = 0;
  $("#rate-btn").addEventListener("click", () => {
    rateAt = (rateAt + 1) % rates.length;
    video.playbackRate = rates[rateAt];
    $("#rate-btn").textContent = rates[rateAt] + "×";
    armHide();
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
