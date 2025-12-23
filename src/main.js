import { computeDecompressionSchedule, TISSUE_LABELS, ZHL16C } from './sim.js';

// Keep last computed result to allow graph re-render on expand
let lastResult = null;

const M_TO_FT = 3.28084;

function mToFt(m) { return m * M_TO_FT; }
function ftToM(ft) { return ft / M_TO_FT; }

// Toggle graph collapse/expand
function toggleGraph(section) {
  const graphSection = section || document.querySelector('.graph-section');
  if (graphSection) {
    graphSection.classList.toggle('collapsed');
  }
}

// Wire up collapse toggle on graph headers
document.querySelectorAll('.graph-header').forEach(header => {
  header.addEventListener('click', function() {
    const graphSection = this.closest('.graph-section');
    toggleGraph(graphSection);
    // If expanding, re-render the appropriate graph after transition so widths are correct
    const isExpanding = !graphSection.classList.contains('collapsed');
    if (isExpanding && lastResult) {
      const svg = graphSection.querySelector('svg');
      const rerender = () => {
        if (svg && svg.id === 'diveProfileChart') {
          const selectedStrategies = [
            { id: 'compareLinear', label: 'Linear', key: 'linear' },
            { id: 'compareSCurve', label: 'S-curve', key: 's-curve' },
            { id: 'compareExponential', label: 'Exponential', key: 'exponential' }
          ].filter(x => {
            const el = document.getElementById(x.id);
            return el && el.checked;
          });
          createDiveProfileGraph(lastResult, selectedStrategies);
        } else if (svg && svg.id === 'fullDiveProfileChart') {
          createFullDiveProfileGraph(lastResult);
        } else if (svg && svg.id === 'timelineSaturationChart') {
          createTimelineSaturationGraph(lastResult);
        }
      };
      setTimeout(rerender, 320); // match CSS transition duration
    }
  });
});

// Create D3.js dive profile visualization
function createDiveProfileGraph(result, strategies = []) {
  const { rows, totalRuntime, totalDecoTime } = result;
  const depth = Number(depthInput.value) || 0;
  const time = Number(timeInput.value) || 0;
  
  if (!depth || !time) return;

  // Helper to build data points for a given stop schedule
  const buildData = (stopRows) => {
    const data = [];
    let currentTime = time;
    data.push({ time: currentTime, depth: depth, phase: 'bottom', stopTime: 0, accumulated: time });
    let previousDepth = depth;
    let lastAccumulated = time;
    
    stopRows.forEach((row, idx) => {
      const stopDepth = row.depth;
      const stopTime = row.mins;
      const depthDifference = previousDepth - stopDepth;
      const ascentRate = 10;
      const ascentTime = depthDifference / ascentRate;
      currentTime += ascentTime;
      lastAccumulated += ascentTime;
      if (idx === 0 || previousDepth !== stopDepth) {
        data.push({ time: currentTime, depth: stopDepth, phase: 'ascent-end', stopTime: 0, accumulated: Math.ceil(lastAccumulated) });
      }
      currentTime += stopTime;
      lastAccumulated += stopTime;
      data.push({ time: currentTime, depth: stopDepth, phase: 'stop', stopTime: stopTime, accumulated: Math.ceil(lastAccumulated) });
      previousDepth = stopDepth;
    });
    const finalAscentTime = previousDepth / 10;
    currentTime += finalAscentTime;
    lastAccumulated += finalAscentTime;
    data.push({ time: currentTime, depth: 0, phase: 'surface', stopTime: 0, accumulated: Math.ceil(lastAccumulated) });
    return data;
  };

  // Build baseline data
  const data = buildData(rows);
  
  // Build data for each selected strategy
  const strategyColors = { linear: '#10b981', 's-curve': '#f59e0b', exponential: '#ef4444' };
  const strategyData = strategies.map(s => ({
    label: s.label,
    color: strategyColors[s.key] || '#cbd5e1',
    data: buildData(redistributeStops(rows, totalDecoTime, s.key))
  }));
  
  // D3 dimensions
  const margin = { top: 30, right: 40, bottom: 50, left: 60 };
  const svgElement = document.getElementById('diveProfileChart');
  const width = svgElement.clientWidth - margin.left - margin.right;
  const height = svgElement.clientHeight - margin.top - margin.bottom;
  
  // Clear previous chart
  d3.select(svgElement).selectAll("*").remove();
  
  const svg = d3.select(svgElement)
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  // Scales
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.time) + 10])
    .range([0, width]);
  
  const yScale = d3.scaleLinear()
    .domain([0, depth]) // Surface (0) to max depth
    .range([0, height]);
  
  // Axes
  const xAxis = d3.axisBottom(xScale).ticks(8);
  const yAxis = d3.axisLeft(yScale).ticks(Math.ceil(depth / 5)).tickFormat(d => Math.round(d));
  
  // Grid lines for Y-axis (every 5m)
  svg.selectAll('.d3-grid-line')
    .data(d3.range(0, depth + 1, 5))
    .enter()
    .append('line')
    .attr('class', 'd3-grid-line')
    .attr('x1', 0)
    .attr('x2', width)
    .attr('y1', d => yScale(d))
    .attr('y2', d => yScale(d));
  
  // Add Y-axis
  svg.append('g')
    .attr('class', 'd3-axis')
    .call(yAxis);
  
  // Add X-axis
  svg.append('g')
    .attr('class', 'd3-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis);
  
  // Y-axis label
  svg.append('text')
    .attr('class', 'd3-axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left + 15)
    .attr('x', 0 - (height / 2))
    .attr('dy', '1em')
    .style('text-anchor', 'middle')
    .text('Depth (m)');
  
  // X-axis label
  svg.append('text')
    .attr('class', 'd3-axis-label')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 10)
    .style('text-anchor', 'middle')
    .text('Dive Time (min)');
  
  // Line generator
  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(d.depth));
  
  // Draw profile line
  svg.append('path')
    .datum(data)
    .attr('class', 'd3-profile-line')
    .attr('d', line);

  // Draw strategy overlay lines (dashed) for each selected strategy
  if (strategyData && strategyData.length > 0) {
    strategyData.forEach(s => {
      svg.append('path')
        .datum(s.data)
        .attr('class', 'd3-strategy-line')
        .attr('d', line)
        .style('stroke', s.color)
        .style('stroke-width', '2')
        .style('stroke-dasharray', '4,4')
        .style('fill', 'none')
        .attr('data-strategy', s.label);
    });

    // Legend: baseline + strategies
    const legendY = 10;
    const legendX = width - 150;
    svg.append('line')
      .attr('x1', legendX)
      .attr('x2', legendX + 30)
      .attr('y1', legendY)
      .attr('y2', legendY)
      .attr('stroke', 'var(--accent-cyan)')
      .attr('stroke-width', '2.5');
    svg.append('text')
      .attr('x', legendX + 35)
      .attr('y', legendY + 4)
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', '0.85rem')
      .text('Baseline');

    strategyData.forEach((s, i) => {
      const y = legendY + (i + 1) * 20;
      svg.append('line')
        .attr('x1', legendX)
        .attr('x2', legendX + 30)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', s.color)
        .attr('stroke-width', '2')
        .attr('stroke-dasharray', '4,4');
      svg.append('text')
        .attr('x', legendX + 35)
        .attr('y', y + 4)
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', '0.85rem')
        .text(s.label);
    });
  }
  
  // Add feather lines from key points (stops, descent end, bottom end) to surface
  data.forEach(d => {
    if ((d.phase === 'stop' || d.phase === 'descent' || d.phase === 'bottom') && d.depth > 0) {
      svg.append('line')
        .attr('class', 'd3-feather-line')
        .attr('x1', xScale(d.time))
        .attr('x2', xScale(d.time))
        .attr('y1', yScale(d.depth))
        .attr('y2', yScale(0));
    }
  });
  
  // Add points for stops and key events
  svg.selectAll('.d3-stop-point')
    .data(data.filter(d => d.phase === 'stop' || d.phase === 'descent' || d.phase === 'bottom'))
    .enter()
    .append('circle')
    .attr('class', 'd3-stop-point')
    .attr('cx', d => xScale(d.time))
    .attr('cy', d => yScale(d.depth))
    .attr('r', 4)
    .on('mouseover', function(event, d) {
      showTooltip(event, d);
    })
    .on('mouseout', hideTooltip);
}

