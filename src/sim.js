/* Pure simulation functions for ZH-L16C decompression planner
   This module is DOM-free and returns schedule rows for rendering.
*/
export const TISSUE_LABELS = [
  'Blood/Lung', 'Brain', 'Spinal Cord', 'Muscle (fast)',
  'Muscle', 'Muscle (med)', 'Muscle (slow)', 'Fat (fast)',
  'Fat', 'Fat (med)', 'Fat (slow)', 'Cartilage (fast)',
  'Cartilage', 'Bone Marrow', 'Bone', 'Bone (slow)'
];

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

// Calculate M-value (maximum tolerated tissue pressure) for a compartment
function calculateMValue(tissue, depth, first, gfLow, gfHigh, compIndex) {
  const c = ZHL16C[compIndex];
  const pt = tissue.n2 + tissue.he;
  if (pt === 0) return 0;
  const a = (c.aN2 * tissue.n2 + c.aHe * tissue.he) / pt;
  const b = (c.bN2 * tissue.n2 + c.bHe * tissue.he) / pt;
  const pamb = (pt - a) / b;
  const gfValue = gf(depth, first, gfLow, gfHigh);
  return 1 + gfValue * (pamb - 1);
}

// Capture tissue state snapshot for timeline visualization
function captureTimelineSnapshot(tissues, time, depth, phase, gfLow, gfHigh) {
  // For timeline, use the current depth as reference (not a fixed ceiling depth)
  // This gives more accurate saturation readings during descent/ascent
  const depthRef = Math.max(depth, 0);
  
  return {
    time,
    depth,
    phase,
    tissues: tissues.map((t, i) => ({
      n2: t.n2,
      he: t.he,
      total: t.n2 + t.he,
      // Calculate M-value at current depth with conservative GF
      mValue: calculateMValueAtDepth(t, depthRef, gfLow, gfHigh, i),
      compartment: i + 1,
      label: TISSUE_LABELS[i]
    }))
  };
}

// Calculate M-value at a specific depth (used for timeline visualization)
function calculateMValueAtDepth(tissue, depth, gfLow, gfHigh, compIndex) {
  const c = ZHL16C[compIndex];
  const pt = tissue.n2 + tissue.he;
  if (pt === 0) return 0;
  const a = (c.aN2 * tissue.n2 + c.aHe * tissue.he) / pt;
  const b = (c.bN2 * tissue.n2 + c.bHe * tissue.he) / pt;
  const pamb = (pt - a) / b;
  // Use current depth for GF interpolation (conservative during descent)
  const gfValue = gf(depth, depth, gfLow, gfHigh);
  return 1 + gfValue * (pamb - 1);
}

