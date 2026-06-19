// ─────────────────────────────────────────────────────────────────────────────
// Callback VM System — Google Apps Script
// ─────────────────────────────────────────────────────────────────────────────

var NOTIFICATION_EMAIL = 'zotacvoicemail@gmail.com';

function doPost(e) {
  return doGet(e); // forward to doGet for compatibility
}

function doGet(e) {
  // Health check — no parameters
  if (!e.parameter || !e.parameter.customerName) {
    return ContentService
      .createTextOutput('Callback VM System script is running.')
      .setMimeType(ContentService.MimeType.TEXT);
  }
  try {
    var data = e.parameter;

    // ── Write to sheet ────────────────────────────────────────────────────
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Callback Log');

    if (!sheet) {
      sheet = ss.getActiveSheet();
      sheet.setName('Callback Log');
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp (PH)',
        'Customer Name',
        'Customer Phone',
        'Customer Local Time',
        'Agent',
        'Agent Time (PH)',
        'Call Details'
      ]);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      Utilities.formatDate(new Date(), 'Asia/Manila', 'MM/dd/yyyy hh:mm:ss a'),
      data.customerName  || '',
      "'" + (data.customerPhone || ''),
      data.customerTime  || '',
      data.agentName     || '',
      data.agentTime     || '',
      data.callDetails   || ''
    ]);

    sheet.autoResizeColumns(1, 7);

    // ── Send email ────────────────────────────────────────────────────────
    var subject = 'Voicemail Callback Done by ' + (data.agentName || 'Unknown') +
                  ' for Phone ' + (data.customerPhone || 'Unknown') +
                  ' ' + (data.customerName || '');

    var body = data.callDetails || '—';

    MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Log the error so you can see it in Apps Script → Executions
    console.error('doPost error:', err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Run this manually first to authorize all permissions ──────────────────
function testEmail() {
  MailApp.sendEmail(
    NOTIFICATION_EMAIL,
    'Callback VM — Test Email',
    'If you received this, the email integration is working correctly.'
  );
  Logger.log('Test email sent to ' + NOTIFICATION_EMAIL);
}

