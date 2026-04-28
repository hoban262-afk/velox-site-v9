(function () {
  'use strict';

  var pepEl   = document.getElementById('calc-pep');
  var waterEl = document.getElementById('calc-water');
  var doseEl  = document.getElementById('calc-dose');

  var concEl  = document.getElementById('calc-conc');
  var volEl   = document.getElementById('calc-vol');
  var unitsEl = document.getElementById('calc-units');
  var appsEl  = document.getElementById('calc-apps');

  if (!pepEl || !waterEl || !doseEl) return;

  function fmtNum(n) {
    return n.toLocaleString('en-GB', { maximumFractionDigits: 4 });
  }

  function calculate() {
    var pep   = parseFloat(pepEl.value);
    var water = parseFloat(waterEl.value);
    var dose  = parseFloat(doseEl.value);

    if (!pep || !water || !dose || pep <= 0 || water <= 0 || dose <= 0) {
      if (concEl)  concEl.textContent  = '—';
      if (volEl)   volEl.textContent   = '—';
      if (unitsEl) unitsEl.textContent = '—';
      if (appsEl)  appsEl.textContent  = '—';
      return;
    }

    var conc  = (pep * 1000) / water;          // mcg/ml
    var vol   = dose / conc;                    // ml
    var units = vol * 100;                      // insulin syringe units
    var apps  = (pep * 1000) / dose;            // total applications

    if (concEl)  concEl.textContent  = fmtNum(Math.round(conc)) + ' mcg/ml';
    if (volEl)   volEl.textContent   = vol.toFixed(4) + ' ml';
    if (unitsEl) unitsEl.textContent = fmtNum(Math.round(units * 100) / 100) + ' units';
    if (appsEl)  appsEl.textContent  = fmtNum(Math.round(apps)) + ' applications';
  }

  pepEl.addEventListener('input', calculate);
  waterEl.addEventListener('input', calculate);
  doseEl.addEventListener('input', calculate);

  calculate();

}());