// Create full dive schedule profile graph (including descent and bottom time)
function createFullDiveProfileGraph(result) {
  const { rows, schedule } = result;
  const depth = Number(depthInput.value) || 0;
  const time = Number(timeInput.value) || 0;
  const descentRate = Number(document.getElementById('descentRate').value) || 20;
  
  if (!depth || !time) return;

  // Build data points for complete dive profile
  const data = [];
  let currentTime = 0;
  
  // Add surface start
  data.push({ time: 0, depth: 0, phase: 'surface-start', stopTime: 0, accumulated: 0 });
  
  // Add descent
  const descentTime = depth / descentRate;
  currentTime = descentTime;
  // Mark end of descent (max depth reached)
  data.push({ time: currentTime, depth: depth, phase: 'descent', stopTime: descentTime, accumulated: Math.ceil(currentTime) });
  
  // Add bottom time (end of bottom marks ascent start)
  currentTime += time;
  data.push({ time: currentTime, depth: depth, phase: 'bottom', stopTime: time, accumulated: Math.ceil(currentTime) });
  
  // Parse schedule for ascent and stops
  let previousDepth = depth;
  
  rows.forEach((row, idx) => {
    const stopDepth = row.depth;
    const stopTime = row.mins;
    
    // Time for ascent from previous depth to this depth
    const depthDifference = previousDepth - stopDepth;
    const ascentRate = 10; // Default ascent rate
    const ascentTime = depthDifference / ascentRate;
    
    currentTime += ascentTime;
    
    // Add ascent endpoint
    if (idx === 0 || previousDepth !== stopDepth) {
      data.push({ time: currentTime, depth: stopDepth, phase: 'ascent-end', stopTime: 0, accumulated: Math.ceil(currentTime) });
    }
    
    // Add stop
    currentTime += stopTime;
    data.push({ time: currentTime, depth: stopDepth, phase: 'stop', stopTime: stopTime, accumulated: Math.ceil(currentTime) });
    
    previousDepth = stopDepth;
  });
  
  // Add final ascent to surface
  const finalAscentTime = previousDepth / 10;
  currentTime += finalAscentTime;
  data.push({ time: currentTime, depth: 0, phase: 'surface', stopTime: 0, accumulated: Math.ceil(currentTime) });
  
  // D3 dimensions
  const margin = { top: 30, right: 40, bottom: 50, left: 60 };
  const svgElement = document.getElementById('fullDiveProfileChart');
  const width = svgElement.clientWidth - margin.left - margin.right;
  const height = svgElement.clientHeight - margin.top - margin.bottom;
  
  // Clear previous chart
  d3.select(svgElement).selectAll("*").remove();
  
  const svg = d3.select(svgElement)
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  // Scales
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.time) + 10])
    .range([0, width]);
  
  const yScale = d3.scaleLinear()
    .domain([0, depth]) // Surface (0) to max depth
    .range([0, height]);
  
  // Axes
  const xAxis = d3.axisBottom(xScale).ticks(8);
  const yAxis = d3.axisLeft(yScale).ticks(Math.ceil(depth / 5)).tickFormat(d => Math.round(d));
  
  // Grid lines for Y-axis (every 5m)
  svg.selectAll('.d3-grid-line')
    .data(d3.range(0, depth + 1, 5))
    .enter()
    .append('line')
    .attr('class', 'd3-grid-line')
    .attr('x1', 0)
    .attr('x2', width)
    .attr('y1', d => yScale(d))
    .attr('y2', d => yScale(d));
  
  // Add Y-axis
  svg.append('g')
    .attr('class', 'd3-axis')
    .call(yAxis);
  
  // Add X-axis
  svg.append('g')
    .attr('class', 'd3-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis);
  
  // Y-axis label
  svg.append('text')
    .attr('class', 'd3-axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left + 15)
    .attr('x', 0 - (height / 2))
    .attr('dy', '1em')
    .style('text-anchor', 'middle')
    .text('Depth (m)');
  
  // X-axis label
  svg.append('text')
    .attr('class', 'd3-axis-label')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 10)
    .style('text-anchor', 'middle')
    .text('Total Dive Time (min)');
  
  // Line generator
  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(d.depth));
  
  // Draw profile line
  svg.append('path')
    .datum(data)
    .attr('class', 'd3-profile-line')
    .attr('d', line);
  
  // Note: strategy overlays are shown on the Dive Ascent Profile.
  // The full profile graph renders the baseline only for clarity.
  
  // Add feather lines from stops to surface
  data.forEach(d => {
    if (d.phase === 'stop' && d.depth > 0) {
      svg.append('line')
        .attr('class', 'd3-feather-line')
        .attr('x1', xScale(d.time))
        .attr('x2', xScale(d.time))
        .attr('y1', yScale(d.depth))
        .attr('y2', yScale(0));
    }
  });
  
  // Add stop points
  svg.selectAll('.d3-stop-point')
    .data(data.filter(d => d.phase === 'stop'))
    .enter()
    .append('circle')
    .attr('class', 'd3-stop-point')
    .attr('cx', d => xScale(d.time))
    .attr('cy', d => yScale(d.depth))
    .attr('r', 4)
    .on('mouseover', function(event, d) {
      showTooltip(event, d);
    })
    .on('mouseout', hideTooltip);
  
  // Legend omitted here to keep focus on ascent comparison in the other graph.
}

