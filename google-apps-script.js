// ── Velox Peptides — Google Apps Script ────────────────────────────────────
// Paste this into: script.google.com → your project → Code.gs
// Deploy as: Web app → Execute as Me → Anyone can access
// Copy the /exec URL into your Vercel env var: GOOGLE_SHEETS_URL
//
// Column order matches the Orders sheet in CRPLabs_VeloxPeptides_Master.xlsx
// Columns: A=Order ID, B=Date, C=Name, D=Email, E=Phone, F=Address,
//          G=Products, H=Subtotal, I=Delivery, J=Discount Code,
//          K=Discount Amount, L=Total, M=Payment Method, N=Currency,
//          O=Region, P=Status, Q=Notes

var SHEET_NAME = 'Orders'; // Tab name in your Google Sheet

function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var sheet  = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

    // Deduplicate: skip if this Order ID already exists in column A
    var existingIds = sheet.getRange('A:A').getValues().flat();
    if (existingIds.indexOf(data.orderId) !== -1) {
      return ContentService.createTextOutput('DUPLICATE — skipped');
    }

    sheet.appendRow([
      data.orderId        || '',   // A: Order ID
      data.date           || '',   // B: Date
      data.name           || '',   // C: Name
      data.email          || '',   // D: Email
      data.phone          || '',   // E: Phone
      data.address        || '',   // F: Address
      data.products       || '',   // G: Products
      data.subtotal       || '',   // H: Subtotal
      data.delivery       || '',   // I: Delivery
      data.discountCode   || '',   // J: Discount Code
      data.discountAmount || '',   // K: Discount Amount
      data.total          || '',   // L: Total
      data.paymentMethod  || '',   // M: Payment Method
      data.currency       || '',   // N: Currency
      data.region         || '',   // O: Region
      data.status         || '',   // P: Status
      data.notes          || '',   // Q: Notes
    ]);

    return ContentService.createTextOutput('OK');

  } catch (err) {
    console.error('doPost error:', err.message);
    return ContentService.createTextOutput('Error: ' + err.message);
  }
}

// Optional: GET request returns the last 10 order IDs (useful for testing)
function doGet(e) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
  var last  = sheet.getLastRow();
  var start = Math.max(2, last - 9);
  var ids   = last >= 2
    ? sheet.getRange(start, 1, last - start + 1, 1).getValues().flat()
    : [];
  return ContentService.createTextOutput(
    'Last orders: ' + ids.filter(Boolean).join(', ') || 'none yet'
  );
}
