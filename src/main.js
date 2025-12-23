import { computeDecompressionSchedule } from './sim.js';

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
          createDiveProfileGraph(lastResult);
        } else if (svg && svg.id === 'fullDiveProfileChart') {
          createFullDiveProfileGraph(lastResult);
        }
      };
      setTimeout(rerender, 320); // match CSS transition duration
    }
  });
});

// Create D3.js dive profile visualization
function createDiveProfileGraph(result) {
  const { rows, totalRuntime } = result;
  const depth = Number(depthInput.value) || 0;
  const time = Number(timeInput.value) || 0;
  
  if (!depth || !time) return;

  // Build data points for the line
  const data = [];
  let currentTime = time; // Start at end of bottom time
  
  // Add bottom point
  data.push({ time: currentTime, depth: depth, phase: 'bottom', stopTime: 0, accumulated: time });
  
  // Parse rows to extract decompression stops
  let previousDepth = depth;
  let lastAccumulated = time;
  
  rows.forEach((row, idx) => {
    const stopDepth = row.depth;
    const stopTime = row.mins;
    
    // Time for ascent from previous depth to this depth
    // Estimate using average ascent rate
    const depthDifference = previousDepth - stopDepth;
    const ascentRate = 10; // Default ascent rate
    const ascentTime = depthDifference / ascentRate;
    
    currentTime += ascentTime;
    lastAccumulated += ascentTime;
    
    // Add ascent endpoint
    if (idx === 0 || previousDepth !== stopDepth) {
      data.push({ time: currentTime, depth: stopDepth, phase: 'ascent-end', stopTime: 0, accumulated: Math.ceil(lastAccumulated) });
    }
    
    // Add stop
    currentTime += stopTime;
    lastAccumulated += stopTime;
    data.push({ time: currentTime, depth: stopDepth, phase: 'stop', stopTime: stopTime, accumulated: Math.ceil(lastAccumulated) });
    
    previousDepth = stopDepth;
  });
  
  // Add final ascent to surface
  const finalAscentTime = previousDepth / 10;
  currentTime += finalAscentTime;
  lastAccumulated += finalAscentTime;
  data.push({ time: currentTime, depth: 0, phase: 'surface', stopTime: 0, accumulated: Math.ceil(lastAccumulated) });
  
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
  const units = document.getElementById('units').value;
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

  // Convert input values
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

function renderRows(result) {
  const { rows, totalRuntime, totalDecoTime, schedule } = result;
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
  createDiveProfileGraph(result);
  
  // Create full dive schedule profile graph
  createFullDiveProfileGraph(result);

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
