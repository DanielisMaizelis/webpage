// Smooth scroll (Lenis) disabled — using native scroll.
// const lenis = new Lenis({
//   duration: 1.2,
//   easing: t => 1 - Math.pow(1 - t, 3),
//   smoothWheel: true,
// });
// function raf(time) {
//   lenis.raf(time);
//   requestAnimationFrame(raf);
// }
// requestAnimationFrame(raf);

// Native-scroll shim so the custom scrollbar/label keep working without Lenis
const lenis = {
  get scroll() { return window.scrollY; },
  get limit() { return document.documentElement.scrollHeight - window.innerHeight; },
  on(event, cb) { if (event === "scroll") window.addEventListener("scroll", cb, { passive: true }); },
  scrollTo(target, opts = {}) {
    if (typeof target === "number") {
      window.scrollTo({ top: target, behavior: opts.immediate ? "auto" : "smooth" });
    } else if (typeof target === "string") {
      const el = document.querySelector(target);
      if (el) el.scrollIntoView({ behavior: opts.immediate ? "auto" : "smooth" });
    }
  }
};

// Custom scrollbar driven by Lenis
(function customScrollbar() {
  const bar = document.createElement("div");
  bar.className = "custom-scrollbar";
  const thumb = document.createElement("div");
  thumb.className = "custom-scrollbar-thumb";
  bar.appendChild(thumb);
  document.body.appendChild(bar);

  const label = document.createElement("div");
  label.className = "custom-scrollbar-label";
  document.body.appendChild(label);

  let trackH = window.innerHeight;
  let thumbH = 40;

  // Derive a name for each section from its eyebrow/heading
  function sectionName(sec) {
    const eb = sec.querySelector(".eyebrow-mark, .hero-eyebrow");
    if (eb && eb.textContent.trim()) return eb.textContent.trim();
    const h = sec.querySelector("h1, h2, h3");
    if (h && h.textContent.trim()) return h.textContent.trim().replace(/\s+/g, " ");
    return "";
  }

  // Pop the label out from the scrollbar, aligned with the thumb, then fade
  let hideTimer = null;
  function showLabel(text) {
    if (!text) return;
    label.textContent = text;
    const maxY = trackH - thumbH;
    const progress = lenis.limit > 0 ? lenis.scroll / lenis.limit : 0;
    label.style.top = (progress * maxY + thumbH / 2) + "px";

    gsap.killTweensOf(label);
    gsap.fromTo(label,
      { opacity: 0, x: 16 },
      { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }
    );
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      gsap.to(label, { opacity: 0, x: 16, duration: 0.4, ease: "power3.in" });
    }, 1400);
  }

  // Observe sections; pop the label when a new one becomes active
  const sections = Array.from(document.querySelectorAll("section, .image-bleed"));
  let activeSection = null;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.target !== activeSection) {
        activeSection = entry.target;
        showLabel(sectionName(entry.target));
      }
    });
  }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
  sections.forEach(s => observer.observe(s));

  function sizeThumb() {
    trackH = window.innerHeight;
    const ratio = trackH / (lenis.limit + trackH);
    thumbH = Math.max(trackH * ratio, 40);
    thumb.style.height = thumbH + "px";
  }

  function updateThumb() {
    const progress = lenis.limit > 0 ? lenis.scroll / lenis.limit : 0;
    const maxY = trackH - thumbH;
    thumb.style.transform = `translateY(${progress * maxY}px)`;
  }

  sizeThumb();
  updateThumb();
  lenis.on("scroll", updateThumb);
  window.addEventListener("resize", () => { sizeThumb(); updateThumb(); });

  // Drag to scroll
  let dragging = false;
  let startY = 0;
  let startScroll = 0;

  thumb.addEventListener("pointerdown", (e) => {
    dragging = true;
    startY = e.clientY;
    startScroll = lenis.scroll;
    thumb.classList.add("dragging");
    thumb.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const maxY = trackH - thumbH;
    const deltaPx = e.clientY - startY;
    const deltaScroll = (deltaPx / maxY) * lenis.limit;
    lenis.scrollTo(startScroll + deltaScroll, { immediate: true });
  });

  window.addEventListener("pointerup", () => {
    dragging = false;
    thumb.classList.remove("dragging");
  });
})();

// Custom black cursor (desktop / fine-pointer only)
if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const cursor = document.createElement("div");
  cursor.className = "custom-cursor";
  document.body.appendChild(cursor);
  gsap.set(cursor, { xPercent: -50, yPercent: -50 });

  window.addEventListener("mousemove", (e) => {
    gsap.to(cursor, { x: e.clientX, y: e.clientY, duration: 0.25, ease: "power3.out" });
  });

  document.querySelectorAll("a, button, .cv-btn").forEach(el => {
    el.addEventListener("mouseenter", () => cursor.classList.add("grow"));
    el.addEventListener("mouseleave", () => cursor.classList.remove("grow"));
  });
}

// Page transition overlay
const overlay = document.getElementById("page-overlay");
if (overlay) {
  gsap.set(overlay, { x: "0%" });
  gsap.to(overlay, { x: "100%", duration: 1.2, ease: "expo.inOut", delay: 0.1 });

  document.querySelectorAll('a[href$=".html"]').forEach(link => {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || link.target === "_blank") return;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      gsap.set(overlay, { x: "-100%" });
      gsap.to(overlay, {
        x: "0%",
        duration: 1,
        ease: "expo.inOut",
        onComplete: () => { window.location.href = href; }
      });
    });
  });
}
