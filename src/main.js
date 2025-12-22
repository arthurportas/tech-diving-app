import { computeDecompressionSchedule } from './sim.js';

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

function updateDecoUI() {
  const type = decoGasTypeSelect.value;
  eanO2Container.style.display = type === 'o2' ? 'none' : 'block';
  o2ShallowContainer.style.display = type === 'o2' ? 'none' : 'block';
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

function renderRows(rows) {
  out.innerHTML = '';
  rows.forEach(r => {
    out.innerHTML += `<tr><td>${r.depth}</td><td>${r.mins}</td><td>${r.gas}</td></tr>`;
  });
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

  const rows = computeDecompressionSchedule({ depth, time, gasLabel, gfLow, gfHigh, decoGasType, decoO2, customType, customO2, customTrimixO2, customHe, useO2Shallow });
  renderRows(rows);
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.style.display = 'block';
  setTimeout(() => settingsPanel.classList.add('open'), 10);
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
