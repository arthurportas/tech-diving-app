import { computeDecompressionSchedule } from './sim.js';

const depthInput = document.getElementById('depth');
const timeInput = document.getElementById('time');
const gasSelect = document.getElementById('gas');
const gfLowInput = document.getElementById('gfLow');
const gfHighInput = document.getElementById('gfHigh');
const out = document.getElementById('output');
const btn = document.getElementById('planBtn');

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
  const gfLow = Number(gfLowInput.value) || 0.3;
  const gfHigh = Number(gfHighInput.value) || 0.85;

  const rows = computeDecompressionSchedule({ depth, time, gasLabel, gfLow, gfHigh });
  renderRows(rows);
});