// Tooltip functions
let currentTooltip = null;

function showTooltip(event, d) {
  let tooltip = document.querySelector('.d3-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'd3-tooltip';
    document.body.appendChild(tooltip);
    currentTooltip = tooltip;
  }
  
  const phaseLabel = d.phase === 'stop'
    ? 'Deco Stop'
    : d.phase === 'descent'
    ? 'Max Depth Reached'
    : d.phase === 'bottom'
    ? 'Ascent Start'
    : d.phase;

  const durationLabel = d.phase === 'stop' ? 'Stop Time' : 'Segment Time';
  const content = `
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">Type:</span>
      <span>${phaseLabel}</span>
    </div>
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">Depth:</span>
      <span>${d.depth}m</span>
    </div>
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">${durationLabel}:</span>
      <span>${Math.round(d.stopTime)}m</span>
    </div>
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">Accumulated:</span>
      <span>${Math.round(d.accumulated)}m</span>
    </div>
  `;
  
  tooltip.innerHTML = content;
  tooltip.classList.add('active');
  
  const x = event.pageX + 10;
  const y = event.pageY - 30;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.classList.remove('active');
  }
}

const depthInput = document.getElementById('depth');
const timeInput = document.getElementById('time');
const gasSelect = document.getElementById('gas');
const gfLowInput = document.getElementById('gfLow');
const gfHighInput = document.getElementById('gfHigh');
const decoGasTypeSelect = document.getElementById('decoGasType');
const eanO2Container = document.getElementById('eanO2Container');
const out = document.getElementById('output');
const btn = document.getElementById('planBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const customGasContainer = document.getElementById('customGasContainer');
const customTypeSelect = document.getElementById('customType');
const nitroxInputs = document.getElementById('nitroxInputs');
const trimixInputs = document.getElementById('trimixInputs');
const o2ShallowContainer = document.getElementById('o2ShallowContainer');
const ascentModeSelect = document.getElementById('ascentMode');
const singleAscent = document.getElementById('singleAscent');
const multiAscent = document.getElementById('multiAscent');
const unitsSelect = document.getElementById('units');
let lastUnits = unitsSelect ? unitsSelect.value : 'metric';

function updateDecoUI() {
  const noSwitch = document.getElementById('noGasSwitch').checked;
  const decoGasContainer = document.getElementById('decoGasContainer');
  
  decoGasContainer.style.display = noSwitch ? 'none' : 'block';
  
  if (!noSwitch) {
    const type = decoGasTypeSelect.value;
    eanO2Container.style.display = type === 'o2' ? 'none' : 'block';
    o2ShallowContainer.style.display = type === 'o2' ? 'none' : 'block';
    document.getElementById('useO2Shallow').checked = type === 'ean+o2';
  }
}

decoGasTypeSelect.addEventListener('change', updateDecoUI);
document.getElementById('noGasSwitch').addEventListener('change', updateDecoUI);
updateDecoUI();

function updateGasUI() {
  const gas = gasSelect.value;
  customGasContainer.style.display = gas === 'custom' ? 'block' : 'none';
  if (gas === 'custom') {
    updateCustomUI();
  }
}

gasSelect.addEventListener('change', updateGasUI);
updateGasUI();

function updateCustomUI() {
  const type = customTypeSelect.value;
  nitroxInputs.style.display = type === 'nitrox' ? 'block' : 'none';
  trimixInputs.style.display = type === 'trimix' ? 'block' : 'none';
}

customTypeSelect.addEventListener('change', updateCustomUI);

function updateAscentUI() {
  const mode = ascentModeSelect.value;
  singleAscent.style.display = mode === 'single' ? 'block' : 'none';
  multiAscent.style.display = mode === 'multi' ? 'block' : 'none';
}

ascentModeSelect.addEventListener('change', updateAscentUI);

function updateUnits() {
  const units = unitsSelect.value;
  const isImperial = units === 'imperial';

  // Update main labels
  document.getElementById('depthLabel').textContent = `Max Depth (${isImperial ? 'ft' : 'm'})`;
  document.getElementById('timeLabel').textContent = 'Bottom Time (min)';
  document.getElementById('gfLowLabel').textContent = 'GF Low';
  document.getElementById('gfHighLabel').textContent = 'GF High';
  document.getElementById('decoGasLabel').textContent = 'Deco Gas';
  document.getElementById('depthHeader').textContent = `Depth (${isImperial ? 'ft' : 'm'})`;

  // Update settings labels
  document.getElementById('ascentModeLabel').textContent = 'Ascent Rate Mode';
  document.getElementById('ascentRateLabel').textContent = `Ascent Rate (${isImperial ? 'ft' : 'm'}/min)`;
  document.getElementById('deepAscentRateLabel').textContent = `Deep Ascent Rate (${isImperial ? 'ft' : 'm'}/min)`;
  document.getElementById('shallowThresholdLabel').textContent = `Shallow Depth Threshold (${isImperial ? 'ft' : 'm'})`;
  document.getElementById('shallowAscentRateLabel').textContent = `Shallow Ascent Rate (${isImperial ? 'ft' : 'm'}/min)`;
  document.getElementById('lastStopDepthLabel').textContent = `Last Stop Depth (${isImperial ? 'ft' : 'm'})`;
  document.getElementById('descentRateLabel').textContent = `Descent Rate (${isImperial ? 'ft' : 'm'}/min)`;

  // Convert input values ONLY when units changed
  if (units !== lastUnits) {
    if (isImperial) {
      depthInput.value = Math.round(mToFt(depthInput.value));
      document.getElementById('ascentRate').value = Math.round(mToFt(document.getElementById('ascentRate').value));
      document.getElementById('deepAscentRate').value = Math.round(mToFt(document.getElementById('deepAscentRate').value));
      document.getElementById('shallowThreshold').value = Math.round(mToFt(document.getElementById('shallowThreshold').value));
      document.getElementById('shallowAscentRate').value = Math.round(mToFt(document.getElementById('shallowAscentRate').value));
      document.getElementById('descentRate').value = Math.round(mToFt(document.getElementById('descentRate').value));
    } else {
      depthInput.value = Math.round(ftToM(depthInput.value));
      document.getElementById('ascentRate').value = Math.round(ftToM(document.getElementById('ascentRate').value));
      document.getElementById('deepAscentRate').value = Math.round(ftToM(document.getElementById('deepAscentRate').value));
      document.getElementById('shallowThreshold').value = Math.round(ftToM(document.getElementById('shallowThreshold').value));
      document.getElementById('shallowAscentRate').value = Math.round(ftToM(document.getElementById('shallowAscentRate').value));
      document.getElementById('descentRate').value = Math.round(ftToM(document.getElementById('descentRate').value));
    }
  }

  // Remember current units
  lastUnits = units;
}

document.getElementById('units').addEventListener('change', () => {
  updateUnits();
  triggerRecalculation();
});

function triggerRecalculation() {
  const depth = Number(depthInput.value) || 0;
  if (depth > 0) {
    btn.click();
  }
}

// Add listeners to all settings inputs for automatic recalculation
const settingsInputs = [
  'ascentRate', 'deepAscentRate', 'shallowThreshold', 'shallowAscentRate',
  'lastStopDepth', 'descentRate', 'ascentMode'
];
settingsInputs.forEach(id => {
  const elem = document.getElementById(id);
  if (elem) {
    elem.addEventListener('change', triggerRecalculation);
  }
});

// Add listeners to main dive parameters
const diveInputs = [
  'depth', 'time', 'gas', 'gfLow', 'gfHigh', 'decoGasType', 'noGasSwitch',
  'decoO2', 'customO2', 'customTrimixO2', 'customHe', 'useO2Shallow', 'customType'
];
diveInputs.forEach(id => {
  const elem = document.getElementById(id);
  if (elem) {
    elem.addEventListener('change', triggerRecalculation);
  }
});

// Strategy toggles auto-recalculate
['compareLinear','compareSCurve','compareExponential'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', () => {
      // Immediate visual update without recomputation
      if (lastResult) {
        // Ensure graph section is expanded so widths are correct
        const ascentSection = document.querySelector('#graphContainer')?.closest('.graph-section');
        if (ascentSection) ascentSection.classList.remove('collapsed');

        const selectedStrategies = [
          { id: 'compareLinear', label: 'Linear', key: 'linear' },
          { id: 'compareSCurve', label: 'S-curve', key: 's-curve' },
          { id: 'compareExponential', label: 'Exponential', key: 'exponential' }
        ].filter(x => {
          const el2 = document.getElementById(x.id);
          return el2 && el2.checked;
        });

        // Re-render cards and graph with current selection
        renderStrategyCards(lastResult);
        // Delay graph redraw to allow CSS expand transition to complete
        setTimeout(() => {
          createDiveProfileGraph(lastResult, selectedStrategies);
        }, 320);
      } else {
        // Fallback: trigger full recalculation if no cached result yet
        triggerRecalculation();
      }
    });
  }
});

