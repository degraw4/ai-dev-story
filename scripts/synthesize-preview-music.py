"""Render the original, editable score in assets/audio/score.json.

Requires Python 3 and NumPy; run from any directory. Pulse, triangle and
clocked noise voices are synthesized here without external samples.
The chip character comes from instruments, not reducing WAV bit depth.
This is a chip-inspired arrangement, not a particular console emulator.
"""
from pathlib import Path
import json
import math
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "audio"
SAMPLE_RATE = 22050
PITCH_CLASSES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5,
                 "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def frequency(pitch):
    midi_note = (int(pitch[-1]) + 1) * 12 + PITCH_CLASSES[pitch[:-1]]
    return 440 * 2 ** ((midi_note - 69) / 12)


def octave(pitch, amount):
    return pitch[:-1] + str(int(pitch[-1]) + amount)


def poly_blep(phase, step):
    """Round only discontinuities, preserving the recognizable pulse body."""
    correction = np.zeros_like(phase)
    first = phase < step
    position = phase[first] / step
    correction[first] = position + position - position * position - 1
    last = phase > 1 - step
    position = (phase[last] - 1) / step
    correction[last] = position * position + position + position + 1
    return correction


def pulse(phase, step, duty):
    signal = np.where(phase < duty, 1.0, -1.0)
    signal += poly_blep(phase, step) - poly_blep((phase - duty) % 1, step)
    # Remove the duty-cycle DC component and equalize nominal RMS.
    return (signal - (2 * duty - 1)) / math.sqrt(4 * duty * (1 - duty))


def voice(pitch, seconds, kind="pulse", volume=.1, duty=.25):
    count = max(1, int(round(seconds * SAMPLE_RATE)))
    if pitch == "R":
        return np.zeros(count)
    time = np.arange(count) / SAMPLE_RATE
    step = frequency(pitch) / SAMPLE_RATE
    phase = (np.arange(count) * step) % 1
    if kind == "triangle":
        signal = 1 - 4 * np.abs(phase - .5)
        attack_seconds, release_seconds = .003, .012
        decay = .88 + .12 * np.exp(-time * 12)
    else:
        signal = pulse(phase, step, duty)
        attack_seconds, release_seconds = .002, .018
        decay = .64 + .36 * np.exp(-time * 22)
    attack = np.minimum(time / attack_seconds, 1)
    release = np.minimum((seconds - time) / release_seconds, 1)
    return signal * np.clip(attack * release, 0, 1) * decay * volume


def chip_noise(seconds, clock_hz, seed, short=False):
    """A 15-bit shift register produces reproducible clocked chip noise."""
    count = round(seconds * SAMPLE_RATE)
    steps = int(math.ceil(seconds * clock_hz)) + 1
    state = (seed & 0x7fff) or 1
    values = np.empty(steps)
    for index in range(steps):
        values[index] = 1 if state & 1 else -1
        feedback = (state ^ (state >> (6 if short else 1))) & 1
        state = (state >> 1) | (feedback << 14)
    positions = np.minimum((np.arange(count) * clock_hz / SAMPLE_RATE).astype(int), steps - 1)
    return values[positions]


def drum(kind, seed):
    duration = {"kick": .14, "snare": .13, "hat": .035, "open_hat": .085}[kind]
    time = np.arange(round(duration * SAMPLE_RATE)) / SAMPLE_RATE
    if kind == "kick":
        phase = (52 * time + 1.8 * (1 - np.exp(-time * 38))) % 1
        signal = (1 - 4 * np.abs(phase - .5)) * np.exp(-time * 29) * .19
        signal += chip_noise(duration, 5000, seed) * np.exp(-time * 180) * .025
    elif kind == "snare":
        noise = chip_noise(duration, 7500, seed)
        high = noise - np.concatenate(([noise[0]], noise[:-1])) * .62
        body = np.sin(2 * math.pi * 185 * time) * np.exp(-time * 55) * .035
        signal = high * np.exp(-time * 31) * .075 + body
    else:
        noise = chip_noise(duration, 11025, seed, short=True)
        high = noise - np.concatenate(([noise[0]], noise[:-1])) * .8
        decay = 105 if kind == "hat" else 47
        signal = high * np.exp(-time * decay) * .027
    signal *= np.minimum(time / .0015, 1)
    signal *= np.clip((duration - time) / .006, 0, 1)
    return signal


def place(mix, sound, start_seconds, pan=0, loop=False):
    start = int(round(start_seconds * SAMPLE_RATE))
    stereo = np.column_stack((sound * (1 - pan * .3), sound * (1 + pan * .3)))
    if loop:
        # The last pickup's release continues into bar one; no global fade.
        indices = (np.arange(len(sound)) + start) % len(mix)
        np.add.at(mix, indices, stereo)
    else:
        count = min(len(sound), len(mix) - start)
        if count > 0:
            mix[start:start + count] += stereo[:count]


