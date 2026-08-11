from __future__ import annotations

import asyncio
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts
import imageio_ffmpeg
from mutagen.mp3 import MP3


VOICE = "fr-FR-HenriNeural"
RATE = "-4%"
PITCH = "-2Hz"
MAX_CHARS = 3_400


def split_text(text: str) -> list[str]:
    paragraphs = [paragraph.strip() for paragraph in text.split("\n\n") if paragraph.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}" if current else paragraph
        if len(candidate) <= MAX_CHARS:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        if len(paragraph) <= MAX_CHARS:
            current = paragraph
            continue

        sentences = paragraph.replace("? ", "?\n").replace("! ", "!\n").replace(". ", ".\n").splitlines()
        for sentence in sentences:
            candidate = f"{current} {sentence}".strip()
            if len(candidate) > MAX_CHARS and current:
                chunks.append(current)
                current = sentence
            else:
                current = candidate

    if current:
        chunks.append(current)

    return chunks


async def synthesize_chunk(text: str, destination: Path) -> None:
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
            await communicate.save(str(destination))
            if destination.stat().st_size == 0:
                raise RuntimeError("empty audio segment")
            return
        except Exception as error:  # network synthesis can fail transiently
            last_error = error
            if attempt < 3:
                await asyncio.sleep(attempt * 2)
    raise RuntimeError(f"unable to synthesize {destination.name}") from last_error


async def build(source: Path, output: Path) -> None:
    text = source.read_text(encoding="utf-8")
    chunks = split_text(text)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    with tempfile.TemporaryDirectory(prefix="warforge-battlefield-") as temp_name:
        temp_dir = Path(temp_name)
        segment_paths: list[Path] = []

        for index, chunk in enumerate(chunks, start=1):
            segment = temp_dir / f"segment-{index:03d}.mp3"
            print(f"Synthèse {index}/{len(chunks)}", flush=True)
            await synthesize_chunk(chunk, segment)
            segment_paths.append(segment)

        concat_file = temp_dir / "segments.txt"
        concat_file.write_text(
            "".join(f"file '{path.as_posix()}'\n" for path in segment_paths),
            encoding="utf-8",
        )

        output.parent.mkdir(parents=True, exist_ok=True)
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-c",
            "copy",
            "-metadata",
            "title=Guide 1 sur 15 - Battlefield Dominance",
            "-metadata",
            "artist=Warforge",
            "-metadata",
            "album=Guides tactiques Warhammer 40,000 V11",
            "-y",
            str(output),
        ]
        subprocess.run(command, check=True)

    audio = MP3(output)
    duration = int(round(audio.info.length))
    minutes, seconds = divmod(duration, 60)
    print(f"Fichier : {output}")
    print(f"Durée : {minutes:02d}:{seconds:02d}")
    print(f"Débit : {audio.info.bitrate // 1000} kb/s")
    print(f"Taille : {output.stat().st_size / (1024 * 1024):.2f} Mio")


if __name__ == "__main__":
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=base / "narration-fr.txt")
    parser.add_argument("--output", type=Path, default=base / "guide-01-battlefield-dominance.mp3")
    args = parser.parse_args()
    source_file = args.source if args.source.is_absolute() else base / args.source
    output_file = args.output if args.output.is_absolute() else base / args.output
    try:
        asyncio.run(build(source_file, output_file))
    except Exception as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        raise
