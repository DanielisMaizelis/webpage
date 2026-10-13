// Site-wide motion: intro, scroll effects, card → page transitions, cursor bubble.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const frame = document.getElementById("hero-frame");
const heroVideo = frame && frame.querySelector(".hero-video");

const navMode = window.__v2nav; // set by the inline script at the top of <body>: "expand" | undefined

const play = v => v.play().catch(() => {});

// Arrived via an expanding project card: the inline script already painted the
// card's last frame as the hero background; resume the video on that same frame,
// and only show it once it's there so nothing flashes.
if (navMode === "expand" && heroVideo) {
  let t = 0;
  try { t = parseFloat(sessionStorage.getItem("v2-time")) || 0; sessionStorage.removeItem("v2-time"); } catch (e) {}
  const reveal = () => { heroVideo.style.opacity = 1; };
  if (t > 0) {
    heroVideo.addEventListener("seeked", reveal, { once: true });
    const seek = () => { heroVideo.currentTime = t; };
    if (heroVideo.readyState >= 1) seek(); else heroVideo.addEventListener("loadedmetadata", seek, { once: true });
  } else {
    heroVideo.addEventListener("playing", reveal, { once: true });
  }
  setTimeout(reveal, 2000);
}

// ---------- lazy videos: only play while on screen ----------
// Home cards play on hover on desktop (featured ones also in view); everything else plays in view.
const inViewVideos = finePointer
  ? document.querySelectorAll(".project-xl video, .split-media video, .bleed video, .next video")
  : document.querySelectorAll(".project video, .split-media video, .bleed video, .next video");
const videoIO = new IntersectionObserver(entries => {
  entries.forEach(e => (e.isIntersecting ? play(e.target) : e.target.pause()));
}, { threshold: 0.25 });
inViewVideos.forEach(v => videoIO.observe(v));

if (finePointer) {
  document.querySelectorAll(".project:not(.project-xl)").forEach(card => {
    const v = card.querySelector("video");
    card.addEventListener("mouseenter", () => play(v));
    card.addEventListener("mouseleave", () => v.pause());
  });
}

// Without GSAP (blocked CDN, offline) just show the page
if (!window.gsap || !window.ScrollTrigger) {
  document.documentElement.classList.remove("from-expand", "intro-pending");
  if (heroVideo) heroVideo.style.transform = "none";
} else {
  initMotion();
}

function initMotion() {
  gsap.registerPlugin(ScrollTrigger);

  splitWords();

  if (reduceMotion) {
    document.documentElement.classList.remove("from-expand", "intro-pending");
    if (heroVideo) gsap.set(heroVideo, { scale: 1 });
    document.querySelectorAll(".w").forEach(w => (w.style.opacity = 1));
    initNav();
    return;
  }

  startIntro();
  initScroll();
  initNav();
  initCursor();
  initTransitions();
}

// Wrap each word of .reveal-words in a span for the scroll-scrubbed reveal
function splitWords() {
  const walk = node => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement("span");
          w.className = "w";
          w.textContent = part;
          frag.appendChild(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    });
  };
  document.querySelectorAll(".reveal-words").forEach(walk);
}