// Render tissue compartment visualization
function renderTissueVisualization(result) {
  const container = document.getElementById('tissueVisualization');
  if (!container || !result.tissueSnapshots) return;

  const snapshots = result.tissueSnapshots || [];
  const stopSnapshots = (snapshots.filter(s => /^Stop/.test(s.phase)) || []).slice().sort((a, b) => b.depth - a.depth);
  const bottomSnapshot = snapshots.find(s => s.phase === 'Bottom');
  const surfaceSnapshot = snapshots.find(s => /Surface/.test(s.phase));

  let html = '<div class="tissue-info">';
  html += '<p class="small" style="margin-bottom: 1rem; color: var(--text-secondary);">Bühlmann ZH-L16C tissue compartment loading. Each card shows all 16 compartments at that stop. Colors indicate saturation level relative to M-value limits.</p>';
  html += '</div>';

  // Decompression stops grid
  if (stopSnapshots.length > 0) {
    html += '<h4 style="margin: 0 0 0.75rem 0;">Decompression Stops</h4>';
    html += '<div class="tissue-snapshots">';
    stopSnapshots.forEach(snapshot => {
      html += renderTissueSnapshotCard(snapshot);
    });
    html += '</div>';
  } else {
    html += '<p class="small" style="margin-bottom: 1rem; color: var(--text-secondary);">No decompression stops for this plan.</p>';
  }

  // Key phases (optional): Bottom and Surface
  const keyPhases = [bottomSnapshot, surfaceSnapshot].filter(Boolean);
  if (keyPhases.length > 0) {
    html += '<h4 style="margin: 1.5rem 0 0.75rem 0;">Key Phases</h4>';
    html += '<div class="tissue-snapshots">';
    keyPhases.forEach(snapshot => {
      html += renderTissueSnapshotCard(snapshot);
    });
    html += '</div>';
  }

  // Legend
  html += '<div class="tissue-legend">';
  html += '<div class="legend-item"><div class="legend-box tissue-n2"></div> Nitrogen (N₂)</div>';
  html += '<div class="legend-item"><div class="legend-box tissue-he"></div> Helium (He)</div>';
  html += '<div class="legend-separator"></div>';
  html += '<div class="legend-item"><div class="legend-box sat-low"></div> Low (&lt;50%)</div>';
  html += '<div class="legend-item"><div class="legend-box sat-medium"></div> Medium (50-80%)</div>';
  html += '<div class="legend-item"><div class="legend-box sat-high"></div> High (&gt;80%)</div>';
  html += '</div>';

  container.innerHTML = html;
}