def validate_score(score):
    bars = len(score["melody"])
    beats = score["beats_per_bar"]
    assert bars == 32 and beats == 4
    assert len(score["chords"]) == len(score["bass"]) == len(score["arrangement"]) == bars
    for bar in score["melody"]:
        assert math.isclose(sum(length for _, length in bar), beats)
        for pitch, length in bar:
            assert length > 0
            if pitch != "R":
                frequency(pitch)
    assert math.isclose(bars * beats * 60 / score["tempo_bpm"], score["duration_seconds"])
    cursor = 1
    for section in score["sections"]:
        assert section["first_bar"] == cursor
        cursor += section["bars"]
    assert cursor == bars + 1
    for arrangement in score["arrangement"]:
        assert arrangement["lead_duty"] in (.125, .25, .5)
        assert 0 < arrangement["lead_gate"] <= 1
        assert 0 < arrangement["intensity"] <= 1.3
        for group in ("arpeggio", "bass", "drums"):
            assert arrangement[group] in score["patterns"][group]
        for pitch, beat, length in arrangement.get("reply", []):
            frequency(pitch)
            assert 0 <= beat < beats and length > 0 and beat + length <= beats
    for events in score["patterns"]["arpeggio"].values():
        for beat, chord_index, length in events:
            assert 0 <= beat < beats and chord_index in (0, 1, 2) and length > 0
    for events in score["patterns"]["bass"].values():
        for beat, source, length in events:
            assert 0 <= beat < beats and source in ("root", "fifth", "octave", "third") and length > 0
    for events in score["patterns"]["drums"].values():
        for kind, beat, accent in events:
            assert kind in ("kick", "snare", "hat", "open_hat") and 0 <= beat < beats and 0 < accent <= 1.5


def render_loop(score):
    validate_score(score)
    beat_seconds = 60 / score["tempo_bpm"]
    mix = np.zeros((round(score["duration_seconds"] * SAMPLE_RATE), 2))
    levels = score["instruments"]
    for bar_index, bar in enumerate(score["melody"]):
        arrangement = score["arrangement"][bar_index]
        intensity = arrangement["intensity"]
        bar_beat = bar_index * score["beats_per_bar"]
        cursor = 0
        for pitch, length in bar:
            sound = voice(pitch, length * beat_seconds * arrangement["lead_gate"],
                          volume=levels["lead"]["volume"] * intensity,
                          duty=arrangement["lead_duty"])
            place(mix, sound, (bar_beat + cursor) * beat_seconds, pan=-.22, loop=True)
            cursor += length
        # Pulse two answers during lead rests, replacing its arpeggio slots.
        replies = arrangement.get("reply", [])
        for beat, chord_index, length in score["patterns"]["arpeggio"][arrangement["arpeggio"]]:
            if any(beat < reply_start + reply_length and beat + length > reply_start
                   for _, reply_start, reply_length in replies):
                continue
            pitch = score["chords"][bar_index][chord_index]
            sound = voice(pitch, length * beat_seconds,
                          volume=levels["arpeggio"]["volume"] * intensity,
                          duty=levels["arpeggio"]["duty"])
            place(mix, sound, (bar_beat + beat) * beat_seconds, pan=.45, loop=True)
        for pitch, beat, length in replies:
            sound = voice(pitch, length * beat_seconds * .9,
                          volume=levels["reply"]["volume"] * intensity,
                          duty=levels["reply"]["duty"])
            place(mix, sound, (bar_beat + beat) * beat_seconds, pan=.35, loop=True)
        root = score["bass"][bar_index]
        for beat, source, length in score["patterns"]["bass"][arrangement["bass"]]:
            pitch = {"root": root, "fifth": octave(score["chords"][bar_index][2], -1),
                     "third": octave(score["chords"][bar_index][1], -1), "octave": octave(root, 1)}[source]
            sound = voice(pitch, length * beat_seconds, kind="triangle",
                          volume=levels["bass"]["volume"] * intensity)
            place(mix, sound, (bar_beat + beat) * beat_seconds, loop=True)
        for index, (kind, beat, accent) in enumerate(score["patterns"]["drums"][arrangement["drums"]]):
            sound = drum(kind, score["noise_seed"] + bar_index * 83 + index * 17) * accent * intensity
            place(mix, sound, (bar_beat + beat) * beat_seconds,
                  pan=.18 if kind in ("hat", "open_hat") else 0, loop=True)
    return mix


def render_jingle(score):
    jingle = score["jingle"]
    mix = np.zeros((round(jingle["duration_seconds"] * SAMPLE_RATE), 2))
    for pitch, start, seconds in jingle["melody"]:
        place(mix, voice(pitch, seconds, volume=.14, duty=.25), start, pan=-.12)
    for pitch, start, seconds in jingle["arpeggio"]:
        place(mix, voice(pitch, seconds, volume=.055, duty=.125), start, pan=.4)
    for pitch, start, seconds in jingle["bass"]:
        place(mix, voice(pitch, seconds, kind="triangle", volume=.21), start)
    for index, (kind, start, accent) in enumerate(jingle["drums"]):
        place(mix, drum(kind, score["noise_seed"] + 900 + index) * accent, start)
    return mix


def to_pcm(mix):
    assert np.isfinite(mix).all()
    mix = mix - mix.mean(axis=0)
    peak = float(np.max(np.abs(mix)))
    if peak:
        mix *= .78 / peak
    return np.rint(mix * 32767).astype("<i2")


def save(name, mix):
    pcm = to_pcm(mix)
    with wave.open(str(OUTPUT / name), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())
    signal = pcm.astype(float) / 32768
    return {"file": name, "duration_seconds": round(len(mix) / SAMPLE_RATE, 3),
            "sample_rate": SAMPLE_RATE, "peak": round(float(np.max(np.abs(signal))), 4),
            "rms": round(float(np.sqrt(np.mean(signal ** 2))), 4)}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    score = json.loads((OUTPUT / "score.json").read_text(encoding="utf-8"))
    results = [save("office-loop.wav", render_loop(score)),
               save("release-jingle.wav", render_jingle(score))]
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