// ---------- intro: rounded video card opens up, title slides in ----------
function startIntro() {
  const tl = gsap.timeline({ defaults: { ease: "expo.inOut" }, onComplete: () => ScrollTrigger.refresh() });

  if (!frame) return;
  // The card already grew into this hero on the previous page — nothing to reveal
  if (navMode === "expand") {
    gsap.set(heroVideo, { scale: 1 });
    gsap.set(".hero-title .line > span", { yPercent: 110 });
    gsap.timeline({ delay: 0.05, onComplete: () => document.documentElement.classList.remove("from-expand") })
      .to(".nav, .hero-top, .hero-title, .hero-bottom", { opacity: 1, duration: 0.01 })
      .to(".hero-title .line > span", { yPercent: 0, duration: 1.1, stagger: 0.08, ease: "expo.out" })
      .from(".nav > *, .hero-top > *, .hero-bottom > *", { y: 16, opacity: 0, duration: 0.8, stagger: 0.04, ease: "power3.out" }, "<0.15");
    return;
  }
  const root = document.documentElement;
  // Skip the reveal if we landed mid-page (e.g. other-projects.html#robocar)
  if (window.scrollY > window.innerHeight * 0.5) {
    if (heroVideo) gsap.set(heroVideo, { scale: 1 });
    root.classList.remove("intro-pending");
    return;
  }

  // Collection pages (Other Projects) and pages without a video yet skip the
  // card intro — that one belongs to the individual project pages. Just bring the text in.
  if (!heroVideo || frame.hasAttribute("data-no-intro")) {
    if (heroVideo) gsap.set(heroVideo, { scale: 1 });
    gsap.set(".hero-title .line > span", { yPercent: 110 });
    root.classList.remove("intro-pending");
    tl.to(".hero-title .line > span", { yPercent: 0, duration: 1.1, stagger: 0.08, ease: "expo.out" }, 0.1)
      .from(".hero-top > *, .hero-bottom > *, .nav > *", { y: 20, opacity: 0, duration: 0.8, stagger: 0.05, ease: "power3.out" }, "<0.2");
    return;
  }

  // Same mechanism as a project card opening: the hero video lifts into a real
  // rounded box in the centre, says hello, then grows to exactly the hero frame
  // and drops back into it.
  const vw = window.innerWidth, vh = window.innerHeight;
  const gutter = parseFloat(getComputedStyle(document.querySelector(".hero")).paddingTop) || 16;
  const finalRadius = getComputedStyle(root).getPropertyValue("--r-xl").trim();
  const midW = vw < 720 ? vw * 0.7 : Math.min(Math.max(vw * 0.42, 420), vw - gutter * 4);
  const midH = vw < 720 ? midW * 1.25 : midW * 0.625;

  const box = document.createElement("div");
  box.className = "expander";
  const shade = document.createElement("div");
  shade.className = "expander-shade";
  const title = document.createElement("div");
  title.className = "expander-title";
  title.innerHTML = "<span><span></span></span>";
  const titleText = title.querySelector("span span");
  titleText.textContent = frame.dataset.intro || "Hey there!";
  box.append(heroVideo, shade, title);
  document.body.appendChild(box);
  gsap.set(heroVideo, { scale: 1 });
  play(heroVideo);

  gsap.set(box, {
    top: (vh - midH) / 2, left: (vw - midW) / 2, width: midW, height: midH,
    borderRadius: 22, opacity: 0, y: 40
  });
  gsap.set(frame, { opacity: 0 });
  gsap.set(".hero-title .line > span", { yPercent: 110 });
  gsap.set(".hero-top > *, .hero-bottom > *, .nav > *", { y: 20, opacity: 0 });
  root.classList.remove("intro-pending");

  tl.to(box, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.1)
    .fromTo(titleText, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: "expo.out" }, 0.35)
    .to(title, { opacity: 0, duration: 0.35, ease: "power2.in" }, 1.15)
    .to(box, {
      // Measured when the grow starts, so a restored scroll position still lines up
      top: () => frame.getBoundingClientRect().top,
      left: () => frame.getBoundingClientRect().left,
      width: () => frame.getBoundingClientRect().width,
      height: () => frame.getBoundingClientRect().height,
      borderRadius: finalRadius,
      duration: 0.95,
      ease: "expo.inOut"
    }, 1.0)
    .to(shade, { opacity: 1, duration: 0.6, ease: "power1.inOut" }, 1.35)
    .add(() => {
      // Hand the video back to the hero; the box is exactly on top of it, so this is invisible
      frame.prepend(heroVideo);
      play(heroVideo);
      gsap.set(frame, { opacity: 1 });
      box.remove();
    })
    .to(".hero-title .line > span", { yPercent: 0, duration: 1.1, stagger: 0.08, ease: "expo.out" })
    .to(".hero-top > *, .hero-bottom > *, .nav > *", { y: 0, opacity: 1, duration: 0.8, stagger: 0.05, ease: "power3.out" }, "<0.2");
}

