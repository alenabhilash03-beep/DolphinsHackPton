# Local visual review, version 2

No commit, GitHub push, or production deployment was made. The previous review ZIP remains available.

Playback changes:

- A continuous presentation clock replaces snapping the playhead to uneven output sample times.
- The static Plotly renderer is memoized; cursor, reveal mask and sample-marker motion update independently.
- Plot geometry is measured on initialization, resizing or relayout rather than on every tick.
- Visual markers interpolate returned arrays for motion only. Solver outputs, exported arrays, reported sample values and scientific metrics are unchanged.
- Playback pauses when its page is hidden. Binding-particle motion uses the same continuous visual clock.

Presentation changes:

- Warm black-glass surfaces, ivory text, stone secondary text, and restrained burgundy accents connect the experiment screen to the entry theme.
- The same tokens apply across plots, molecule controls, evidence, answers and model details. Plot hover labels and toolbar colors have explicit dark-theme contrast.
- Default copy is shorter, repeated captions are removed, and longer structure context is available under Structure notes.
- Large animated plot surfaces avoid backdrop blur; blur is kept to the smaller static chrome and agent panel.

Checks passed: production build, actual local UI-to-SciPy adjustment flow, provider/cached states and subtab navigation; 60 cursor updates without additional Plotly renders or layout reads; continuous playback across sparse samples, pause/seek cleanup, interpolation bounds, and text palette contrast.

Browser GPU/WebGL visual review remains for the user's Mac because this cloud session has no available browser tool and its preview relay did not open. The ZIP contains no provider key or local workspace data. Its launcher can reuse the user's own existing local key from the preceding preview folder.
