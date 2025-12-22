# tech-diving-app

Tiny static demo: a client-side Bühlmann ZH‑L16C decompression planner implemented entirely in `index.html`.

Quick start

- Open `index.html` directly in your browser for a fast smoke test.
- To serve locally (recommended for DevTools/debugging):

```bash
python -m http.server 8000
# then open http://localhost:8000

# or, if you have Node available:
npx serve .
```

Manual verification

- Open the page and use the controls (Depth, Bottom Time, Gas, GF Low, GF High, Deco Gas, Deco Gas O₂ % if applicable).
- Click "Plan Dive" and inspect the table under the "Decompression Schedule" panel — rows are appended to `<tbody id="output">`.

Example to try: Depth `60`, Bottom Time `20`, Gas `Trimix 18/45`, GF Low `30`, GF High `85`, Deco Gas `EAN + O₂`, Deco Gas O₂ % `50`, Use O₂ for shallow stops checked.

Development notes

- All logic, styles and markup live in `index.html` (see the `<script>` block at bottom) unless modularized into `src/`.
- The project currently uses ES modules under `src/` (see `src/sim.js`, `src/main.js`).