// computeDecompressionSchedule returns an array of rows { depth, mins, gas }
export function computeDecompressionSchedule({ depth, time, gasLabel, gfLow, gfHigh, noGasSwitch, decoGasType, decoO2, customType, customO2, customTrimixO2, customHe, useO2Shallow, ascentMode, ascentRate, deepAscentRate, shallowThreshold, shallowAscentRate, lastStopDepth, descentRate }) {
  const bottomGas = gasLabel === '18/45'
    ? { o2:0.18, he:0.45 }
    : gasLabel === '21/35'
    ? { o2:0.21, he:0.35 }
    : gasLabel === '28'
    ? { o2:0.28, he:0 }
    : gasLabel === '32'
    ? { o2:0.32, he:0 }
    : gasLabel === 'custom'
    ? customType === 'trimix'
      ? { o2: customTrimixO2 / 100, he: customHe / 100 }
      : { o2: customO2 / 100, he: 0 }
    : { o2:0.21, he:0 };

  let tissues = initTissues();

  // Determine deco gas to use - if no gas switch, use bottom gas for entire dive
  const useBottomGasForDeco = noGasSwitch;
  const decoGas = useBottomGasForDeco ? bottomGas : null;

  for (let t=0; t<time; t++) {
    const fn2 = 1 - bottomGas.o2 - bottomGas.he;
    tissues = tissues.map((ti,i)=>({
      n2: update(ti.n2, inspired(depth, fn2), ZHL16C[i].tN2, 1),
      he: update(ti.he, inspired(depth, bottomGas.he), ZHL16C[i].tHe, 1)
    }));
  }

  const first = Math.ceil(ceilingDepth(tissues, depth, depth, gfLow, gfHigh) / 3) * 3;
  const rows = [];
  let totalRuntime = depth / descentRate + time;
  let totalDecoTime = 0;
  const schedule = [];
  let accumulated = 0;
  
  // Track tissue snapshots at key points
  const tissueSnapshots = [];
  
  // Track tissue timeline snapshots (every ~1 minute throughout the dive)
  const tissueTimeline = [];

  // Descent
  const descentTime = depth / descentRate;
  accumulated += descentTime;
  
  // Capture tissue snapshots during descent (every 1m depth or less)
  for (let d = 0; d <= depth; d += Math.max(1, Math.ceil(depth / 10))) {
    const t = d / descentRate;
    let descentTissues = initTissues();
    const fn2 = 1 - bottomGas.o2 - bottomGas.he;
    for (let i = 0; i < t; i++) {
      descentTissues = descentTissues.map((ti, j) => ({
        n2: update(ti.n2, inspired(d, fn2), ZHL16C[j].tN2, 1),
        he: update(ti.he, inspired(d, bottomGas.he), ZHL16C[j].tHe, 1)
      }));
    }
    tissueTimeline.push(captureTimelineSnapshot(descentTissues, Math.ceil(t), d, 'Descent', gfLow, gfHigh));
  }
  
  schedule.push({
    phase: 'Descent',
    depth: `0-${depth}m`,
    rate: `${descentRate} m/min`,
    time: Math.ceil(descentTime),
    accumulated: Math.ceil(accumulated)
  });

  // Bottom
  accumulated += time;
  
  // Capture tissue snapshots during bottom time (every minute)
  for (let t = 0; t <= time; t += 1) {
    const snapshotTissues = tissues.map((ti, i) => ({
      n2: update(ti.n2, inspired(depth, 1 - bottomGas.o2 - bottomGas.he), ZHL16C[i].tN2, t),
      he: update(ti.he, inspired(depth, bottomGas.he), ZHL16C[i].tHe, t)
    }));
    tissueTimeline.push(captureTimelineSnapshot(snapshotTissues, Math.ceil(descentTime + t), depth, 'Bottom', gfLow, gfHigh));
  }
  
  schedule.push({
    phase: 'Bottom',
    depth: `${depth}m`,
    rate: '',
    time: time,
    accumulated: Math.ceil(accumulated)
  });
  
  // Capture tissue state at end of bottom time
  tissueSnapshots.push({
    phase: 'Bottom',
    depth: depth,
    time: Math.ceil(accumulated),
    tissues: tissues.map((t, i) => ({
      n2: t.n2,
      he: t.he,
      total: t.n2 + t.he,
      mValue: calculateMValue(t, depth, first, gfLow, gfHigh, i),
      compartment: i + 1,
      label: TISSUE_LABELS[i]
    }))
  });

  // Track current depth - we're at bottom depth initially
  let previousStopDepth = depth;
  
  for (let d = first; d > lastStopDepth; d -= 3) {
    let mins = 0;
    let fn2, fhe;
    if (useBottomGasForDeco) {
      fn2 = 1 - decoGas.o2 - decoGas.he;
      fhe = decoGas.he;
    } else if (decoGasType === 'o2') {
      fn2 = 0;
      fhe = 0;
    } else {
      fn2 = (useO2Shallow && d <= 6) ? 0 : (100 - decoO2) / 100;
      fhe = 0;
    }
    while (ceilingDepth(tissues, d, first, gfLow, gfHigh) > d - 0.1) {
      tissues = tissues.map((ti,i)=>({
        n2: update(ti.n2, inspired(d, fn2), ZHL16C[i].tN2, 1),
        he: update(ti.he, inspired(d, fhe), ZHL16C[i].tHe, 1)
      }));
      mins++;
      // safety cap to avoid infinite loops
      if (mins > 1000) break;
    }
    if (mins > 0) {
      const gasLabel = useBottomGasForDeco
        ? (decoGas.he > 0 ? `Trimix ${Math.round(decoGas.o2*100)}/${Math.round(decoGas.he*100)}` : (decoGas.o2 === 0.21 ? 'Air' : `EAN ${Math.round(decoGas.o2*100)}`))
        : (fn2 === 0 ? 'O₂' : `EAN ${decoO2}`);
      rows.push({ depth: d, mins, gas: gasLabel });
      totalDecoTime += mins;
      
      // Add ascent from previous stop/position to this stop
      if (previousStopDepth !== d) {
        const rate = ascentMode === 'single' ? ascentRate : (previousStopDepth > shallowThreshold ? deepAscentRate : shallowAscentRate);
        const ascentTime = (previousStopDepth - d) / rate;
        totalRuntime += ascentTime;
        accumulated += ascentTime;
        
        // Capture tissue snapshots during ascent
        for (let t = 0; t <= ascentTime; t += 0.5) {
          const ascentDepth = previousStopDepth - (rate * t);
          const ascentTissues = tissues.map((ti, i) => ({
            n2: update(ti.n2, inspired(ascentDepth, fn2), ZHL16C[i].tN2, 0.5),
            he: update(ti.he, inspired(ascentDepth, fhe), ZHL16C[i].tHe, 0.5)
          }));
          tissueTimeline.push(captureTimelineSnapshot(ascentTissues, Math.ceil(accumulated - ascentTime + t), Math.round(ascentDepth), 'Ascent', gfLow, gfHigh));
        }
        
        schedule.push({
          phase: 'Ascent',
          depth: `${previousStopDepth}-${d}m`,
          rate: `${rate.toFixed(1)} m/min`,
          time: Math.ceil(ascentTime),
          accumulated: Math.ceil(accumulated)
        });
        tissues = tissues.map((ti,i)=>({
          n2: update(ti.n2, inspired(previousStopDepth, fn2), ZHL16C[i].tN2, ascentTime),
          he: update(ti.he, 0, ZHL16C[i].tHe, ascentTime)
        }));
      }
      
      // Add the stop with timeline snapshots
      accumulated += mins;
      
      // Capture tissue snapshots during stop (every minute if stop is long)
      for (let t = 0; t <= mins; t += 1) {
        const stopTissues = tissues.map((ti, i) => ({
          n2: update(ti.n2, inspired(d, fn2), ZHL16C[i].tN2, t),
          he: update(ti.he, inspired(d, fhe), ZHL16C[i].tHe, t)
        }));
        tissueTimeline.push(captureTimelineSnapshot(stopTissues, Math.ceil(accumulated - mins + t), d, 'Stop', gfLow, gfHigh));
      }
      schedule.push({
        phase: 'Stop',
        depth: `${d}m`,
        rate: '',
        time: mins,
        accumulated: Math.ceil(accumulated)
      });
      
      // Capture tissue state at this stop
      tissueSnapshots.push({
        phase: `Stop @ ${d}m`,
        depth: d,
        time: Math.ceil(accumulated),
        tissues: tissues.map((t, i) => ({
          n2: t.n2,
          he: t.he,
          total: t.n2 + t.he,
          mValue: calculateMValue(t, d, first, gfLow, gfHigh, i),
          compartment: i + 1,
          label: TISSUE_LABELS[i]
        }))
      });
      
      previousStopDepth = d;
      totalRuntime += mins;
    } else {
      // No stop needed at this depth - ascend through it
      // Update tissues for ascending from previousStopDepth through this depth
      if (previousStopDepth > d) {
        const rate = ascentMode === 'single' ? ascentRate : (previousStopDepth > shallowThreshold ? deepAscentRate : shallowAscentRate);
        const ascentTime = 3 / rate; // 3m depth change
        tissues = tissues.map((ti,i)=>({
          n2: update(ti.n2, inspired(d, fn2), ZHL16C[i].tN2, ascentTime),
          he: update(ti.he, inspired(d, fhe), ZHL16C[i].tHe, ascentTime)
        }));
        // Don't add to schedule - this is just passing through
        // Don't update previousStopDepth - we're still ascending from same position
      }
    }
  }

  // Last stop at lastStopDepth
  if (lastStopDepth > 0) {
    let d = lastStopDepth;
    let mins = 0;
    let fn2, fhe;
    if (useBottomGasForDeco) {
      fn2 = 1 - decoGas.o2 - decoGas.he;
      fhe = decoGas.he;
    } else if (decoGasType === 'o2') {
      fn2 = 0;
      fhe = 0;
    } else {
      fn2 = (useO2Shallow && d <= 6) ? 0 : (100 - decoO2) / 100;
      fhe = 0;
    }
    while (ceilingDepth(tissues, d, first, gfLow, gfHigh) > d - 0.1) {
      tissues = tissues.map((ti,i)=>({
        n2: update(ti.n2, inspired(d, fn2), ZHL16C[i].tN2, 1),
        he: update(ti.he, inspired(d, fhe), ZHL16C[i].tHe, 1)
      }));
      mins++;
      if (mins > 1000) break;
    }
    if (mins > 0) {
      const gasLabel = useBottomGasForDeco
        ? (decoGas.he > 0 ? `Trimix ${Math.round(decoGas.o2*100)}/${Math.round(decoGas.he*100)}` : (decoGas.o2 === 0.21 ? 'Air' : `EAN ${Math.round(decoGas.o2*100)}`))
        : (fn2 === 0 ? 'O₂' : `EAN ${decoO2}`);
      rows.push({ depth: d, mins, gas: gasLabel });
      totalDecoTime += mins;
      
      // Add ascent from previous stop to this stop
      if (previousStopDepth !== d) {
        const rate = ascentMode === 'single' ? ascentRate : (previousStopDepth > shallowThreshold ? deepAscentRate : shallowAscentRate);
        const ascentTime = (previousStopDepth - d) / rate;
        totalRuntime += ascentTime;
        accumulated += ascentTime;
        schedule.push({
          phase: 'Ascent',
          depth: `${previousStopDepth}-${d}m`,
          rate: `${rate.toFixed(1)} m/min`,
          time: Math.ceil(ascentTime),
          accumulated: Math.ceil(accumulated)
        });
        tissues = tissues.map((ti,i)=>({
          n2: update(ti.n2, inspired(previousStopDepth, fn2), ZHL16C[i].tN2, ascentTime),
          he: update(ti.he, inspired(previousStopDepth, fhe), ZHL16C[i].tHe, ascentTime)
        }));
      }
      
      // Add the stop
      accumulated += mins;
      schedule.push({
        phase: 'Stop',
        depth: `${d}m`,
        rate: '',
        time: mins,
        accumulated: Math.ceil(accumulated)
      });

      // Capture tissue state at this final stop as well
      tissueSnapshots.push({
        phase: `Stop @ ${d}m`,
        depth: d,
        time: Math.ceil(accumulated),
        tissues: tissues.map((t, i) => ({
          n2: t.n2,
          he: t.he,
          total: t.n2 + t.he,
          mValue: calculateMValue(t, d, first, gfLow, gfHigh, i),
          compartment: i + 1,
          label: TISSUE_LABELS[i]
        }))
      });
      
      previousStopDepth = d;
    }
    totalRuntime += mins;

    // Ascent to surface from last stop
    const rate = ascentMode === 'single' ? ascentRate : (d > shallowThreshold ? deepAscentRate : shallowAscentRate);
    const ascentTime = d / rate;
    totalRuntime += ascentTime;
    accumulated += ascentTime;
    schedule.push({
      phase: 'Ascent',
      depth: `${d}-0m`,
      rate: `${rate.toFixed(1)} m/min`,
      time: Math.ceil(ascentTime),
      accumulated: Math.ceil(accumulated)
    });
    tissues = tissues.map((ti,i)=>({
      n2: update(ti.n2, inspired(d, fn2), ZHL16C[i].tN2, ascentTime),
      he: update(ti.he, inspired(d, fhe), ZHL16C[i].tHe, ascentTime)
    }));
  }

  // Capture final tissue state at surface
  tissueSnapshots.push({
    phase: 'Surface',
    depth: 0,
    time: Math.ceil(accumulated),
    tissues: tissues.map((t, i) => ({
      n2: t.n2,
      he: t.he,
      total: t.n2 + t.he,
      mValue: calculateMValue(t, 0, first, gfLow, gfHigh, i),
      compartment: i + 1,
      label: TISSUE_LABELS[i]
    }))
  });
  
  // Add final surface snapshot to timeline
  tissueTimeline.push(captureTimelineSnapshot(tissues, Math.ceil(accumulated), 0, 'Surface', gfLow, gfHigh));
  
  return { rows, totalRuntime: Math.ceil(totalRuntime), totalDecoTime, schedule, tissueSnapshots, tissueTimeline };
}
