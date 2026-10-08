# Built-in instruments

Amanorsac Studio sampled instruments, one folder per instrument:

    sounds/<id>/instrument.json      the map (zones, anchors, levels)
    sounds/<id>/samples/*.flac       the audio, {Note}{Octave}_v{layer}_rr{n}.flac

Ids and names (the Sound menu): grand = Grand 1 · spnatural = SP Natural · softep = Soft EP 1.
The engine (piano-engine.js) plays them per "HOW TO PLAY THESE SAMPLES.md" in the
Sanctuary Library. Only these files are readable by the renderer (preload.js, SOUND).
