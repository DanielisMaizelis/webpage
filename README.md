# Danielis Maizelis — Personal Website

**Frontend**
[![HTML5](https://img.shields.io/badge/HTML5-E34F26.svg?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6.svg?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-F7DF1E.svg?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![GSAP](https://img.shields.io/badge/GSAP-3.12-88CE02.svg?logo=greensock&logoColor=white)](https://gsap.com/)

**Media pipeline**
[![Python](https://img.shields.io/badge/Python-3.8+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-media-007808.svg?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![faster-whisper](https://img.shields.io/badge/faster--whisper-captions-ff6f00.svg)](https://github.com/SYSTRAN/faster-whisper)
[![CTranslate2](https://img.shields.io/badge/CTranslate2-inference-4B8BBE.svg)](https://github.com/OpenNMT/CTranslate2)
[![libass](https://img.shields.io/badge/libass-subtitles-555.svg)](https://github.com/libass/libass)

**Dev & deploy**
[![Bash](https://img.shields.io/badge/Bash-shell-4EAA25.svg?logo=gnubash&logoColor=white)](https://www.gnu.org/software/bash/)
[![Git](https://img.shields.io/badge/Git-vcs-F05032.svg?logo=git&logoColor=white)](https://git-scm.com/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-deployed-222.svg?logo=github&logoColor=white)](https://danielismaizelis.github.io/webpage/)
[![Linux](https://img.shields.io/badge/Built%20on-Linux-FCC624.svg?logo=linux&logoColor=black)](https://www.kernel.org/)
[![Markdown](https://img.shields.io/badge/Markdown-docs-000000.svg?logo=markdown&logoColor=white)](https://commonmark.org/)

A portfolio of the projects I've built — drones, terminal apps, embedded systems, mobile apps — written by hand in plain HTML/CSS/JS with rounded cards and motion that carries you from one project into the next.

🔗 **Live:** [danielismaizelis.github.io/webpage](https://danielismaizelis.github.io/webpage/)

---

## Pages

| File | What's there |
|---|---|
| `index.html` | Landing — intro video, résumé bento (experience, education, skills), selected work |
| `rl-forest.html` | RL drone agent flying through a procedural forest (AirSim + PPO) |
| `danieltube.html` | Terminal YouTube client with word-by-word translated subtitles |
| `class-ab-amp.html` | Class AB amplifier — PCB on the bench, video with a sound toggle |
| `gta-radio.html` | GTA Radio — car radio PCB + firmware (ongoing, placeholder) |
| `water-tracker.html` | Water Tracker — PCB + firmware (ongoing, placeholder) |
| `other-projects.html` | Quad CAN tester, Subaru dashboard, Axis parking app, Robocar |
| `main.html` | Redirect to `index.html` for old links |

---

## Stack

- **Markup & style** — hand-written HTML5 + CSS3: a rounded, card-based system in `styles.css` (bento cards, split media/text rows, full-bleed video panels, pill nav that becomes a bottom tab bar on small screens)
- **Motion** — [GSAP](https://gsap.com/) + ScrollTrigger in `site.js`: the intro video card that opens to the cover, project cards that glide to the centre and expand into the next page's hero (handing over the exact video frame), scroll-scrubbed hero and word-by-word text reveals
- **Media pipeline** — [FFmpeg](https://ffmpeg.org/) for web-optimized H.264 (`-crf 26–30 -preset slow -movflags +faststart`)
- **Captioning** — `caption.py` uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) to transcribe audio and burn subtitles directly into the video via FFmpeg's `subtitles=` filter
- **Hosting** — [GitHub Pages](https://pages.github.com/), static, free, instant deploy on push

---

## Layout

```
PersonalWebsite/
├── index.html              # Landing (GitHub Pages root)
├── rl-forest.html          # Project 01
├── danieltube.html         # Project 02
├── class-ab-amp.html       # Project 03
├── gta-radio.html          # Project 04
├── water-tracker.html      # Project 05
├── other-projects.html     # Smaller builds
├── main.html               # → index.html
├── styles.css              # Design system
├── site.js                 # GSAP motion + transitions
├── caption.py              # Whisper → SRT → burned-in captions
└── media/                  # videos, logos, cv.pdf, thesis.pdf
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
