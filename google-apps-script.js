// ════════════════════════════════════════════════════════════════════════════
// CRP Labs Ltd — Velox Peptides | Google Sheets Master Workbook
//
// INSTRUCTIONS:
// 1. Paste this entire file into script.google.com → Code.gs
// 2. Run setupVeloxWorkbook() ONCE to build all 12 sheets
// 3. Deploy as Web App → Execute as Me → Anyone → copy /exec URL to GOOGLE_SHEETS_URL
// 4. Re-deploy (New Version) after pasting so doPost picks up the changes
// ════════════════════════════════════════════════════════════════════════════

var ORDERS_TAB = 'Orders';
var COMPANY    = 'CRP Labs Ltd — Velox Peptides';
var CURR_YEAR  = 2026;
var MONTHS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

var C_NAVY  = '#1A1A2E';
var C_TEAL  = '#01D3A0';
var C_WHITE = '#FFFFFF';
var C_LRED  = '#FFC7CE';
var C_LGRN  = '#C6EFCE';
var C_LGOLD = '#FFD700';
var C_LBLUE = '#9DC3E6';

var GBP = '£#,##0.00';
var PCT = '0.0%';
var NUM = '#,##0';
var DAT = 'dd/mm/yyyy';

var PRODUCTS = [
  ['BPC-157',               'Repair & Recovery',  '5mg',    19.99,  3.90, 12, 8],
  ['BPC-157',               'Repair & Recovery',  '10mg',   34.99,  4.90,  8, 8],
  ['TB-500',                'Repair & Recovery',  '5mg',    24.99,  6.90,  6, 8],
  ['TB-500',                'Repair & Recovery',  '10mg',   39.99, 11.90,  6, 8],
  ['BPC-157 & TB-500 Blend','Repair & Recovery',  '10mg',   49.99, 17.90,  5, 5],
  ['Semax',                 'Cognitive',          '10mg',   34.99,  4.90, 11, 8],
  ['Selank',                'Cognitive',          '10mg',   34.99,  4.90,  4, 8],
  ['DSIP',                  'Sleep & Recovery',   '5mg',    19.99,  3.90, 14, 8],
  ['DSIP',                  'Sleep & Recovery',   '10mg',   29.99,  7.90, 10, 8],
  ['Retatrutide',           'Metabolic',          '10mg',   59.99,  7.90,  3, 5],
  ['Retatrutide',           'Metabolic',          '20mg',   99.99, 15.80,  4, 5],
  ['Tesamorelin',           'Growth Hormone',     '10mg',   99.99, 14.90,  4, 5],
  ['Tesamorelin',           'Growth Hormone',     '15mg',  129.99, 17.90,  3, 5],
  ['MOTS-C',                'Metabolic',          '10mg',   29.99,  6.90, 12, 8],
  ['NAD+',                  'Longevity',          '500mg',  34.99,  3.90, 10, 8],
  ['NAD+',                  'Longevity',          '1000mg', 54.99,  4.90, 10, 8],
  ['Glutathione',           'Longevity',          '1000mg', 79.99,  4.90,  9, 8],
  ['Glutathione',           'Longevity',          '1500mg',119.99,  4.90,  9, 8],
  ['GHK-Cu',                'Skin & Aesthetic',   '50mg',   34.99,  3.90, 11, 8],
  ['GHK-Cu',                'Skin & Aesthetic',   '100mg',  44.99,  4.90,  8, 8],
  ['MT2 (Melanotan II)',    'Skin & Aesthetic',   '10mg',   34.99,  4.90,  6, 8],
  ['CJC-1295 wo DAC',       'Growth Hormone',     '10mg',   49.99,  9.90,  9, 8],
  ['KPV',                   'Anti-Inflammatory',  '10mg',   34.99,  3.90, 11, 8],
];

var STACKS = [
  ['Cognitive Stack',          'Semax 10mg + Selank 10mg',                         9.80, 2,  55.98],
  ['Cognitive & Sleep Stack',  'Semax 10mg + Selank 10mg + DSIP 10mg',            17.70, 3,  79.98],
  ['Advanced Cognitive Stack', 'Semax 10mg + Selank 10mg + Dihexa 10mg',          24.80, 3,  89.98],
  ['Metabolic Stack',          'MOTS-C 10mg + Retatrutide 20mg + NAD+ 1000mg',    27.60, 3, 119.98],
  ['GH & Metabolic Stack',     'Tesamorelin 15mg + Retatrutide 20mg',             33.70, 2, 139.98],
  ['Repair & Metabolic Stack', 'BPC-157 10mg + TB-500 10mg + Retatrutide 20mg',   32.60, 3, 109.98],
  ['GH Peptide Stack',         'Tesamorelin 15mg + CJC-1295 wo DAC 10mg',         27.80, 2, 129.98],
  ['Skin & Aesthetic Stack',   'MT2 10mg + GHK-Cu 100mg + Glutathione 1500mg',    14.70, 3,  99.98],
  ['Anti-Ageing Stack',        'GHK-Cu 100mg + Glutathione 1500mg + NAD+ 1000mg', 14.70, 3, 119.98],
  ['Ultimate Repair Stack',    'BPC-157 10mg + TB-500 10mg + GHK-Cu 100mg',       21.70, 3,  99.98],
];

// ════════════════════════════════════════════════════════════════════════════
// ORDER LOGGING — doPost / doGet
// ════════════════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(ORDERS_TAB) || ss.getActiveSheet();

    var existingIds = sheet.getRange('A:A').getValues().flat();
    if (existingIds.indexOf(data.orderId) !== -1) {
      return ContentService.createTextOutput('DUPLICATE — skipped');
    }

    var orderDate = data.date ? new Date(data.date) : new Date();

    function n(v) { return parseFloat(String(v || 0).replace(/[^0-9.-]/g, '')) || 0; }

    sheet.appendRow([
      data.orderId       || '',
      orderDate,
      data.name          || '',
      data.email         || '',
      data.phone         || '',
      data.address       || '',
      data.products      || '',
      n(data.subtotal),
      n(data.delivery),
      data.discountCode  || '',
      n(data.discountAmount),
      n(data.total),
      data.paymentMethod || '',
      data.currency      || '',
      data.region        || '',
      data.status        || '',
      data.notes         || '',
    ]);

    var lr = sheet.getLastRow();
    sheet.getRange(lr, 2).setNumberFormat(DAT);
    sheet.getRange(lr, 8).setNumberFormat(GBP);
    sheet.getRange(lr, 9).setNumberFormat(GBP);
    sheet.getRange(lr, 11).setNumberFormat(GBP);
    sheet.getRange(lr, 12).setNumberFormat(GBP);

    return ContentService.createTextOutput('OK');
  } catch (err) {
    return ContentService.createTextOutput('Error: ' + err.message);
  }
}