// ---------- scroll effects ----------
function initScroll() {
  if (frame) {
    // Explicit start values: at the top the cover is always exactly full size,
    // whatever state it was in when the trigger was measured
    const st = { trigger: ".hero", start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true };
    const radius = getComputedStyle(document.documentElement).getPropertyValue("--r-xl").trim();
    gsap.fromTo(frame, { scale: 1, borderRadius: radius }, { scale: 0.9, borderRadius: 48, ease: "none", immediateRender: false, scrollTrigger: st });
    gsap.fromTo(".hero-title", { yPercent: 0 }, { yPercent: -30, ease: "none", immediateRender: false, scrollTrigger: { ...st } });
  }

  // Statement lights up word by word
  document.querySelectorAll(".reveal-words").forEach(el => {
    gsap.to(el.querySelectorAll(".w"), {
      opacity: 1,
      stagger: 0.05,
      ease: "none",
      scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 45%", scrub: true }
    });
  });

  // Cards rise in
  gsap.utils.toArray(".reveal").forEach(el => {
    gsap.from(el, {
      y: 80,
      opacity: 0,
      scale: 0.96,
      duration: 1.2,
      ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 90%" }
    });
  });

  // Full-width videos drift inside their rounded frame
  gsap.utils.toArray(".bleed").forEach(el => {
    gsap.fromTo(el.querySelector("video"), { yPercent: -6 }, {
      yPercent: 6,
      ease: "none",
      scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true }
    });
  });
}

// ---------- Daniel Tube subtitle demo: words build up as they're "spoken" ----------
document.querySelectorAll(".sub-demo").forEach(demo => {
  if (reduceMotion) return;
  const cols = Array.from(demo.querySelectorAll(".col"));
  demo.classList.add("is-live");
  let i = 0;
  setInterval(() => {
    if (i === cols.length + 3) {           // hold the full line a moment, then start over
      cols.forEach(c => c.classList.remove("shown", "spoken"));
      i = 0;
      return;
    }
    cols.forEach(c => c.classList.remove("spoken"));
    if (i < cols.length) cols[i].classList.add("shown", "spoken");
    i++;
  }, 550);
});

// ---------- sound toggles: one video with sound at a time ----------
const soundBtns = Array.from(document.querySelectorAll(".sound-btn"));
const soundVideo = btn => {
  const scope = btn.closest(".project-media, .split-media, .hero-frame");
  return scope && scope.querySelector("video");
};
function setSound(btn, on) {
  btn.classList.toggle("is-on", on);
  btn.setAttribute("aria-pressed", String(on));
  btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
  btn.querySelector(".sound-label").textContent = on ? "Sound on" : "Sound off";
}
soundBtns.forEach(btn => {
  const toggle = e => {
    // The button can sit inside a project card link — don't navigate
    e.preventDefault();
    e.stopPropagation();
    const v = soundVideo(btn);
    if (!v) return;
    const on = v.muted;
    soundBtns.forEach(other => {
      const ov = soundVideo(other);
      if (ov && ov !== v) ov.muted = true;
      setSound(other, false);
    });
    v.muted = !on;
    if (on) { v.volume = 1; play(v); }
    setSound(btn, on);
  };
  btn.addEventListener("click", toggle);
  btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") toggle(e); });
});

// ---------- in-page anchors scroll smoothly ----------
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener("click", e => {
    const id = a.getAttribute("href");
    const target = id === "#" ? null : document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    history.pushState(null, "", id);
  });
});

// ---------- nav: highlight current section (home anchors only) ----------
function initNav() {
  const navLinks = Array.from(document.querySelectorAll('.nav-pill a[href^="#"]'));
  if (!navLinks.length) return;
  navLinks.forEach(a => {
    const sec = document.querySelector(a.getAttribute("href"));
    if (!sec) return;
    ScrollTrigger.create({
      trigger: sec,
      start: "top 50%",
      end: "bottom 50%",
      onToggle: self => a.classList.toggle("is-active", self.isActive)
    });
  });
}

// ---------- custom cursor ----------
function initCursor() {
  if (!finePointer) return;
  const cursor = document.createElement("div");
  cursor.className = "cursor";
  cursor.innerHTML = "<span></span>";
  document.body.appendChild(cursor);
  const label = cursor.firstChild;
  gsap.set(cursor, { xPercent: -50, yPercent: -50 });
  const xTo = gsap.quickTo(cursor, "x", { duration: 0.35, ease: "power3" });
  const yTo = gsap.quickTo(cursor, "y", { duration: 0.35, ease: "power3" });
  window.addEventListener("mousemove", e => { xTo(e.clientX); yTo(e.clientY); });

  document.querySelectorAll("a, button").forEach(el => {
    el.addEventListener("mouseenter", () => {
      const text = el.dataset.cursor;
      if (text) { label.textContent = text; cursor.classList.add("is-label"); }
    });
    el.addEventListener("mouseleave", () => cursor.classList.remove("is-label"));
  });
}

