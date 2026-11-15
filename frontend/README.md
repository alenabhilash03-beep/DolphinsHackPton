# Hypothesim visual frontend

This is the reviewed black-glass frontend: the animated entry page, research desk, blank hypothesis-first experiments, visual simulation workspace, paper library, notes and exports. It uses the existing Python scientific backend in `../apps/api`; it does not replace or modify that backend or the technical frontend in `../apps/web`.

The scientific presentation is synchronized from repository revision `14896c873f325832539ddde17b35bd425081a9e8`, including grounded answers, structural measurement handoff, exact follow-up proposals and investigation history/branching. New experiments start blank. References and saved results open only through an explicit user action.

## Start

From the repository root:

```sh
python3 frontend/start_preview.py
```

Requires Node.js 22+ and an existing Python 3 launcher. The script installs locked dependencies, obtains the backend's required Python environment through uv, starts both services on available loopback ports, and opens the local setup page. Leave the terminal running; Ctrl+C stops the services.

The NVIDIA key can be entered in the local browser form. It is kept in `frontend/.local-preview/provider.env`, ignored by Git. Existing backend environment configuration remains supported. No key is required to explicitly load the reference, use the SciPy controls, or inspect its molecular structure. Live research, natural-language revisions and proposal execution need a working provider.

The local preview uses a local identity and local notes/files. It is not a public account-authentication deployment.

## Development and checks

```sh
cd frontend
npm ci
npm run build
npm run test:entry
npm run test:science
npm run test:hypothesis
node scripts/verify-smooth-playback.cjs
```

With the visual frontend and its scientific service running, verify a real numerical round trip:

```sh
HYPOTHESIM_TEST_URL=http://127.0.0.1:3011 npm run test:visual
```

To regenerate the presentation modules after a deliberate scientific frontend update, run `node scripts/sync-science-local.cjs ..` from this folder and repeat the checks. Custom presentation templates are under `ui-templates`; canonical algorithms remain in the main repository. The manifest records original source hashes.

## Review notes

- Enter workspace opens Overview. New experiment opens a blank hypothesis form.
- Numerical controls use the existing deterministic scientific API; they do not call the LLM.
- Show in structure highlights the agent's measured residue pair in the verified viewer.
- Follow-up experiments show the exact proposed change. History reopens stored results and identifies branches.
- Graph playback interpolates presentation positions only; returned samples and reported metrics are unchanged.
- PNG/JPG exports contain the occupancy chart; PDF/CSV/JSON exports use the accepted result. The molecule also exports PNG.
- Current primary scientific support and limitations are documented in the root scientific documentation. This UI adds no clinical claims or new drug presets.