function doGet(e) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_TAB) || ss.getActiveSheet();
  var last  = sheet.getLastRow();
  var ids   = last >= 2 ? sheet.getRange(Math.max(2, last - 9), 1, Math.min(10, last - 1), 1).getValues().flat() : [];
  return ContentService.createTextOutput('Last orders: ' + (ids.filter(Boolean).join(', ') || 'none yet'));
}

// ════════════════════════════════════════════════════════════════════════════
// SETUP — run setupVeloxWorkbook() ONCE
// ════════════════════════════════════════════════════════════════════════════

function setupVeloxWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Building workbook — please wait (takes ~60 seconds)...', 'Setup', -1);

  setupOrders(ss);
  setupOverview(ss);
  setupProducts(ss);
  setupStacks(ss);
  setupCustomers(ss);
  setupFinancials(ss);
  setupSubscriptions(ss);
  setupOneOffCosts(ss);
  setupDiscountCodes(ss);
  setupStock(ss);
  setupDelivery(ss);
  setupMarketing(ss);

  // Reorder tabs
  var tabOrder = ['Overview','Orders','Products','Stacks','Customers','Financials',
                  'Subscriptions','One-Off Costs','Discount Codes','Stock','Delivery','Marketing'];
  for (var i = 0; i < tabOrder.length; i++) {
    var sh = ss.getSheetByName(tabOrder[i]);
    if (sh) ss.setActiveSheet(sh), ss.moveActiveSheet(i + 1);
  }

  ss.toast('Done! All 12 sheets ready.', 'Setup complete', 8);
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function getOrCreate(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.clearConditionalFormatRules();
  return sh;
}

function hdr(sh, title, numCols) {
  sh.setFrozenRows(2);
  var r = sh.getRange(1, 1, 1, numCols);
  r.merge();
  r.setValue(COMPANY + '  |  ' + title + '  |  ' +
    Utilities.formatDate(new Date(), 'Europe/London', 'dd/MM/yyyy'));
  r.setBackground(C_NAVY).setFontColor(C_WHITE).setFontWeight('bold')
   .setFontFamily('Arial').setFontSize(11).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1, 28);
}

function colHdrs(sh, row, startCol, headers) {
  var r = sh.getRange(row, startCol, 1, headers.length);
  r.setValues([headers]);
  r.setBackground(C_NAVY).setFontColor(C_WHITE).setFontWeight('bold')
   .setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center')
   .setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(row, 28);
}

function secHdr(sh, row, text, col1, numCols) {
  var r = sh.getRange(row, col1, 1, numCols);
  r.merge();
  r.setValue(text);
  r.setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold')
   .setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center');
  sh.setRowHeight(row, 22);
}

function addDV(sh, col, row1, rowN, options) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true).setAllowInvalid(false).build();
  sh.getRange(row1, col, rowN - row1 + 1, 1).setDataValidation(rule);
}

function setW(sh, widths) {
  for (var i = 0; i < widths.length; i++) {
    if (widths[i]) sh.setColumnWidth(i + 1, widths[i]);
  }
}

// month range helper: ">="&DATE(yr,mo,1) … "<"&DATE(yr, mo+1, 1)
function moFilter(mo, yr) {
  var nextMo = mo === 12 ? 1 : mo + 1;
  var nextYr = mo === 12 ? yr + 1 : yr;
  return [
    '">="&DATE(' + yr  + ',' + mo     + ',1)',
    '"<"&DATE('  + nextYr + ',' + nextMo + ',1)',
  ];
}

function sumifMo(col, mo, yr) {
  var f = moFilter(mo, yr);
  return '=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)=' + mo + ')*(YEAR(Orders!$B$2:$B$1001)=' + yr + ')*(Orders!$' + col + '$2:$' + col + '$1001)),0)';
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: ORDERS
// ════════════════════════════════════════════════════════════════════════════

function setupOrders(ss) {
  var sh = getOrCreate(ss, 'Orders');
  sh.setTabColor('#4472C4');
  setW(sh, [120,105,150,220,130,260,300,100,90,130,110,100,220,80,70,130,220]);

  hdr(sh, 'Orders', 17);
  colHdrs(sh, 2, 1, ['Order ID','Date','Name','Email','Phone','Address','Products',
    'Subtotal','Delivery','Discount Code','Discount Amount','Total',
    'Payment Method','Currency','Region','Status','Notes']);

  sh.getRange('A2').setNote('Paste orders from Google Sheets here. Column order matches live logging exactly. Data starts row 2.');

  addDV(sh, 16, 3, 1001, ['Pending Payment','Paid','Processing','Dispatched','Delivered','Cancelled','Refunded']);
  addDV(sh, 13, 3, 1001, ['GoCardless Instant Bank Pay','PsiFi Card / Apple Pay / Google Pay','Bank Transfer']);
  addDV(sh, 15, 3, 1001, ['UK','EU']);
  addDV(sh, 14, 3, 1001, ['GBP','EUR']);

  sh.getRange('B3:B1001').setNumberFormat(DAT);
  sh.getRange('H3:H1001').setNumberFormat(GBP);
  sh.getRange('I3:I1001').setNumberFormat(GBP);
  sh.getRange('K3:K1001').setNumberFormat(GBP);
  sh.getRange('L3:L1001').setNumberFormat(GBP);

  // Totals row
  var tr = 1002;
  sh.getRange(tr, 1).setValue('TOTALS').setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold').setFontFamily('Arial');
  ['H','I','K','L'].forEach(function(c) {
    sh.getRange(c + tr).setFormula('=SUM(' + c + '3:' + c + '1001)')
      .setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold').setNumberFormat(GBP);
  });

  var rules = [];
  var d = sh.getRange('A3:Q1001');
  [['$P3="Pending Payment"','#FFF2CC'],['$P3="Dispatched"','#E2EFDA'],
   ['$P3="Cancelled"','#FFD7D7'],['$P3="Paid"','#D9F0FF']].forEach(function(x) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(x[0]).setBackground(x[1]).setRanges([d]).build());
  });
  sh.setConditionalFormatRules(rules);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: OVERVIEW
// ════════════════════════════════════════════════════════════════════════════

