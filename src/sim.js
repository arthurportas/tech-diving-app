/* Pure simulation functions for ZH-L16C decompression planner
   This module is DOM-free and returns schedule rows for rendering.
*/
export const ZHL16C = [
  { tN2:4,   tHe:1.51, aN2:1.2599, bN2:0.5050, aHe:1.7424, bHe:0.4245 },
  { tN2:8,   tHe:3.02, aN2:1.1696, bN2:0.6514, aHe:1.6189, bHe:0.4770 },
  { tN2:12.5,tHe:4.72, aN2:1.0000, bN2:0.7222, aHe:1.3830, bHe:0.5747 },
  { tN2:18.5,tHe:6.99, aN2:0.8618, bN2:0.7825, aHe:1.1919, bHe:0.6527 },
  { tN2:27,  tHe:10.21,aN2:0.7562, bN2:0.8126, aHe:1.0458, bHe:0.7223 },
  { tN2:38.3,tHe:14.48,aN2:0.6667, bN2:0.8434, aHe:0.9220, bHe:0.7582 },
  { tN2:54.3,tHe:20.53,aN2:0.5933, bN2:0.8693, aHe:0.8205, bHe:0.7957 },
  { tN2:77,  tHe:29.11,aN2:0.5282, bN2:0.8910, aHe:0.7305, bHe:0.8279 },
  { tN2:109, tHe:41.2, aN2:0.4701, bN2:0.9092, aHe:0.6502, bHe:0.8553 },
  { tN2:146, tHe:55.19,aN2:0.4187, bN2:0.9222, aHe:0.5950, bHe:0.8757 },
  { tN2:187, tHe:70.69,aN2:0.3798, bN2:0.9319, aHe:0.5545, bHe:0.8903 },
  { tN2:239, tHe:90.34,aN2:0.3497, bN2:0.9403, aHe:0.5333, bHe:0.8997 },
  { tN2:305, tHe:115.29,aN2:0.3223, bN2:0.9477, aHe:0.5189, bHe:0.9073 },
  { tN2:390, tHe:147.42,aN2:0.2971, bN2:0.9544, aHe:0.5181, bHe:0.9122 },
  { tN2:498, tHe:188.24,aN2:0.2737, bN2:0.9602, aHe:0.5176, bHe:0.9171 },
  { tN2:635, tHe:240.03,aN2:0.2523, bN2:0.9653, aHe:0.5172, bHe:0.9217 }
];

function initTissues() {
  return ZHL16C.map(() => ({ n2:0.79, he:0 }));
}

function ambient(depth) { return 1 + depth / 10; }

function inspired(depth, frac) {
  return (ambient(depth) - 0.0627) * frac;
}

function update(p0, pinsp, half, dt) {
  const k = Math.LN2 / half;
  return p0 + (pinsp - p0) * (1 - Math.exp(-k * dt));
}

function gf(depth, first, low, high) {
  if (depth >= first) return low;
  if (depth <= 0) return high;
  return low + (high - low) * ((first - depth) / first);
}

function ceilingDepth(tissues, depth, first, gfLow, gfHigh) {
  let maxBar = 0;
  tissues.forEach((t,i) => {
    const c = ZHL16C[i];
    const pt = t.n2 + t.he;
    const a = (c.aN2*t.n2 + c.aHe*t.he) / pt;
    const b = (c.bN2*t.n2 + c.bHe*t.he) / pt;
    const pamb = (pt - a) / b;
    const allowed = 1 + gf(depth, first, gfLow, gfHigh) * (pamb - 1);
    maxBar = Math.max(maxBar, allowed);
  });
  return (maxBar - 1) * 10;
}

// computeDecompressionSchedule returns an array of rows { depth, mins, gas }
export function computeDecompressionSchedule({ depth, time, gasLabel, gfLow, gfHigh, decoGasType, decoO2 }) {
  const bottomGas = gasLabel === '18/45'
    ? { o2:0.18, he:0.45 }
    : gasLabel === '21/35'
    ? { o2:0.21, he:0.35 }
    : gasLabel === 'o2'
    ? { o2:1, he:0 }
    : { o2:0.21, he:0 };

  let tissues = initTissues();

  for (let t=0; t<time; t++) {
    const fn2 = 1 - bottomGas.o2 - bottomGas.he;
    tissues = tissues.map((ti,i)=>({
      n2: update(ti.n2, inspired(depth, fn2), ZHL16C[i].tN2, 1),
      he: update(ti.he, inspired(depth, bottomGas.he), ZHL16C[i].tHe, 1)
    }));
  }

  const first = Math.ceil(ceilingDepth(tissues, depth, depth, gfLow, gfHigh) / 3) * 3;
  const rows = [];

  for (let d = first; d > 0; d -= 3) {
    let mins = 0;
    let fn2;
    if (decoGasType === 'o2') {
      fn2 = 0;
    } else if (decoGasType === 'ean') {
      fn2 = (100 - decoO2) / 100;
    } else { // ean+o2
      fn2 = d <= 6 ? 0 : (100 - decoO2) / 100;
    }
    while (ceilingDepth(tissues, d, first, gfLow, gfHigh) > d - 0.1) {
      tissues = tissues.map((ti,i)=>({
        n2: update(ti.n2, inspired(d, fn2), ZHL16C[i].tN2, 1),
        he: update(ti.he, 0, ZHL16C[i].tHe, 1)
      }));
      mins++;
      // safety cap to avoid infinite loops
      if (mins > 1000) break;
    }
    if (mins > 0) rows.push({ depth: d, mins, gas: fn2 === 0 ? 'O₂' : `EAN ${decoO2}` });
  }

  return rows;
}