function renderTissueSnapshotCard(snapshot) {
  let card = `<div class="tissue-snapshot">`;
  card += `<h5>${snapshot.phase}</h5>`;
  card += `<div class="snapshot-meta">Time: ${Math.ceil(snapshot.time)}min | Depth: ${snapshot.depth}m</div>`;

  const tissueData = (snapshot.tissues || []).slice();
  let maxSat = 0;
  let leadingIdx = 0;
  tissueData.forEach((td, i) => {
    const saturation = (td.total / td.mValue) * 100;
    if (saturation > maxSat) {
      maxSat = saturation;
      leadingIdx = i;
    }
  });

  card += '<div class="tissue-bars">';
  tissueData.forEach((td, i) => {
    const saturation = (td.total / td.mValue) * 100;
    const isLeading = i === leadingIdx;
    const satClass = saturation > 80 ? 'high' : saturation > 50 ? 'medium' : 'low';
    const leadingClass = isLeading ? 'leading' : '';

    card += `<div class="tissue-bar-row ${leadingClass}">`;
    card += `<div class="tissue-label"><span class="comp-num">${td.compartment}</span> ${td.label}</div>`;
    card += `<div class="tissue-bar-container">`;

    const n2Pct = (td.n2 / td.mValue) * 100;
    card += `<div class="tissue-bar tissue-n2 sat-${satClass}" style="width: ${n2Pct}%" title="N₂: ${td.n2.toFixed(3)} bar"></div>`;

    if (td.he > 0.01) {
      const hePct = (td.he / td.mValue) * 100;
      card += `<div class="tissue-bar tissue-he sat-${satClass}" style="width: ${hePct}%" title="He: ${td.he.toFixed(3)} bar"></div>`;
    }

    card += '</div>';
    card += `<div class="tissue-value">${saturation.toFixed(0)}%</div>`;
    card += '</div>';
  });
  card += '</div>';

  card += `<div class="leading-tissue-info">Leading: Compartment ${leadingIdx + 1} (${TISSUE_LABELS[leadingIdx]}) at ${maxSat.toFixed(1)}%</div>`;
  card += '</div>';
  return card;
}