function setupOverview(ss) {
  var sh = getOrCreate(ss, 'Overview');
  sh.setTabColor('#01D3A0');
  setW(sh, [260,160,160,160,160,160,20,160,160,160,160,160]);
  hdr(sh, 'Business Overview Dashboard', 12);
  sh.getRange(2,1,1,12).setBackground(C_NAVY);
  sh.setRowHeight(2, 8);

  // KPIs col A-F rows 3-16
  secHdr(sh, 3, 'KEY PERFORMANCE INDICATORS', 1, 6);

  var kpis = [
    ['Revenue This Month (£)',
     '=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)=MONTH(TODAY()))*(YEAR(Orders!$B$2:$B$1001)=YEAR(TODAY()))*(Orders!$L$2:$L$1001)),0)', GBP],
    ['Revenue Last Month (£)',
     '=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)=IF(MONTH(TODAY())=1,12,MONTH(TODAY())-1))*(YEAR(Orders!$B$2:$B$1001)=IF(MONTH(TODAY())=1,YEAR(TODAY())-1,YEAR(TODAY())))*(Orders!$L$2:$L$1001)),0)', GBP],
    ['Month-on-Month Change','=IFERROR(IF(B5=0,0,(B4-B5)/B5),0)', PCT],
    ['Total Orders This Month',
     '=IFERROR(COUNTIFS(Orders!$B$2:$B$1001,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),Orders!$B$2:$B$1001,"<"&DATE(YEAR(TODAY()),MONTH(TODAY())+1,1),Orders!$A$2:$A$1001,"<>"),0)', NUM],
    ['Total Orders Last Month',
     '=IFERROR(COUNTIFS(Orders!$B$2:$B$1001,">="&DATE(YEAR(TODAY()),MONTH(TODAY())-1,1),Orders!$B$2:$B$1001,"<"&DATE(YEAR(TODAY()),MONTH(TODAY()),1),Orders!$A$2:$A$1001,"<>"),0)', NUM],
    ['Average Order Value (£)','=IFERROR(B4/B7,0)', GBP],
    ['Total Revenue This Year (£)',
     '=IFERROR(SUMPRODUCT((YEAR(Orders!$B$2:$B$1001)=YEAR(TODAY()))*(Orders!$L$2:$L$1001)),0)', GBP],
    ['Total Profit This Month (£)',
     '=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)=MONTH(TODAY()))*(YEAR(Orders!$B$2:$B$1001)=YEAR(TODAY()))*(Orders!$L$2:$L$1001-Orders!$H$2:$H$1001-3.8-0.5)),0)', GBP],
    ['Total Profit This Year (£)',
     '=IFERROR(SUMPRODUCT((YEAR(Orders!$B$2:$B$1001)=YEAR(TODAY()))*(Orders!$L$2:$L$1001-Orders!$H$2:$H$1001-3.8-0.5)),0)', GBP],
    ['Profit Margin % This Month','=IFERROR(B11/B4,0)', PCT],
    ['Subscription Costs (£/mo)','=IFERROR(Subscriptions!C16,0)', GBP],
    ['One-Off Costs This Month (£)',
     "=IFERROR(SUMPRODUCT((MONTH('One-Off Costs'!$A$2:$A$51)=MONTH(TODAY()))*(YEAR('One-Off Costs'!$A$2:$A$51)=YEAR(TODAY()))*('One-Off Costs'!$C$2:$C$51)),0)", GBP],
  ];

  for (var i = 0; i < kpis.length; i++) {
    var row = i + 4;
    sh.getRange(row, 1).setValue(kpis[i][0]).setFontFamily('Arial').setFontSize(10)
      .setHorizontalAlignment('left').setVerticalAlignment('middle');
    sh.getRange(row, 2).setFormula(kpis[i][1]).setNumberFormat(kpis[i][2])
      .setFontWeight('bold').setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('right');
    if (row % 2 === 0) sh.getRange(row, 1, 1, 6).setBackground('#F2F2F2');
  }

  // Profit conditional
  var pRules = [];
  var pRange = sh.getRange('B11');
  pRules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground(C_LGRN).setRanges([pRange]).build());
  pRules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground(C_LRED).setRanges([pRange]).build());
  sh.setConditionalFormatRules(pRules);

  // Order status rows 17-22
  secHdr(sh, 17, 'ORDER STATUS', 1, 6);
  var statusRows = [
    ['Orders Pending Dispatch (Paid/Processing)',
     '=IFERROR(COUNTIF(Orders!$P$2:$P$1001,"Paid")+COUNTIF(Orders!$P$2:$P$1001,"Processing"),0)', NUM],
    ['Orders Dispatched This Month',
     '=IFERROR(COUNTIFS(Orders!$P$2:$P$1001,"Dispatched",Orders!$B$2:$B$1001,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1)),0)', NUM],
    ['Outstanding Bank Transfers (£)',
     '=IFERROR(SUMIFS(Orders!$L$2:$L$1001,Orders!$M$2:$M$1001,"Bank Transfer",Orders!$P$2:$P$1001,"Pending Payment"),0)', GBP],
    ['UK Orders This Month',
     '=IFERROR(COUNTIFS(Orders!$O$2:$O$1001,"UK",Orders!$B$2:$B$1001,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1)),0)', NUM],
    ['EU Orders This Month',
     '=IFERROR(COUNTIFS(Orders!$O$2:$O$1001,"EU",Orders!$B$2:$B$1001,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1)),0)', NUM],
  ];
  for (var s = 0; s < statusRows.length; s++) {
    var sr = s + 18;
    sh.getRange(sr, 1).setValue(statusRows[s][0]).setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('left');
    sh.getRange(sr, 2).setFormula(statusRows[s][1]).setNumberFormat(statusRows[s][2])
      .setFontWeight('bold').setFontFamily('Arial').setHorizontalAlignment('right');
    if (sr % 2 === 0) sh.getRange(sr, 1, 1, 6).setBackground('#F2F2F2');
  }

  // Payment method breakdown rows 24-30
  secHdr(sh, 24, 'REVENUE BY PAYMENT METHOD', 1, 6);
  colHdrs(sh, 25, 1, ['Method','Orders','Revenue (£)','% of Total']);
  var pms = [
    'GoCardless Instant Bank Pay',
    'PsiFi Card / Apple Pay / Google Pay',
    'Bank Transfer',
  ];
  for (var p = 0; p < pms.length; p++) {
    var pr = p + 26;
    sh.getRange(pr, 1).setValue(pms[p]).setFontFamily('Arial');
    sh.getRange(pr, 2).setFormula('=IFERROR(COUNTIF(Orders!$M$2:$M$1001,"' + pms[p] + '"),0)').setNumberFormat(NUM);
    sh.getRange(pr, 3).setFormula('=IFERROR(SUMIF(Orders!$M$2:$M$1001,"' + pms[p] + '",Orders!$L$2:$L$1001),0)').setNumberFormat(GBP);
    sh.getRange(pr, 4).setFormula('=IFERROR(C' + pr + '/C29,0)').setNumberFormat(PCT);
  }
  sh.getRange(29,1).setValue('Total').setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold').setFontFamily('Arial');
  sh.getRange(29,2).setFormula('=SUM(B26:B28)').setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold').setNumberFormat(NUM);
  sh.getRange(29,3).setFormula('=SUM(C26:C28)').setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold').setNumberFormat(GBP);
  sh.getRange(29,4).setValue('100%').setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold');

  // Monthly chart data rows 31-38
  secHdr(sh, 31, 'MONTHLY CHART DATA — last 6 months (auto-calculated)', 1, 6);
  colHdrs(sh, 32, 1, ['Month','Revenue','Profit (est.)','Orders','Avg Order Value']);
  var chartData = [
    ['Dec 2025',12,2025],['Jan 2026',1,2026],['Feb 2026',2,2026],
    ['Mar 2026',3,2026], ['Apr 2026',4,2026],['May 2026',5,2026],
  ];
  for (var c = 0; c < chartData.length; c++) {
    var cr = c + 33;
    var mo = chartData[c][1], yr = chartData[c][2];
    var nextMo = mo === 12 ? 1 : mo + 1;
    var nextYr = mo === 12 ? yr + 1 : yr;
    sh.getRange(cr, 1).setValue(chartData[c][0]).setFontFamily('Arial');
    sh.getRange(cr, 2).setFormula('=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)=' + mo + ')*(YEAR(Orders!$B$2:$B$1001)=' + yr + ')*(Orders!$L$2:$L$1001)),0)').setNumberFormat(GBP);
    sh.getRange(cr, 3).setFormula('=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)=' + mo + ')*(YEAR(Orders!$B$2:$B$1001)=' + yr + ')*(Orders!$L$2:$L$1001-Orders!$H$2:$H$1001-3.8-0.5)),0)').setNumberFormat(GBP);
    sh.getRange(cr, 4).setFormula('=IFERROR(COUNTIFS(Orders!$B$2:$B$1001,">="&DATE(' + yr + ',' + mo + ',1),Orders!$B$2:$B$1001,"<"&DATE(' + nextYr + ',' + nextMo + ',1),Orders!$A$2:$A$1001,"<>"),0)').setNumberFormat(NUM);
    sh.getRange(cr, 5).setFormula('=IFERROR(B' + cr + '/D' + cr + ',0)').setNumberFormat(GBP);
  }

  sh.getRange(40,1,1,6).merge()
    .setValue('Profit estimate = Revenue minus Cost of Goods (from Orders!H) minus £3.80 packaging minus £0.50 label. For exact margins see Financials sheet.')
    .setFontFamily('Arial').setFontSize(9).setFontColor('#666666').setFontStyle('italic');
  sh.setFrozenRows(2);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: PRODUCTS
