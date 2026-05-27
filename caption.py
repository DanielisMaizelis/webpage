#!/usr/bin/env python3
"""
caption.py — transcribe a source video's audio (faster-whisper) and burn the
captions into a web-ready mp4, à la Daniel Tube.

Usage:
    .caption-venv/bin/python caption.py \
        --source ~/Downloads/quad-can2.MOV \
        --target media/quad-can-web.mp4 \
        [--model small] [--lang en] [--keep-srt]

The --source must be the original clip WITH audio (the web target is muted).
"""
import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def run(cmd):
    print("·", " ".join(str(c) for c in cmd))
    subprocess.run(cmd, check=True)


def ts(seconds: float) -> str:
    """Seconds -> SRT timestamp HH:MM:SS,mmm."""
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def extract_audio(source: Path, wav: Path):
    run(["ffmpeg", "-y", "-i", str(source), "-vn",
         "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)])


def transcribe(wav: Path, model_name: str, lang: str | None) -> str:
    from faster_whisper import WhisperModel
    print(f"Loading model '{model_name}' …")
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(str(wav), language=lang, vad_filter=True)
    print(f"Detected language: {info.language} (p={info.language_probability:.2f})")
    lines = []
    for i, seg in enumerate(segments, 1):
        text = seg.text.strip()
        print(f"  [{ts(seg.start)} -> {ts(seg.end)}] {text}")
        lines.append(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{text}\n")
    return "\n".join(lines)


def burn(target: Path, srt: Path, out: Path):
    # libass styling: clean white text, semi-transparent box, bottom-centered.
    style = ("FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00FFFFFF,"
             "BorderStyle=3,BackColour=&H80000000,Outline=0,Shadow=0,"
             "Alignment=2,MarginV=30")
    vf = f"subtitles='{srt.as_posix()}':force_style='{style}'"
    run(["ffmpeg", "-y", "-i", str(target), "-vf", vf,
         "-c:v", "libx264", "-preset", "slow", "-crf", "26",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(out)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="original clip WITH audio")
    ap.add_argument("--target", required=True, help="muted web mp4 to caption")
    ap.add_argument("--model", default="small", help="tiny|base|small|medium|large-v3")
    ap.add_argument("--lang", default=None, help="force language, e.g. en (else auto)")
    ap.add_argument("--keep-srt", action="store_true", help="write <target>.srt next to target")
    args = ap.parse_args()

    source = Path(os.path.expanduser(args.source)).resolve()
    target = Path(os.path.expanduser(args.target)).resolve()
    if not source.exists():
        sys.exit(f"source not found: {source}")
    if not target.exists():
        sys.exit(f"target not found: {target}")

    srt_path = target.with_suffix(".srt") if args.keep_srt else None

    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "audio.wav"
        srt = srt_path or (Path(td) / "subs.srt")
        extract_audio(source, wav)
        srt_text = transcribe(wav, args.model, args.lang)
        if not srt_text.strip():
            sys.exit("no speech transcribed — aborting.")
        srt.write_text(srt_text, encoding="utf-8")
        out = target.with_name(target.stem + ".captioned.mp4")
        burn(target, srt, out)
        os.replace(out, target)   # atomic swap into place
        print(f"\n✓ captions burned into {target}")
        if srt_path:
            print(f"✓ subtitles saved to {srt_path}")


if __name__ == "__main__":
    main()
