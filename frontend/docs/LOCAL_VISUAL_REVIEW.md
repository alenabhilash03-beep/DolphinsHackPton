# Visual frontend integration review

The standalone visual app lives in `frontend/`; the repository's existing technical app and Python backend remain unchanged. Launch it with `python3 frontend/start_preview.py` from the repository root. See `frontend/README.md` for setup and scope.

The generated scientific presentation is synchronized with `14896c873f325832539ddde17b35bd425081a9e8`. The source manifest records original hashes. It retains the canonical agent controller, verified structure handoff, proposal request validation, history and branching helpers, result-linked synthesis, numerical controller and scientific contracts. UI templates preserve the reviewed glass theme and graphics-first layout. New experiments remain blank; saved references and prior results require explicit user actions.

Verified for this integration:

- Production frontend build and 40 canonical controller/presentation tests.
- Hypothesis-first navigation and exact submitted request, accepted-result transition, result-linked edits, missing inputs, provider failure, and ignored late responses using explicit synthetic transport fixtures.
- Actual frontend-to-SciPy numerical edit through the new checkout's API; proposals and persistent history from the same service; reopening the exact prior result.
- Manual research/analysis tools, notes/navigation, continuous playback and reduced Plotly rendering.
- Real Chromium rendering of the blank experiment and proposal panel, with desktop and mobile overflow checks and no page errors.

No NVIDIA credentials are available in this cloud checkout, so no live provider run was performed as part of this frontend integration. Existing repository scientific verification is documented separately under `docs/` and `data/research/verification/`. Credentials, local databases, user files, build products, dependencies and recording artifacts are excluded from Git.