// ════════════════════════════════════════════════════════════════════════════

function setupProducts(ss) {
  var sh = getOrCreate(ss, 'Products');
  sh.setTabColor('#70AD47');
  setW(sh, [200,160,100,95,100,120,100,95,145,110,110,110,120,120,110,110,100,130,110]);
  hdr(sh, 'Product Catalogue & Margin Analysis', 19);
  colHdrs(sh, 2, 1, ['Product Name','Category','Variation','RRP','Cost Price',
    'Packaging (£3.80)','Label (£0.50)','Total Cost','Gross Profit Per Unit','Gross Margin %',
    'Units Sold MTD*','Units Sold YTD*','Revenue MTD','Revenue YTD',
    'Profit MTD','Profit YTD','Stock Level','Low Stock Threshold','Reorder Flag']);

  for (var i = 0; i < PRODUCTS.length; i++) {
    var p = PRODUCTS[i];
    var r = i + 3;
    sh.getRange(r,1).setValue(p[0]).setFontFamily('Arial');
    sh.getRange(r,2).setValue(p[1]).setFontFamily('Arial');
    sh.getRange(r,3).setValue(p[2]).setFontFamily('Arial');
    sh.getRange(r,4).setValue(p[3]).setNumberFormat(GBP);
    sh.getRange(r,5).setValue(p[4]).setNumberFormat(GBP);
    sh.getRange(r,6).setValue(3.80).setNumberFormat(GBP);
    sh.getRange(r,7).setValue(0.50).setNumberFormat(GBP);
    sh.getRange(r,8).setFormula('=E'+r+'+F'+r+'+G'+r).setNumberFormat(GBP);
    sh.getRange(r,9).setFormula('=D'+r+'-H'+r).setNumberFormat(GBP);
    sh.getRange(r,10).setFormula('=IFERROR(I'+r+'/D'+r+',0)').setNumberFormat(PCT);
    sh.getRange(r,11).setValue(0); sh.getRange(r,12).setValue(0);
    sh.getRange(r,13).setValue(0).setNumberFormat(GBP);
    sh.getRange(r,14).setValue(0).setNumberFormat(GBP);
    sh.getRange(r,15).setValue(0).setNumberFormat(GBP);
    sh.getRange(r,16).setValue(0).setNumberFormat(GBP);
    sh.getRange(r,17).setValue(p[5]);
    sh.getRange(r,18).setValue(p[6]);
    sh.getRange(r,19).setFormula('=IF(Q'+r+'<=R'+r+',"REORDER","OK")').setHorizontalAlignment('center');
  }

  var lastRow = PRODUCTS.length + 2;
  var rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('REORDER').setBackground(C_LRED).setFontColor('#9C0006').setBold(true)
    .setRanges([sh.getRange('S3:S'+lastRow)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OK').setBackground(C_LGRN).setFontColor('#375623')
    .setRanges([sh.getRange('S3:S'+lastRow)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$Q3<=$R3').setBackground(C_LRED).setFontColor('#9C0006')
    .setRanges([sh.getRange('Q3:Q'+lastRow)]).build());
  sh.setConditionalFormatRules(rules);

  sh.getRange(lastRow+2,1,1,19).merge()
    .setValue('* Units Sold MTD/YTD: enter manually or update when dispatching. Revenue MTD/YTD: also manual — product-level breakdown requires parsing the Products text column.')
    .setFontFamily('Arial').setFontSize(9).setFontColor('#666666').setFontStyle('italic');
  sh.setFrozenRows(2);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: STACKS
// ════════════════════════════════════════════════════════════════════════════

function setupStacks(ss) {
  var sh = getOrCreate(ss, 'Stacks');
  sh.setTabColor('#7030A0');
  setW(sh, [200,360,130,120,85,100,110,110,110,110,110,120,120,110,110]);
  hdr(sh, 'Research Stacks', 15);
  colHdrs(sh, 2, 1, ['Stack Name','Component Products','Component Cost','Packaging (£3.80)',
    'Labels','Total Cost','Bundle Price','Gross Profit','Gross Margin %',
    'Units Sold MTD','Units Sold YTD','Revenue MTD','Revenue YTD','Profit MTD','Profit YTD']);

  for (var i = 0; i < STACKS.length; i++) {
    var s = STACKS[i];
    var r = i + 3;
    sh.getRange(r,1).setValue(s[0]).setFontWeight('bold').setFontFamily('Arial');
    sh.getRange(r,2).setValue(s[1]).setFontFamily('Arial').setFontSize(9).setWrap(true);
    sh.getRange(r,3).setValue(s[2]).setNumberFormat(GBP);
    sh.getRange(r,4).setValue(3.80).setNumberFormat(GBP);
    sh.getRange(r,5).setValue(s[3]*0.50).setNumberFormat(GBP);
    sh.getRange(r,6).setFormula('=C'+r+'+D'+r+'+E'+r).setNumberFormat(GBP);
    sh.getRange(r,7).setValue(s[4]).setNumberFormat(GBP);
    sh.getRange(r,8).setFormula('=G'+r+'-F'+r).setNumberFormat(GBP);
    sh.getRange(r,9).setFormula('=IFERROR(H'+r+'/G'+r+',0)').setNumberFormat(PCT);
    for (var c=10;c<=15;c++) {
      sh.getRange(r,c).setValue(0);
      if(c>=12) sh.getRange(r,c).setNumberFormat(GBP);
    }
    sh.setRowHeight(r,38);
  }
  sh.setFrozenRows(2);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: CUSTOMERS
// ════════════════════════════════════════════════════════════════════════════

function setupCustomers(ss) {
  var sh = getOrCreate(ss, 'Customers');
  sh.setTabColor('#FF69B4');
  setW(sh, [180,240,130,290,70,90,110,130,110,110,200,180,110,150]);
  hdr(sh, 'Customer Database', 14);
  colHdrs(sh, 2, 1, ['Name','Email','Phone','Address','Region','Total Orders',
    'Total Spent','Total Profit Generated','First Order Date','Last Order Date',
    'Favourite Product','Discount Codes Used','Customer Tier','Days Since Last Order']);

  addDV(sh, 5, 3, 502, ['UK','EU']);
  // Column 13 (Tier) is formula-driven — no dropdown needed

  for (var r = 3; r <= 502; r++) {
    sh.getRange(r,7).setNumberFormat(GBP);
    sh.getRange(r,8).setNumberFormat(GBP);
    sh.getRange(r,9).setNumberFormat(DAT);
    sh.getRange(r,10).setNumberFormat(DAT);
    sh.getRange(r,13).setFormula('=IF(G'+r+'="","",IF(G'+r+'>=500,"Platinum",IF(G'+r+'>=300,"Gold",IF(G'+r+'>=100,"Silver","Bronze"))))');
    sh.getRange(r,14).setFormula('=IF(J'+r+'="","",TODAY()-J'+r+')').setNumberFormat(NUM);
  }

  var tierR = sh.getRange('M3:M502');
  var lapsR = sh.getRange('N3:N502');
  var rules = [];
  [['Platinum',C_LBLUE,'#1A1A2E'],['Gold',C_LGOLD,'#1A1A2E'],
   ['Silver','#D9D9D9','#000000'],['Bronze','#F4B942','#000000']].forEach(function(x){
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(x[0]).setBackground(x[1]).setFontColor(x[2]).setBold(true)
      .setRanges([tierR]).build());
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(60).setBackground(C_LRED).setFontColor('#9C0006').setBold(true)
    .setRanges([lapsR]).build());
  sh.setConditionalFormatRules(rules);

  sh.getRange(504,1,1,14).merge()
    .setValue('TIER THRESHOLDS: Bronze £0-£99 | Silver £100-£299 | Gold £300-£499 | Platinum £500+')
    .setFontFamily('Arial').setFontSize(9).setFontColor('#666666').setFontStyle('italic');
  sh.setFrozenRows(2);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: FINANCIALS
// Fixed row numbers: sec headers at 3,8,14,19 | data rows 4-7,9-13,15-18,20-21
// ════════════════════════════════════════════════════════════════════════════

function setupFinancials(ss) {
  var sh = getOrCreate(ss, 'Financials');
  sh.setTabColor('#FFC000');
  setW(sh, [225,95,95,95,95,95,95,95,95,95,95,95,95,110]);
  hdr(sh, 'Monthly Profit & Loss', 14);

  // Row 2: month headers
  sh.getRange(2,1).setValue('Metric').setBackground(C_NAVY).setFontColor(C_WHITE)
    .setFontWeight('bold').setFontFamily('Arial').setHorizontalAlignment('center');
  for (var m = 0; m < 12; m++) {
    sh.getRange(2, m+2).setValue(MONTHS[m]).setBackground(C_NAVY).setFontColor(C_WHITE)
      .setFontWeight('bold').setFontFamily('Arial').setHorizontalAlignment('center');
  }
  sh.getRange(2,14).setValue('YTD Total').setBackground(C_TEAL).setFontColor(C_WHITE)
    .setFontWeight('bold').setFontFamily('Arial').setHorizontalAlignment('center');
  sh.setRowHeight(2,25); sh.setFrozenRows(2);

  var cols = ['B','C','D','E','F','G','H','I','J','K','L','M'];

  function plRow(row, label, fns, fmt, bold, highlight, manual) {
    var lc = sh.getRange(row, 1);
    lc.setValue(label).setFontFamily('Arial').setFontSize(10)
      .setHorizontalAlignment('left').setVerticalAlignment('middle');
    if (bold) lc.setFontWeight('bold');
    if (highlight) lc.setBackground(C_NAVY).setFontColor(C_WHITE);

    for (var mi = 0; mi < 12; mi++) {
      var cell = sh.getRange(row, mi+2);
      if (fns) cell.setFormula(fns(mi+1, cols[mi]));
      else cell.setValue(0);
      cell.setNumberFormat(fmt).setFontFamily('Arial')
        .setHorizontalAlignment('right').setVerticalAlignment('middle');
      if (bold) cell.setFontWeight('bold');
      if (highlight) cell.setBackground(C_NAVY).setFontColor(C_WHITE);
      if (manual) cell.setBackground('#FFF9C4');
    }
    var ytd = sh.getRange(row, 14);
    if (fmt === PCT) {
      ytd.setValue('').setNumberFormat(PCT);
    } else {
      ytd.setFormula('=SUM(B'+row+':M'+row+')').setNumberFormat(fmt).setFontWeight('bold');
    }
    if (highlight) sh.getRange(row, 14).setBackground(C_NAVY).setFontColor(C_WHITE);
  }

  // Row 4: Gross Revenue
  secHdr(sh, 3, 'REVENUE', 1, 14);
  plRow(4, 'Gross Revenue', function(mo,col) {
    return '=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)='+mo+')*(YEAR(Orders!$B$2:$B$1001)='+CURR_YEAR+')*(Orders!$L$2:$L$1001)),0)';
  }, GBP, false, false, false);

  // Row 5: Delivery Income
  plRow(5, 'Delivery Income', function(mo,col) {
    return '=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)='+mo+')*(YEAR(Orders!$B$2:$B$1001)='+CURR_YEAR+')*(Orders!$I$2:$I$1001)),0)';
  }, GBP, false, false, false);

  // Row 6: Discount Given
  plRow(6, 'Discount Given', function(mo,col) {
    return '=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)='+mo+')*(YEAR(Orders!$B$2:$B$1001)='+CURR_YEAR+')*(Orders!$K$2:$K$1001)),0)';
  }, GBP, false, false, false);

  // Row 7: Net Revenue
  plRow(7, 'Net Revenue', function(mo,col) { return '='+col+'4+'+col+'5-'+col+'6'; }, GBP, true, false, false);
  sh.getRange(7,14).setFormula('=SUM(B7:M7)').setFontWeight('bold').setNumberFormat(GBP);

  secHdr(sh, 8, 'COST OF SALES', 1, 14);

  // Row 9: Cost of Goods (manual — we store subtotal not COGS directly)
  plRow(9, 'Cost of Goods (manual)', null, GBP, false, false, true);

  // Row 10: Packaging Costs
  plRow(10, 'Packaging Costs', function(mo,col) {
    var nm = mo===12?1:mo+1, ny = mo===12?CURR_YEAR+1:CURR_YEAR;
    return '=IFERROR(COUNTIFS(Orders!$B$2:$B$1001,">="&DATE('+CURR_YEAR+','+mo+',1),Orders!$B$2:$B$1001,"<"&DATE('+ny+','+nm+',1),Orders!$A$2:$A$1001,"<>")*3.8,0)';
  }, GBP, false, false, false);

  // Row 11: Label Costs (manual)
  plRow(11, 'Label Costs (manual)', null, GBP, false, false, true);

  // Row 12: Gross Profit
  plRow(12, 'Gross Profit', function(mo,col) { return '='+col+'7-'+col+'9-'+col+'10-'+col+'11'; }, GBP, true, false, false);
  sh.getRange(12,14).setFormula('=SUM(B12:M12)').setFontWeight('bold').setNumberFormat(GBP);

  // Row 13: Gross Margin %
  plRow(13, 'Gross Margin %', function(mo,col) { return '=IFERROR('+col+'12/'+col+'7,0)'; }, PCT, false, false, false);
  sh.getRange(13,14).setFormula('=IFERROR(N12/N7,0)').setNumberFormat(PCT);

  secHdr(sh, 14, 'OPERATING EXPENSES', 1, 14);

  // Row 15: GoCardless Fees
  plRow(15, 'GoCardless Fees (auto)', function(mo,col) {
    return '=IFERROR(SUMPRODUCT((MONTH(Orders!$B$2:$B$1001)='+mo+')*(YEAR(Orders!$B$2:$B$1001)='+CURR_YEAR+')*(Orders!$M$2:$M$1001="GoCardless Instant Bank Pay")*(Orders!$L$2:$L$1001*0.01+0.2)),0)';
  }, GBP, false, false, false);

  // Row 16: PsiFi Fees (manual)
  plRow(16, 'PsiFi Fees (manual)', null, GBP, false, false, true);

  // Row 17: Subscription Costs
  plRow(17, 'Subscription Costs', function(mo,col) { return '=IFERROR(Subscriptions!$C$16,0)'; }, GBP, false, false, false);

  // Row 18: One-Off Costs
  plRow(18, 'One-Off Costs', function(mo,col) {
    var nm = mo===12?1:mo+1, ny = mo===12?CURR_YEAR+1:CURR_YEAR;
    return "=IFERROR(SUMPRODUCT((MONTH('One-Off Costs'!$A$2:$A$51)="+mo+")*(YEAR('One-Off Costs'!$A$2:$A$51)="+CURR_YEAR+")*('One-Off Costs'!$C$2:$C$51)),0)";
  }, GBP, false, false, false);

  secHdr(sh, 19, 'NET PROFIT', 1, 14);

  // Row 20: Net Profit
  plRow(20, 'Net Profit', function(mo,col) { return '='+col+'12-'+col+'15-'+col+'16-'+col+'17-'+col+'18'; }, GBP, true, true, false);
  sh.getRange(20,14).setFormula('=SUM(B20:M20)').setFontWeight('bold').setNumberFormat(GBP).setBackground(C_NAVY).setFontColor(C_WHITE);

  // Row 21: Net Margin %
  plRow(21, 'Net Margin %', function(mo,col) { return '=IFERROR('+col+'20/'+col+'4,0)'; }, PCT, false, false, false);
  sh.getRange(21,14).setFormula('=IFERROR(N20/N4,0)').setNumberFormat(PCT);

  var npRange = sh.getRange('B20:N20');
  var npRules = [];
  npRules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground(C_LGRN).setRanges([npRange]).build());
  npRules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground(C_LRED).setRanges([npRange]).build());
  sh.setConditionalFormatRules(npRules);

  sh.getRange(23,1,1,14).merge()
    .setValue('Yellow = manual entry. GoCardless fees auto-estimated at 1% + £0.20/transaction. Update CURR_YEAR variable each January.')
    .setFontFamily('Arial').setFontSize(9).setFontColor('#666666').setFontStyle('italic');
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: SUBSCRIPTIONS
// ════════════════════════════════════════════════════════════════════════════

function setupSubscriptions(ss) {
  var sh = getOrCreate(ss, 'Subscriptions');
  sh.setTabColor('#9DC3E6');
  setW(sh, [180,300,120,110,130,150,110,100,280]);
  hdr(sh, 'Monthly Subscriptions', 9);
  colHdrs(sh, 2, 1, ['Service','Description','Monthly Cost','Annual Cost','Billing Date',
    'Payment Method','Category','Status','Notes']);

  addDV(sh, 7, 3, 20, ['Hosting','Payments','Marketing','Tools','Legal','Other']);
  addDV(sh, 8, 3, 20, ['Active','Cancelled','Paused']);

  var subs = [
    ['Vercel',        'Static site hosting — veloxpeps.com',       0,    0,    'Monthly',       'Card','Hosting', 'Active','Free hobby plan'],
    ['Resend',        'Transactional email (orders@veloxpeps.com)', 0,    0,    'Monthly',       'Card','Tools',   'Active','Free tier — 100 emails/day'],
    ['GitHub',        'Code repository',                           0,    0,    'Monthly',       'Card','Tools',   'Active','Free plan'],
    ['GoCardless',    'Instant Bank Pay processing',                0,    0,    'Per transaction','',  'Payments','Active','1% + £0.20/txn — no monthly fee'],
    ['PsiFi',         'Card / Apple Pay / Google Pay',             0,    0,    'Per transaction','',  'Payments','Active','Per-transaction fees only'],
    ['veloxpeps.com', 'Annual domain renewal',                     1.00, 12.00,'Annual',        'Card','Hosting', 'Active','~£12/year'],
  ];

  for (var i = 0; i < subs.length; i++) {
    var r = i + 3;
    sh.getRange(r,1,1,9).setValues([subs[i]]).setFontFamily('Arial');
    sh.getRange(r,3).setNumberFormat(GBP);
    sh.getRange(r,4).setNumberFormat(GBP);
    if (subs[i][7] === 'Active') sh.getRange(r,8).setBackground(C_LGRN).setFontColor('#375623');
  }

  sh.getRange(16,1).setValue('TOTAL MONTHLY COST').setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold').setFontFamily('Arial');
  sh.getRange(16,3).setFormula('=SUM(C3:C15)').setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold').setNumberFormat(GBP);
  sh.getRange(16,4).setFormula('=SUM(D3:D15)').setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold').setNumberFormat(GBP);
  sh.setFrozenRows(2);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: ONE-OFF COSTS
// ════════════════════════════════════════════════════════════════════════════

function setupOneOffCosts(ss) {
  var sh = getOrCreate(ss, 'One-Off Costs');
  sh.setTabColor('#F4B942');
  setW(sh, [110,300,110,160,160,180,110,260]);
  hdr(sh, 'One-Off Costs', 8);
  colHdrs(sh, 2, 1, ['Date','Description','Amount','Category','Payment Method','Receipt Ref','Month','Notes']);

  addDV(sh, 4, 3, 51, ['Stock Purchase','Equipment','Marketing','Legal','Packaging','Postage','Design','Software','Other']);

  for (var r = 3; r <= 51; r++) {
    sh.getRange(r,1).setNumberFormat(DAT);
    sh.getRange(r,3).setNumberFormat(GBP);
    sh.getRange(r,7).setFormula('=IF(A'+r+'="","",TEXT(A'+r+',"MMM YYYY"))');
  }

  secHdr(sh, 53, 'MONTHLY SUMMARY', 1, 8);
  colHdrs(sh, 54, 1, ['Month','Total Spend','','Category','Category Total','','','']);

  var ms = MONTHS.map(function(m){ return m+' 2026'; });
  for (var mi = 0; mi < 12; mi++) {
    var sr = mi + 55;
    sh.getRange(sr,1).setValue(ms[mi]).setFontFamily('Arial');
    sh.getRange(sr,2).setFormula('=IFERROR(SUMIF(G3:G51,A'+sr+',C3:C51),0)').setNumberFormat(GBP);
  }
  sh.getRange(68,1).setValue('YTD TOTAL').setFontWeight('bold').setFontFamily('Arial');
  sh.getRange(68,2).setFormula('=SUM(B55:B66)').setNumberFormat(GBP)
    .setBackground(C_TEAL).setFontColor(C_WHITE).setFontWeight('bold');

  secHdr(sh, 70, 'SPEND BY CATEGORY', 1, 8);
  var cats = ['Stock Purchase','Equipment','Marketing','Legal','Packaging','Postage','Design','Software','Other'];
  for (var ci = 0; ci < cats.length; ci++) {
    var cr = ci + 71;
    sh.getRange(cr,4).setValue(cats[ci]).setFontFamily('Arial');
    sh.getRange(cr,5).setFormula('=IFERROR(SUMIF(D3:D51,D'+cr+',C3:C51),0)').setNumberFormat(GBP);
  }
  sh.setFrozenRows(2);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: DISCOUNT CODES
// ════════════════════════════════════════════════════════════════════════════

function setupDiscountCodes(ss) {
  var sh = getOrCreate(ss, 'Discount Codes');
  sh.setTabColor('#FF0000');
  setW(sh, [130,110,90,90,110,160,180,130,110,280]);
  hdr(sh, 'Discount Codes', 10);
  colHdrs(sh, 2, 1, ['Code','Type','Value','Status','Times Used',
    'Total Discount Given','Total Revenue Generated','Net Impact','Created Date','Notes']);

  addDV(sh, 2, 3, 20, ['Percentage','Fixed £']);
  addDV(sh, 4, 3, 20, ['Active','Inactive','Expired']);

  var codes = [
    ['VELOX10',   'Percentage','10%','Active','17/05/2026','General site-wide discount'],
    ['Anisha15%', 'Percentage','15%','Active','17/05/2026','Influencer / affiliate code'],
    ['Tom40',     'Percentage','40%','Active','17/05/2026','Staff / VIP — 40% off'],
    ['Tom25',     'Percentage','25%','Active','17/05/2026','Staff / VIP — 25% off'],
  ];

  for (var i = 0; i < codes.length; i++) {
    var r = i + 3;
    var cd = codes[i];
    sh.getRange(r,1).setValue(cd[0]).setFontWeight('bold').setFontFamily('Arial');
    sh.getRange(r,2).setValue(cd[1]).setFontFamily('Arial');
    sh.getRange(r,3).setValue(cd[2]).setFontFamily('Arial');
    var sc = sh.getRange(r,4).setValue(cd[3]).setFontFamily('Arial');
    if (cd[3]==='Active') sc.setBackground(C_LGRN).setFontColor('#375623');
    sh.getRange(r,5).setFormula('=IFERROR(COUNTIF(Orders!$J$2:$J$1001,A'+r+'),0)');
    sh.getRange(r,6).setFormula('=IFERROR(SUMIF(Orders!$J$2:$J$1001,A'+r+',Orders!$K$2:$K$1001),0)').setNumberFormat(GBP);
    sh.getRange(r,7).setFormula('=IFERROR(SUMIF(Orders!$J$2:$J$1001,A'+r+',Orders!$L$2:$L$1001),0)').setNumberFormat(GBP);
    sh.getRange(r,8).setFormula('=G'+r+'-F'+r).setNumberFormat(GBP);
    sh.getRange(r,9).setValue(cd[4]).setNumberFormat(DAT);
    sh.getRange(r,10).setValue(cd[5]).setFontFamily('Arial');
  }

  sh.getRange(10,1,1,10).merge()
    .setValue('Times Used and discount totals pull live from the Orders sheet (columns J and K).')
    .setFontFamily('Arial').setFontSize(9).setFontColor('#666666').setFontStyle('italic');
  sh.setFrozenRows(2);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: STOCK
// ════════════════════════════════════════════════════════════════════════════

function setupStock(ss) {
  var sh = getOrCreate(ss, 'Stock');
  sh.setTabColor('#C00000');
  setW(sh, [200,90,110,115,115,110,130,250,130,110,110,220,120]);
  hdr(sh, 'Stock Management', 13);
  colHdrs(sh, 2, 1, ['Product','Variation','Current Stock','Units Sold MTD*','Units Sold YTD*',
    'Reorder Point','Reorder Quantity','Supplier','Lead Time (days)',
    'Last Restocked','Restock Cost','Notes','Reorder Flag']);

  var SUPPLIER = 'Chinese API Supplier (via broker)';
  for (var i = 0; i < PRODUCTS.length; i++) {
    var p = PRODUCTS[i];
    var r = i + 3;
    sh.getRange(r,1).setValue(p[0]).setFontFamily('Arial');
    sh.getRange(r,2).setValue(p[2]).setFontFamily('Arial');
    sh.getRange(r,3).setValue(p[5]);
    sh.getRange(r,4).setValue(0);
    sh.getRange(r,5).setValue(0);
    sh.getRange(r,6).setValue(p[6]);
    sh.getRange(r,7).setValue(20);
    sh.getRange(r,8).setValue(SUPPLIER).setFontSize(9);
    sh.getRange(r,9).setValue(14);
    sh.getRange(r,10).setNumberFormat(DAT);
    sh.getRange(r,11).setNumberFormat(GBP);
    sh.getRange(r,13).setFormula('=IF(C'+r+'<=F'+r+',"REORDER","OK")').setHorizontalAlignment('center').setFontWeight('bold');
  }

  var lr = PRODUCTS.length + 2;
  var rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('REORDER').setBackground(C_LRED).setFontColor('#9C0006').setBold(true)
    .setRanges([sh.getRange('M3:M'+lr)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OK').setBackground(C_LGRN).setFontColor('#375623')
    .setRanges([sh.getRange('M3:M'+lr)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$C3<=$F3').setBackground(C_LRED).setFontColor('#9C0006')
    .setRanges([sh.getRange('C3:C'+lr)]).build());
  sh.setConditionalFormatRules(rules);
  sh.setFrozenRows(2);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: DELIVERY
// ════════════════════════════════════════════════════════════════════════════

function setupDelivery(ss) {
  var sh = getOrCreate(ss, 'Delivery');
  sh.setTabColor('#808080');
  setW(sh, [120,170,220,280,90,105,225,185,440,70,115,100,220]);
  hdr(sh, 'Delivery Tracking', 13);
  colHdrs(sh, 2, 1, ['Order ID','Customer Name','Email','Products','Total','Dispatch Date',
    'Carrier','Tracking Number','Tracking Link','Region','Est. Delivery','Delivered','Notes']);

  addDV(sh, 7,  3, 502, ['Royal Mail Tracked 24','Royal Mail International Tracked','Other']);
  addDV(sh, 12, 3, 502, ['Yes','No','Attempted']);
  addDV(sh, 10, 3, 502, ['UK','EU']);

  for (var r = 3; r <= 502; r++) {
    sh.getRange(r,5).setNumberFormat(GBP);
    sh.getRange(r,6).setNumberFormat(DAT);
    sh.getRange(r,11).setNumberFormat(DAT);
    sh.getRange(r,9).setFormula('=IF(H'+r+'="","","https://www.royalmail.com/track-your-item#/tracking-results/"&H'+r+')')
      .setFontColor('#1155CC');
  }

  var rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Yes').setBackground(C_LGRN).setFontColor('#375623')
    .setRanges([sh.getRange('L3:L502')]).build());
  sh.setConditionalFormatRules(rules);
  sh.setFrozenRows(2);
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET: MARKETING
// ════════════════════════════════════════════════════════════════════════════

function setupMarketing(ss) {
  var sh = getOrCreate(ss, 'Marketing');
  sh.setTabColor('#FFD700');
  setW(sh, [110,180,220,140,100,100,90,140,160,85,250]);
  hdr(sh, 'Marketing Performance', 11);
  colHdrs(sh, 2, 1, ['Date','Channel','Campaign','Content Type','Spend',
    'Reach','Clicks','Orders Attributed','Revenue Attributed','ROAS','Notes']);

  addDV(sh, 2, 3, 52, ['Instagram Organic','Instagram Paid','TikTok','Google Organic','Google Paid','Referral','Discount Code','Email','Other']);
  addDV(sh, 4, 3, 52, ['Product Post','Stack Post','Educational','Story','Reel','Other']);

  for (var r = 3; r <= 52; r++) {
    sh.getRange(r,1).setNumberFormat(DAT);
    sh.getRange(r,5).setNumberFormat(GBP);
    sh.getRange(r,9).setNumberFormat(GBP);
    sh.getRange(r,10).setFormula('=IF(E'+r+'=0,"",I'+r+'/E'+r+')').setNumberFormat('0.00');
  }

  secHdr(sh, 54, 'MONTHLY SUMMARY', 1, 11);
  var summaryRows = [
    ['Total Spend This Month',
     '=IFERROR(SUMPRODUCT((MONTH(A3:A52)=MONTH(TODAY()))*(YEAR(A3:A52)=YEAR(TODAY()))*(E3:E52)),0)', GBP],
    ['Total Attributed Revenue',
     '=IFERROR(SUMPRODUCT((MONTH(A3:A52)=MONTH(TODAY()))*(YEAR(A3:A52)=YEAR(TODAY()))*(I3:I52)),0)', GBP],
    ['Overall ROAS this month', '=IFERROR(B55/B54,0)', '0.00'],
    ['Best Performing Channel', '', '@'],
  ];
  for (var si = 0; si < summaryRows.length; si++) {
    var sr = si + 55;
    sh.getRange(sr,1).setValue(summaryRows[si][0]).setFontWeight('bold').setFontFamily('Arial');
    var fc = sh.getRange(sr,2);
    if (summaryRows[si][1]) fc.setFormula(summaryRows[si][1]);
    else fc.setBackground('#FFF9C4');
    fc.setNumberFormat(summaryRows[si][2]);
  }
  sh.setFrozenRows(2);
}
