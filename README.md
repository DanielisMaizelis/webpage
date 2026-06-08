# Danielis Maizelis — Personal Website

[![HTML5](https://img.shields.io/badge/HTML5-E34F26.svg?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6.svg?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-F7DF1E.svg?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![GSAP](https://img.shields.io/badge/GSAP-3.12-88CE02.svg?logo=greensock&logoColor=white)](https://gsap.com/)
[![Lenis](https://img.shields.io/badge/Lenis-1.1-000000.svg)](https://github.com/darkroomengineering/lenis)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-media-007808.svg?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![faster-whisper](https://img.shields.io/badge/faster--whisper-captions-ff6f00.svg)](https://github.com/SYSTRAN/faster-whisper)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-deployed-222.svg?logo=github)](https://danielismaizelis.github.io/webpage/)

An editorial-style portfolio of the projects I've built — drones, terminal apps, embedded systems, mobile apps — written by hand in plain HTML/CSS/JS so every page feels like a magazine spread, not a template.

🔗 **Live:** [danielismaizelis.github.io/webpage](https://danielismaizelis.github.io/webpage/)

---

## Pages

| File | What's there |
|---|---|
| `main.html` / `index.html` | Landing — intro, hobbies, stack |
| `rl-forest.html` | RL drone agent flying through a procedural forest (AirSim + PPO) |
| `danieltube.html` | Terminal YouTube client with Whisper-translated subtitles |
| `other-projects.html` | Quad CAN tester, Subaru dashboard, Axis parking app, Robocar |

---

## Stack

- **Markup & style** — hand-written HTML5 + CSS3 (cream/ink editorial palette, custom `.editorial` / `.row-split` / `.figure-video` system in `styles.css`)
- **Motion** — [GSAP](https://gsap.com/) for animations, [Lenis](https://github.com/darkroomengineering/lenis) for smooth scrolling (`smooth-scroll.js`)
- **Media pipeline** — [FFmpeg](https://ffmpeg.org/) for web-optimized H.264 (`-crf 30 -preset slow -movflags +faststart`)
- **Captioning** — `caption.py` uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) to transcribe audio and burn subtitles directly into the video via FFmpeg's `subtitles=` filter
- **Hosting** — [GitHub Pages](https://pages.github.com/), static, free, instant deploy on push

---

## Layout

```
PersonalWebsite/
├── index.html              # GitHub Pages root
├── main.html               # Landing
├── rl-forest.html          # Project 01
├── danieltube.html         # Project 02
├── other-projects.html     # Smaller builds
├── styles.css              # Editorial design system
├── smooth-scroll.js        # Lenis + GSAP glue
├── caption.py              # Whisper → SRT → burned-in captions
└── media/                  # videos, posters, cv.pdf, thesis.pdf
```

---

## Captioning a new video

```bash
python3 -m venv .caption-venv
.caption-venv/bin/pip install faster-whisper
.caption-venv/bin/python caption.py path/to/input.mp4 media/output-web.mp4
```

The script extracts audio with FFmpeg, transcribes with faster-whisper, writes an SRT next to the output, and burns the subtitles in with a clean DejaVu Sans style.

---

## Local preview

Any static server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

---

## Deploy

Push to `main` → GitHub Pages rebuilds automatically. No CI, no build step, no framework.

---

© 2026 Danielis Maizelis · Built in Linux