// Redistribute stop minutes across strategies while preserving totalDecoTime
function redistributeStops(rows, totalDecoTime, strategy) {
  if (!rows || rows.length === 0) return [];
  // Deep to shallow order as given
  const n = rows.length;
  // Positions 0..n-1 where i=0 deepest, i=n-1 shallowest
  const weights = rows.map((r, i) => {
    const x = i / (n - 1 || 1);
    switch (strategy) {
      case 'linear':
        // Favor shallow stops linearly
        return 1 + x;
      case 's-curve': {
        // Logistic S around mid, steeper curve with k
        const k = 6;
        const s = 1 / (1 + Math.exp(-k * (x - 0.5)));
        return 0.5 + s; // keep positive bias
      }
      case 'exponential':
        // Heavily favor shallow stops
        return Math.exp(2 * x);
      default:
        return 1; // uniform
    }
  });
  const sumW = weights.reduce((a, b) => a + b, 0);
  // Raw minutes per stop
  const raw = rows.map((r, i) => (weights[i] / sumW) * totalDecoTime);
  // Round and fix remainder
  const rounded = raw.map(v => Math.floor(v));
  let remainder = totalDecoTime - rounded.reduce((a, b) => a + b, 0);
  // Distribute remaining minutes to stops with largest fractional parts (bias shallow first)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (let k = 0; k < order.length && remainder > 0; k++) {
    rounded[order[k].i]++;
    remainder--;
  }
  // Build redistributed rows
  return rows.map((r, i) => ({ depth: r.depth, mins: rounded[i], gas: r.gas }));
}

function renderStrategyCards(result) {
  const container = document.getElementById('strategyCards');
  if (!container) return;
  const { rows, totalDecoTime } = result;
  const selected = [
    { id: 'compareLinear', label: 'Linear', key: 'linear' },
    { id: 'compareSCurve', label: 'S-curve', key: 's-curve' },
    { id: 'compareExponential', label: 'Exponential', key: 'exponential' }
  ].filter(x => {
    const el = document.getElementById(x.id);
    return el && el.checked;
  });
  container.innerHTML = '';
  if (selected.length === 0) return;
  const units = document.getElementById('units').value;
  const isImperial = units === 'imperial';
  selected.forEach(s => {
    const altRows = redistributeStops(rows, totalDecoTime, s.key);
    const total = altRows.reduce((a, r) => a + r.mins, 0);
    let html = `<div class="strategy-card"><h4>${s.label} Strategy</h4>`;
    html += '<table><thead><tr><th>Depth</th><th>Time (min)</th><th>Δ</th><th>Gas</th></tr></thead><tbody>';
    altRows.forEach((r, i) => {
      const depth = isImperial ? Math.round(mToFt(r.depth)) : r.depth;
      const baseline = rows[i] ? rows[i].mins : 0;
      const diff = r.mins - baseline;
      const diffClass = diff > 0 ? 'diff-increase' : diff < 0 ? 'diff-decrease' : 'diff-neutral';
      const diffSign = diff > 0 ? '+' : '';
      const diffText = diff !== 0 ? `${diffSign}${diff}` : '—';
      html += `<tr><td>${depth}${isImperial ? 'ft' : ''}</td><td>${r.mins}</td><td class="${diffClass}">${diffText}</td><td>${r.gas}</td></tr>`;
    });
    html += `</tbody></table><div class="small">Total decompression time: ${total} min</div></div>`;
    container.innerHTML += html;
  });
}

