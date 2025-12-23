import { computeDecompressionSchedule } from './sim.js';

const M_TO_FT = 3.28084;

function mToFt(m) { return m * M_TO_FT; }
function ftToM(ft) { return ft / M_TO_FT; }

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
  const type = decoGasTypeSelect.value;
  eanO2Container.style.display = (type === 'o2' || type === 'same') ? 'none' : 'block';
  o2ShallowContainer.style.display = (type === 'o2' || type === 'same') ? 'none' : 'block';
  document.getElementById('useO2Shallow').checked = type === 'ean+o2';
}

decoGasTypeSelect.addEventListener('change', updateDecoUI);
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
  'depth', 'time', 'gas', 'gfLow', 'gfHigh', 'decoGasType',
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
  const units = document.getElementById('units').value;
  const isImperial = units === 'imperial';

  out.innerHTML = '';
  rows.forEach(r => {
    const depth = isImperial ? Math.round(mToFt(r.depth)) : r.depth;
    out.innerHTML += `<tr><td>${depth}</td><td>${r.mins}</td><td>${r.gas}</td></tr>`;
  });
  document.getElementById('totalRuntime').innerHTML = `Total Dive Runtime: ${totalRuntime} minutes<br>Total Decompression Time: ${totalDecoTime} minutes`;

  // Display detailed schedule
  const scheduleDiv = document.getElementById('detailedSchedule');
  let html = '<h4>Detailed Dive Schedule</h4><table><thead><tr><th>Phase</th><th>Depth</th><th>Rate</th><th>Time (min)</th><th>Accumulated (min)</th></tr></thead><tbody>';
  
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

  const rows = computeDecompressionSchedule({ depth, time, gasLabel, gfLow, gfHigh, decoGasType, decoO2, customType, customO2, customTrimixO2, customHe, useO2Shallow, ascentMode, ascentRate, deepAscentRate, shallowThreshold, shallowAscentRate, lastStopDepth, descentRate });
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