// ---------- featured project cards expand into the next page ----------
function initTransitions() {
  document.querySelectorAll(".project-xl").forEach(link => {
    link.addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      expandCard(link);
    });
  });

  // Coming back via the browser's back button: put the card back together
  window.addEventListener("pageshow", e => {
    if (!e.persisted) return;
    if (expanded) expanded.restore();
    gsap.set(".nav, main", { opacity: 1 });
  });
}

// Featured project: the card's own (already playing) video lifts out of the grid
// and grows to exactly the next page's hero frame while the rest of the page
// fades away. Its last frame is handed over so the new page starts on it.
let expanded = null;

function expandCard(link) {
  if (expanded) return;
  const media = link.querySelector(".project-media");
  const video = media.querySelector("video");
  const rect = media.getBoundingClientRect();
  const hero = document.querySelector(".hero");
  const gutter = hero ? parseFloat(getComputedStyle(hero).paddingTop) : 16;
  const finalRadius = getComputedStyle(document.documentElement).getPropertyValue("--r-xl").trim();

  const box = document.createElement("div");
  box.className = "expander";
  const shade = document.createElement("div");
  shade.className = "expander-shade";
  gsap.set(box, {
    top: rect.top, left: rect.left, width: rect.width, height: rect.height,
    borderRadius: getComputedStyle(media).borderTopLeftRadius
  });
  document.body.appendChild(box);
  // Moving the element keeps its decoded frame — no reload, no black flash
  box.append(video, shade);
  play(video);
  videoIO.unobserve(video);

  expanded = {
    restore() {
      media.prepend(video);
      box.remove();
      gsap.set(link, { scale: 1 });
      videoIO.observe(video);
      expanded = null;
    }
  };

  // Project name rides along in the middle of the card during the glide
  const title = document.createElement("div");
  title.className = "expander-title";
  title.innerHTML = "<span><span></span></span>";
  const titleText = title.querySelector("span span");
  titleText.textContent = link.querySelector("h3").textContent;
  box.appendChild(title);

  // Beat 1: card glides to the centre of the screen. Beat 2: it opens up to the cover.
  const vw = window.innerWidth, vh = window.innerHeight;
  const midW = Math.min(Math.max(rect.width, vw * 0.42), vw - gutter * 4);
  const midH = midW * (rect.height / rect.width);

  gsap.timeline({ onComplete: () => handOff(link.href, video) })
    .to(link, { scale: 0.97, duration: 0.15, ease: "power2.out" }, 0)
    .to(".nav", { opacity: 0, duration: 0.4, ease: "power2.out" }, 0)
    .to("main", { opacity: 0, duration: 0.5, ease: "power2.out" }, 0.05)
    .to(box, {
      top: (vh - midH) / 2, left: (vw - midW) / 2,
      width: midW, height: midH,
      duration: 0.7,
      ease: "power3.inOut"
    }, 0)
    .fromTo(titleText, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: "expo.out" }, 0.35)
    .to(title, { opacity: 0, duration: 0.35, ease: "power2.in" }, 0.95)
    .to(box, {
      top: gutter, left: gutter,
      width: vw - gutter * 2,
      height: vh - gutter * 2,
      borderRadius: finalRadius,
      duration: 0.95,
      ease: "expo.inOut"
    }, 0.8)
    .to(shade, { opacity: 1, duration: 0.6, ease: "power1.inOut" }, 1.15);
}

function handOff(href, video) {
  try {
    sessionStorage.setItem("v2-nav", "expand");
    sessionStorage.setItem("v2-time", String(video.currentTime));
    // Snapshot the current frame for the next page to paint before its video decodes
    const w = Math.min(video.videoWidth, 1280);
    if (w) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = Math.round(video.videoHeight * (w / video.videoWidth));
      c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
      sessionStorage.setItem("v2-poster", c.toDataURL("image/jpeg", 0.82));
    }
  } catch (err) {
    try { sessionStorage.removeItem("v2-poster"); } catch (e) {}
  }
  location.href = href;
}
