"""Build static/audio/ from public-domain (CC0) Freesound recordings.

Downloads each source (Freesound's public MP3 previews, no login needed) into a cache
folder, then cuts, levels and encodes the four sound files the app plays. Needs ffmpeg.

    uv run python scripts/build_audio.py [--cache DIR]

The cut points below were chosen by listening to and analysing each recording; change
them here and re-run to re-cut a sound. The offsets the app relies on (BREATHS,
TANPURA_LOOP, the one-second ghungroo slots) are in static/js/sound.js.
"""

import argparse
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "static" / "audio"

# name -> (Freesound preview URL, credit)
SOURCES = {
    "tanpura": (
        "https://cdn.freesound.org/previews/148/148850_1558892-hq.mp3",
        '"Tanpura in E" by iluppai, https://freesound.org/s/148850/',
    ),
    "bell": (
        "https://cdn.freesound.org/previews/274/274316_3597112-hq.mp3",
        '"Ghanta-Leather-Mallet-2015-05-16" by the_very_Real_Horst, https://freesound.org/s/274316/',
    ),
    "breath": (
        "https://cdn.freesound.org/previews/619/619900_766379-hq.mp3",
        '"breath" by zagor76, https://freesound.org/s/619900/',
    ),
    "spooky-breath": (
        "https://cdn.freesound.org/previews/341/341751_1487124-hq.mp3",
        '"Spooky Breath" by pqr, https://freesound.org/s/341751/',
    ),
    "ghungroo": (
        "https://cdn.freesound.org/previews/700/700521_1420533-hq.mp3",
        '"FX Indian Ghungroo Anklet" by bashrambali, https://freesound.org/s/700521/',
    ),
}


def fetch(name: str, cache: Path) -> Path:
    path = cache / f"{name}.mp3"
    if not path.exists():
        url, credit = SOURCES[name]
        print(f"Downloading {credit}")
        request = urllib.request.Request(url, headers={"User-Agent": "tarot-space audio build"})
        with urllib.request.urlopen(request) as res:
            path.write_bytes(res.read())
    return path


def decode(path: Path, start: float, end: float, filters: str = "", channels: int = 1) -> np.ndarray:
    af = f"atrim=start={start}:end={end},asetpts=PTS-STARTPTS" + (f",{filters}" if filters else "")
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-af", af, "-ac", str(channels), "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    x = np.frombuffer(raw, dtype=np.float32).copy()
    return x.reshape(-1, channels) if channels > 1 else x


def fade(x: np.ndarray, fade_in: float, fade_out: float) -> np.ndarray:
    n_in, n_out = int(fade_in * SR), int(fade_out * SR)
    w = np.ones(len(x))
    if n_in:
        w[:n_in] = np.linspace(0, 1, n_in) ** 2
    if n_out:
        w[-n_out:] = np.linspace(1, 0, n_out) ** 2
    return x * (w if x.ndim == 1 else w[:, None])


def level(x: np.ndarray, rms_db: float) -> np.ndarray:
    """Scale so the louder half of the sound sits at rms_db."""
    mono = x if x.ndim == 1 else x.mean(axis=1)
    frames = np.array([np.sqrt(np.mean(mono[i : i + 2048] ** 2)) for i in range(0, len(mono) - 2048, 1024)])
    active = np.sqrt(np.mean(np.sort(frames)[len(frames) // 2 :] ** 2))
    return x * (10 ** (rms_db / 20) / (active + 1e-9))


def slot(x: np.ndarray, seconds: float) -> np.ndarray:
    out = np.zeros((int(seconds * SR),) + x.shape[1:], dtype=np.float32)
    n = min(len(x), len(out))
    out[:n] = x[:n]
    return out


def encode(x: np.ndarray, name: str, bitrate: str) -> None:
    channels = 1 if x.ndim == 1 else x.shape[1]
    peak = np.abs(x).max()
    if peak > 0.89:  # keep 1 dB of headroom
        x = x * (0.89 / peak)
    path = OUT / name
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(channels), "-i", "-",
         "-c:a", "libmp3lame", "-b:a", bitrate, str(path)],
        input=x.astype(np.float32).tobytes(),
        check=True,
    )
    print(f"Wrote {path.relative_to(OUT.parent.parent)} ({len(x) / SR:.1f} s, {path.stat().st_size // 1024} KB)")


def build_tanpura(cache: Path) -> None:
    """An 18.5 s cycle made seamless by crossfading its end into its start, then padded
    on both sides with its own continuation. Looping over [PAD, PAD + CYCLE] (TANPURA_LOOP
    in sound.js) is then seamless however the MP3 encoder shifts the audio."""
    start, cycle_len, crossfade, pad = 2.5, 18.5, 1.5, 0.15
    raw = decode(fetch("tanpura", cache), start, start + cycle_len + crossfade, channels=2)
    n, nx = int(cycle_len * SR), int(crossfade * SR)
    cycle = raw[:n].copy()
    ramp = np.linspace(0, 1, nx)[:, None]
    cycle[:nx] = raw[:nx] * np.sqrt(ramp) + raw[n : n + nx] * np.sqrt(1 - ramp)
    cycle = level(cycle, -24.8)
    p = int(pad * SR)
    encode(np.concatenate([cycle[-p:], cycle, cycle[:p]]), "tanpura-loop.mp3", "96k")


def build_bell(cache: Path) -> None:
    """The ghanta rung four times, then its ring dying away undisturbed."""
    bell = level(fade(decode(fetch("bell", cache), 11.82, 17.5), 0.005, 1.2), -18)
    encode(bell, "temple-bell.mp3", "96k")


def build_breaths(cache: Path) -> None:
    """Four slots (BREATHS in sound.js): in at 0 s, out at 5 s, a watcher's breath at 10 s,
    a gasp at 15 s. One voice for the querent's own in and out breaths (slowed to the
    ritual's pace; breath is noise, so it stretches cleanly), and a long, unnatural
    exhale from another recording for the watcher."""
    breath, spooky = fetch("breath", cache), fetch("spooky-breath", cache)
    inhale = level(fade(decode(breath, 10.55, 11.95, "atempo=0.5,atempo=0.85"), 0.25, 0.6), -24)
    exhale = level(fade(decode(breath, 12.9, 14.75, "atempo=0.5"), 0.08, 1.2), -24)
    watcher = level(fade(decode(spooky, 1.3, 6.3), 0.05, 1.8), -24)
    gasp = level(fade(decode(breath, 6.25, 7.05, "atempo=1.35"), 0.02, 0.15), -20)
    encode(np.concatenate([slot(inhale, 5), slot(exhale, 5), slot(watcher, 5), slot(gasp, 1)]), "breaths.mp3", "64k")


def build_ghungroo(cache: Path) -> None:
    """Seven unhurried footsteps from the start of the recording, one per one-second slot,
    each starting just before its step. (Later in the recording the shaking is busier.)"""
    source = fetch("ghungroo", cache)
    onsets = [0.7, 2.0, 3.3, 4.75, 6.25, 7.7, 9.15]
    steps = [fade(decode(source, max(0, t - 0.06), t + 0.94, "highpass=f=70"), 0.01, 0.3) for t in onsets]
    encode(level(np.concatenate([slot(s, 1) for s in steps]), -22.2), "ghungroo-steps.mp3", "96k")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cache", type=Path, help="where to keep downloaded sources (default: a temporary folder)")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        cache = args.cache or Path(tmp)
        cache.mkdir(parents=True, exist_ok=True)
        build_tanpura(cache)
        build_bell(cache)
        build_breaths(cache)
        build_ghungroo(cache)


if __name__ == "__main__":
    main()
