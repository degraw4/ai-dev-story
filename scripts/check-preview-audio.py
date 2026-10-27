"""Check score structure, rendered WAVs and the loop boundary.

Run with the same Python and NumPy environment as synthesize-preview-music.py.
This validates delivery and reproducibility, not listening enjoyment.
"""
from pathlib import Path
import json
import runpy
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "audio"


def rms(signal):
    return float(np.sqrt(np.mean(signal ** 2)))


def longest_quiet(signal, sample_rate):
    quiet = np.max(np.abs(signal), axis=1) < .001
    changes = np.flatnonzero(np.diff(np.r_[False, quiet, False]))
    return float(max(changes[1::2] - changes[::2], default=0) / sample_rate)


def read_wav(filename, expected_seconds):
    with wave.open(str(SOURCE / filename)) as handle:
        sample_rate = handle.getframerate()
        assert handle.getnchannels() == 2, filename
        assert handle.getsampwidth() == 2, filename
        assert handle.getcomptype() == "NONE", filename
        assert sample_rate == 22050, filename
        assert handle.getnframes() == round(expected_seconds * sample_rate), filename
        pcm = np.frombuffer(handle.readframes(handle.getnframes()), dtype="<i2").reshape(-1, 2)
    signal = pcm.astype(float) / 32768
    peak = float(np.max(np.abs(signal)))
    assert np.isfinite(signal).all(), filename
    assert .70 < peak <= .80, (filename, "headroom", peak)
    assert .06 < rms(signal) < .25, (filename, "level", rms(signal))
    assert float(np.max(np.abs(signal.mean(axis=0)))) < .0001, (filename, "DC offset")
    assert rms(signal[:sample_rate // 10]) > .03, (filename, "delayed opening")
    return pcm, signal, {
        "file": filename, "duration_seconds": len(signal) / sample_rate,
        "sample_rate": sample_rate, "channels": 2, "bits_per_sample": 16,
        "peak": round(peak, 6), "rms": round(rms(signal), 6),
        "longest_quiet_seconds": round(longest_quiet(signal, sample_rate), 6),
    }


def main():
    synth = runpy.run_path(str(ROOT / "scripts" / "synthesize-preview-music.py"))
    score = json.loads((SOURCE / "score.json").read_text(encoding="utf-8"))
    synth["validate_score"](score)
    sample_rate = synth["SAMPLE_RATE"]
    beat_seconds = 60 / score["tempo_bpm"]
    assert len(score["sections"]) == 5
    assert len({json.dumps(bar) for bar in score["melody"]}) == 32, "repeated melody bars"
    assert score["melody"][:16] != score["melody"][16:], "duplicated half-loop"
    assert {row["lead_duty"] for row in score["arrangement"]} == {.125, .25, .5}
    assert len({row["drums"] for row in score["arrangement"]}) >= 4
    assert len({row["bass"] for row in score["arrangement"]}) >= 4

    # Responses should fit the actual melodic rests, not simply add density.
    response_bars = 0
    for melody, arrangement in zip(score["melody"], score["arrangement"]):
        cursor = 0
        rests = []
        for pitch, beats in melody:
            if pitch == "R":
                rests.append((cursor, cursor + beats))
            cursor += beats
        for _, beat, duration in arrangement.get("reply", []):
            assert any(start <= beat and beat + duration <= end for start, end in rests), "reply outside lead rest"
        response_bars += bool(arrangement.get("reply"))
    assert response_bars >= 8

    loop_pcm, loop, loop_result = read_wav("office-loop.wav", score["duration_seconds"])
    jingle_pcm, _, jingle_result = read_wav("release-jingle.wav", score["jingle"]["duration_seconds"])
    # Exact re-render proves that the checked-in binaries follow the editable
    # score and renderer, including the deterministic percussion noise.
    rendered_loop = synth["to_pcm"](synth["render_loop"](score))
    rendered_jingle = synth["to_pcm"](synth["render_jingle"](score))
    assert np.array_equal(loop_pcm, rendered_loop), "office WAV does not match its source"
    assert np.array_equal(jingle_pcm, rendered_jingle), "jingle WAV does not match its source"

    section_results = []
    for section in score["sections"]:
        start_seconds = (section["first_bar"] - 1) * score["beats_per_bar"] * beat_seconds
        duration_seconds = section["bars"] * score["beats_per_bar"] * beat_seconds
        start = round(start_seconds * sample_rate)
        end = round((start_seconds + duration_seconds) * sample_rate)
        section_signal = loop[start:end]
        section_results.append({"id": section["id"], "start_seconds": start_seconds,
                                "duration_seconds": duration_seconds,
                                "rms": round(rms(section_signal), 6)})
    section_levels = {section["id"]: section["rms"] for section in section_results}
    assert section_levels["bridge"] < section_levels["A_variation"] * .85, "bridge does not reduce intensity"
    assert min(section_levels.values()) > .06, "inaudible section"

    # Test the actual last-to-first sample, then energy around that boundary.
    # A silence-padded file could have a zero sample jump but still fail these.
    seam_jump = float(np.max(np.abs(loop[0] - loop[-1])))
    adjacent_limit = float(np.quantile(np.abs(np.diff(loop, axis=0)), .999))
    tail_level = rms(loop[-sample_rate // 10:])
    start_level = rms(loop[:sample_rate // 10])
    assert seam_jump < .02 and seam_jump <= adjacent_limit, "loop boundary discontinuity"
    assert tail_level > rms(loop) * .4, "loop ends with a fade or padded silence"
    assert .3 < tail_level / start_level < 2, "loop seam energy discontinuity"
    assert loop_result["longest_quiet_seconds"] < .2, "long silent gap in loop"
    half = len(loop) // 2
    half_correlation = float(np.corrcoef(loop[:half, 0], loop[half:, 0])[0, 1])
    assert half_correlation < .8, "second half duplicates first half"
    loop_result.update({"seam_sample_jump": round(seam_jump, 6),
                        "first_100ms_rms": round(start_level, 6),
                        "last_100ms_rms": round(tail_level, 6),
                        "half_loop_correlation": round(half_correlation, 6)})
    print(json.dumps({"status": "passed", "score_bars": 32, "response_bars": response_bars,
                      "source_matches_wav": True, "sections": section_results,
                      "files": [loop_result, jingle_result],
                      "limit": "Structure, signal and reproducibility checks do not replace human listening."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