// Create interactive tissue saturation heatmap
function createTimelineSaturationGraph(result) {
  const { tissueTimeline } = result;
  if (!tissueTimeline || tissueTimeline.length === 0) return;

  const svgElement = document.getElementById('timelineSaturationChart');
  if (!svgElement) return;

  const margin = { top: 30, right: 20, bottom: 50, left: 120 };
  const width = svgElement.clientWidth - margin.left - margin.right;
  const height = svgElement.clientHeight - margin.top - margin.bottom;

  // Clear previous chart
  d3.select(svgElement).selectAll("*").remove();

  const svg = d3.select(svgElement)
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Sample timeline at regular intervals (every 1 minute max)
  const maxSamples = 100;
  const sampleStep = Math.ceil(tissueTimeline.length / maxSamples);
  const sampledTimeline = [];
  for (let i = 0; i < tissueTimeline.length; i += sampleStep) {
    sampledTimeline.push(tissueTimeline[i]);
  }
  if (sampledTimeline[sampledTimeline.length - 1] !== tissueTimeline[tissueTimeline.length - 1]) {
    sampledTimeline.push(tissueTimeline[tissueTimeline.length - 1]);
  }

  // Scales
  const xScale = d3.scaleBand()
    .domain(sampledTimeline.map((d, i) => i))
    .range([0, width])
    .padding(0.02);

  const yScale = d3.scaleBand()
    .domain(TISSUE_LABELS.map((_, i) => i))
    .range([0, height])
    .padding(0.05);

  // Color scale for saturation (0 = green, 0.5 = orange, 1 = red)
  const colorScale = d3.scaleLinear()
    .domain([0, 0.5, 1])
    .range(['#10b981', '#f59e0b', '#ef4444'])
    .clamp(true);

  // Draw Y-axis labels (compartment numbers)
  svg.selectAll('.y-label')
    .data(TISSUE_LABELS)
    .enter()
    .append('text')
    .attr('class', 'y-label')
    .attr('x', -10)
    .attr('y', (d, i) => yScale(i) + yScale.bandwidth() / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', '0.7rem')
    .attr('fill', 'var(--text-secondary)')
    .text((d, i) => `${i + 1}`);

  // Draw heatmap cells
  const cellWidth = xScale.bandwidth();
  const cellHeight = yScale.bandwidth();

  svg.selectAll('.heatmap-cell')
    .data(sampledTimeline.flatMap((timeSnapshot, tIdx) =>
      timeSnapshot.tissues.map((tissue, cIdx) => ({
        tIdx, cIdx, tissue, timeSnapshot
      }))
    ))
    .enter()
    .append('rect')
    .attr('class', 'heatmap-cell')
    .attr('x', d => xScale(d.tIdx))
    .attr('y', d => yScale(d.cIdx))
    .attr('width', cellWidth)
    .attr('height', cellHeight)
    .attr('fill', d => {
      const saturation = Math.min(d.tissue.total / d.tissue.mValue, 1);
      return colorScale(saturation);
    })
    .attr('stroke', 'var(--bg-darker)')
    .attr('stroke-width', 0.5)
    .on('mouseover', function(event, d) {
      showHeatmapTooltip(event, d);
      d3.select(this).attr('stroke-width', 1.5).attr('stroke', 'var(--accent-cyan)');
    })
    .on('mouseout', function(event, d) {
      hideTooltip();
      d3.select(this).attr('stroke-width', 0.5).attr('stroke', 'var(--bg-darker)');
    });

  // Draw X-axis with time labels (every 10th sample)
  const xAxisScale = d3.scaleLinear()
    .domain([0, sampledTimeline.length - 1])
    .range([0, width]);

  const xAxisTicks = [];
  for (let i = 0; i < sampledTimeline.length; i += Math.max(1, Math.floor(sampledTimeline.length / 10))) {
    xAxisTicks.push(i);
  }
  if (!xAxisTicks.includes(sampledTimeline.length - 1)) {
    xAxisTicks.push(sampledTimeline.length - 1);
  }

  svg.selectAll('.x-label')
    .data(xAxisTicks)
    .enter()
    .append('text')
    .attr('class', 'x-label')
    .attr('x', i => xAxisScale(i))
    .attr('y', height + 15)
    .attr('text-anchor', 'middle')
    .attr('font-size', '0.75rem')
    .attr('fill', 'var(--text-secondary)')
    .text(i => `${sampledTimeline[i].time}m`);

  // X-axis label
  svg.append('text')
    .attr('class', 'd3-axis-label')
    .attr('x', width / 2)
    .attr('y', height + 40)
    .style('text-anchor', 'middle')
    .text('Dive Time (min)');

  // Y-axis label
  svg.append('text')
    .attr('class', 'd3-axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', 0 - height / 2)
    .attr('y', 0 - margin.left + 20)
    .style('text-anchor', 'middle')
    .text('Tissue Compartment');

  // Legend
  const legendX = width - 150;
  const legendY = -20;
  svg.append('text')
    .attr('x', legendX)
    .attr('y', legendY)
    .attr('font-size', '0.8rem')
    .attr('font-weight', '600')
    .attr('fill', 'var(--text-secondary)')
    .text('Saturation:');

  const legendStops = [
    { label: '0%', color: '#10b981' },
    { label: '50%', color: '#f59e0b' },
    { label: '100%', color: '#ef4444' }
  ];

  legendStops.forEach((stop, i) => {
    const x = legendX + 10;
    const y = legendY + 15 + i * 15;
    svg.append('rect')
      .attr('x', x)
      .attr('y', y - 5)
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', stop.color);
    svg.append('text')
      .attr('x', x + 18)
      .attr('y', y + 2)
      .attr('font-size', '0.75rem')
      .attr('fill', 'var(--text-secondary)')
      .text(stop.label);
  });
}

function showHeatmapTooltip(event, d) {
  let tooltip = document.querySelector('.d3-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'd3-tooltip';
    document.body.appendChild(tooltip);
    currentTooltip = tooltip;
  }

  const saturation = (d.tissue.total / d.tissue.mValue) * 100;
  const content = `
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">Compartment:</span>
      <span>${d.tissue.compartment} (${d.tissue.label})</span>
    </div>
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">Time:</span>
      <span>${d.timeSnapshot.time} min</span>
    </div>
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">Depth:</span>
      <span>${d.timeSnapshot.depth} m</span>
    </div>
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">Phase:</span>
      <span>${d.timeSnapshot.phase}</span>
    </div>
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">N₂ / He:</span>
      <span>${d.tissue.n2.toFixed(3)} / ${d.tissue.he.toFixed(3)} bar</span>
    </div>
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">M-Value:</span>
      <span>${d.tissue.mValue.toFixed(3)} bar</span>
    </div>
    <div class="d3-tooltip-row">
      <span class="d3-tooltip-label">Saturation:</span>
      <span>${saturation.toFixed(1)}%</span>
    </div>
  `;

  tooltip.innerHTML = content;
  tooltip.classList.add('active');

  const x = event.pageX + 10;
  const y = event.pageY - 30;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

// Render tissue compartment visualization
function renderRows(result) {
  const { rows, totalRuntime, totalDecoTime, schedule, tissueSnapshots } = result;
  // cache for later re-render on expand
  lastResult = result;
  const units = document.getElementById('units').value;
  const isImperial = units === 'imperial';

  out.innerHTML = '';
  rows.forEach(r => {
    const depth = isImperial ? Math.round(mToFt(r.depth)) : r.depth;
    out.innerHTML += `<tr><td>${depth}</td><td>${r.mins}</td><td>${r.gas}</td></tr>`;
  });
  document.getElementById('totalRuntime').innerHTML = `Total Dive Runtime: ${totalRuntime} minutes<br>Total Decompression Time: ${totalDecoTime} minutes`;

  // Create dive profile graph
  const selectedStrategies = [
    { id: 'compareLinear', label: 'Linear', key: 'linear' },
    { id: 'compareSCurve', label: 'S-curve', key: 's-curve' },
    { id: 'compareExponential', label: 'Exponential', key: 'exponential' }
  ].filter(x => {
    const el = document.getElementById(x.id);
    return el && el.checked;
  });
  createDiveProfileGraph(result, selectedStrategies);
  
  // Create full dive schedule profile graph
  createFullDiveProfileGraph(result);

  // Render strategy comparison cards
  renderStrategyCards(result);
  
  // Render tissue compartment visualization
  renderTissueVisualization(result);

  // Create tissue saturation timeline
  createTimelineSaturationGraph(result);

  // Display detailed schedule
  const scheduleDiv = document.getElementById('detailedSchedule');
  let html = '<h3>📝 Detailed Dive Schedule</h3><table><thead><tr><th>Phase</th><th>Depth</th><th>Rate</th><th>Time (min)</th><th>Accumulated (min)</th></tr></thead><tbody>';
  
  let currentGroup = 0;
  let inAscentSegment = false;
  
  schedule.forEach((s, idx) => {
    let depth = s.depth;
    let rate = s.rate;
    if (isImperial) {
      depth = depth.replace(/(\d+)-(\d+)m/g, (match, d1, d2) => `${Math.round(mToFt(d1))}-${Math.round(mToFt(d2))}ft`);
      depth = depth.replace(/(\d+)m/g, (match, d) => `${Math.round(mToFt(d))}ft`);
      rate = rate.replace(/(\d+\.?\d*) m\/min/g, (match, r) => `${(r * M_TO_FT).toFixed(1)} ft/min`);
    } else {
      depth = depth.replace(/ft/g, 'm');
      rate = rate.replace(/ft\/min/g, 'm/min');
    }
    
    const phaseClass = s.phase.toLowerCase().replace(/ /g, '-');
    let rowClass = `phase-${phaseClass}`;
    
    // Group ascent segments
    if (s.phase === 'Ascent' || s.phase === 'Stop') {
      if (!inAscentSegment) {
        currentGroup++;
        inAscentSegment = true;
      }
      rowClass += ` ascent-group-${currentGroup % 2}`;
      
      // Check if next phase breaks the segment
      if (idx < schedule.length - 1) {
        const nextPhase = schedule[idx + 1].phase;
        if (nextPhase !== 'Ascent' && nextPhase !== 'Stop') {
          inAscentSegment = false;
        }
      }
    } else {
      inAscentSegment = false;
    }
    
    html += `<tr class="${rowClass}"><td>${s.phase}</td><td>${depth}</td><td>${rate}</td><td>${s.time}</td><td>${s.accumulated}</td></tr>`;
  });
  html += '</tbody></table>';
  scheduleDiv.innerHTML = html;
}

btn.addEventListener('click', () => {
  // Auto-expand graph sections before rendering so SVGs size correctly
  document.querySelectorAll('.graph-section').forEach(section => {
    section.classList.remove('collapsed');
  });

  const depth = Number(depthInput.value) || 0;
  const time = Number(timeInput.value) || 0;
  const gasLabel = gasSelect.value;
  const gfLow = Number(gfLowInput.value) / 100;
  const gfHigh = Number(gfHighInput.value) / 100;
  const decoGasType = decoGasTypeSelect.value;
  const decoO2 = decoGasType === 'o2' ? 100 : Number(document.getElementById('decoO2').value) || 50;
  const useO2Shallow = document.getElementById('useO2Shallow').checked;
  const customType = document.getElementById('customType').value;
  const customO2 = Number(document.getElementById('customO2').value) || 32;
  const customTrimixO2 = Number(document.getElementById('customTrimixO2').value) || 18;
  const customHe = Number(document.getElementById('customHe').value) || 45;
  const ascentMode = document.getElementById('ascentMode').value;
  const ascentRate = Number(document.getElementById('ascentRate').value) || 10;
  const deepAscentRate = Number(document.getElementById('deepAscentRate').value) || 6;
  const shallowThreshold = Number(document.getElementById('shallowThreshold').value) || 21;
  const shallowAscentRate = Number(document.getElementById('shallowAscentRate').value) || 9;
  const lastStopDepth = Number(document.getElementById('lastStopDepth').value) || 6;
  const descentRate = Number(document.getElementById('descentRate').value) || 20;
  const noGasSwitch = document.getElementById('noGasSwitch').checked;

  const rows = computeDecompressionSchedule({ depth, time, gasLabel, gfLow, gfHigh, noGasSwitch, decoGasType, decoO2, customType, customO2, customTrimixO2, customHe, useO2Shallow, ascentMode, ascentRate, deepAscentRate, shallowThreshold, shallowAscentRate, lastStopDepth, descentRate });
  renderRows(rows);
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.style.display = 'block';
  setTimeout(() => settingsPanel.classList.add('open'), 10);
  updateUnits();
});

closeSettings.addEventListener('click', closeSettingsPanel);

settingsPanel.addEventListener('click', (e) => {
  if (e.target === settingsPanel) {
    closeSettingsPanel();
  }
});

function closeSettingsPanel() {
  settingsPanel.classList.remove('open');
  setTimeout(() => settingsPanel.style.display = 'none', 300);
}
