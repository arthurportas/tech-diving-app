# Copilot Instructions for tech-diving-app

## Project Overview
Client-side Bühlmann ZH-L16C decompression planner. Pure static web app with no build step - open `index.html` directly or serve locally.

## Architecture
- **Core logic**: `src/sim.js` - DOM-free pure functions implementing ZH-L16C tissue model
- **UI layer**: `src/main.js` - DOM manipulation, event handling, calls `sim.js`
- **Presentation**: `index.html` + `src/styles.css` - single-page app structure

## Key Patterns
- **Gas handling**: Map labels like "Trimix 18/45" to `{o2: 0.18, he: 0.45}` (see `computeDecompressionSchedule`)
- **GF values**: Input as integers (30-85), convert to fractions (0.3-0.85) for calculations
- **Deco gas switching**: "EAN + O₂" uses EAN below 6m, pure O₂ at 6m and shallower (see deco gas logic in `computeDecompressionSchedule`)
- **Tissue model**: 16 compartments with N2/He pressures, updated via exponential decay (see `update` function)
- **Ceiling calculation**: Weighted average of a/b coefficients based on tissue gas ratios (see `ceilingDepth`)

## Development Workflow
- **Local serving**: `npm start` (python server) or `npx serve .` for DevTools access
- **Testing**: Manual UI verification - input params, click "Plan Dive", inspect `<tbody id="output">` table
- **Example dive**: Depth 60m, Time 20min, Trimix 18/45, GF 30/85, Deco EAN+O₂ 50%, expect multi-stop schedule

## Conventions
- ES modules: Import/export between `src/` files
- Pure functions in `sim.js` - no side effects, return data structures
- DOM-free simulation: All logic testable without browser
- Dark theme UI: GitHub-inspired colors in `styles.css`
- Safety note: Always include "Educational use only" disclaimer in outputs

## Integration Points
- No external APIs - fully client-side
- Gas fractions hardcoded for common mixes (Trimix 18/45, 21/35, Air, O₂)
- Output format: Array of `{depth, mins, gas}` objects for table rendering</content>
<parameter name="filePath">/workspaces/tech-diving-app/.github/copilot-instructions.md