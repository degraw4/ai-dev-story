"""Verify original event WAV delivery, signal headroom and exact source matching.

This checks assets, not whether their loudness and character suit a long playtest.
"""
from pathlib import Path
import hashlib
import json
import runpy
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "audio"
EXPECTED_EVENTS = {"ui", "projectStart", "researchReady", "publish", "rankUp", "rankDown",
                   "funding", "hire", "dismiss", "purchase", "reset", "news", "error", "bankrupt", "ending"}


def main():
    synth = runpy.run_path(str(ROOT / "scripts" / "synthesize-event-sounds.py"))
    manifest = json.loads((SOURCE / "events.json").read_text(encoding="utf-8"))
    synth["validate_manifest"](manifest)
    assert set(manifest["events"]) == EXPECTED_EVENTS
    fingerprints = set()
    results = []
    generated_bytes = 0
    for event_name, event in manifest["events"].items():
        path = SOURCE / event["file"]
        with wave.open(str(path)) as handle:
            assert handle.getnchannels() == manifest["channels"], event_name
            assert handle.getsampwidth() == 2 and handle.getcomptype() == "NONE", event_name
            assert handle.getframerate() == manifest["sample_rate"], event_name
            assert handle.getnframes() == round(event["duration_seconds"] * manifest["sample_rate"]), event_name
            raw = handle.readframes(handle.getnframes())
            pcm = np.frombuffer(raw, dtype="<i2").reshape(-1, 2)
        fingerprint = hashlib.sha256(raw).hexdigest()
        assert fingerprint not in fingerprints, (event_name, "duplicate PCM")
        fingerprints.add(fingerprint)
        signal = pcm.astype(float) / 32768
        peak = float(np.max(np.abs(signal)))
        rms = float(np.sqrt(np.mean(signal ** 2)))
        assert 0.2 < peak < 0.8 and 0.015 < rms < 0.4, (event_name, peak, rms)
        assert abs(float(signal.mean())) < 0.0001, (event_name, "DC offset")
        assert not np.any(np.abs(pcm.astype(np.int32)) >= 32767), (event_name, "clipped")
        if "source" not in event:
            generated_bytes += path.stat().st_size
            assert np.max(np.abs(signal[[0, -1]])) == 0, (event_name, "click at endpoint")
            assert abs(peak - event["peak"]) < 0.0001, (event_name, "peak mismatch")
            first_render = synth["render_event"](event, manifest)
            assert np.array_equal(pcm, first_render), (event_name, "WAV differs from editable source")
            assert np.array_equal(first_render, synth["render_event"](event, manifest)), (event_name, "nondeterministic")
        results.append({"event": event_name, "file": event["file"], "seconds": event["duration_seconds"],
                        "peak": round(peak, 5), "rms": round(rms, 5)})
    assert generated_bytes < 900_000, generated_bytes
    print(json.dumps({"status": "passed", "events": len(results), "new_original_files": len(results) - 1,
                      "generated_bytes": generated_bytes, "unique_pcm": True, "source_matches_wav": True,
                      "files": results, "limit": "Signal and source checks do not replace listening in the game."}, indent=2))


if __name__ == "__main__":
    main()
