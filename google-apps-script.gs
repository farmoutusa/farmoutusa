// ─────────────────────────────────────────────────────────────────────────────
// Callback VM System — Google Apps Script
// ─────────────────────────────────────────────────────────────────────────────

var NOTIFICATION_EMAIL = 'zotacvoicemail@gmail.com';
var SHEET_ID           = '1ai6NZwW2Inp3ta1uj48UTQeWMwXQfOBuU0iZP8tUFEM';

function doPost(e) { return doGet(e); }

function doGet(e) {
  if (!e.parameter || (!e.parameter.customerName && !e.parameter.type)) {
    return ContentService
      .createTextOutput('Callback VM System is running.')
      .setMimeType(ContentService.MimeType.TEXT);
  }
  try {
    var data = e.parameter;

    if (data.type === 'attendance') {
      handleAttendance(data);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Callback Log ──────────────────────────────────────────────────────
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Callback Log');
    if (!sheet) { sheet = ss.getActiveSheet(); sheet.setName('Callback Log'); }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp (PH)','Customer Name','Customer Phone','Customer Local Time','Agent','Agent Time (PH)','Call Details']);
      sheet.getRange(1,1,1,7).setFontWeight('bold');
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

    var subject = 'Voicemail Callback Done by ' + (data.agentName || 'Unknown') +
                  ' for Phone ' + (data.customerPhone || 'Unknown') +
                  ' ' + (data.customerName || '');
    MailApp.sendEmail(NOTIFICATION_EMAIL, subject, data.callDetails || '—');

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error('doGet error:', err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance — log every event + update daily summary on CLOCK_OUT
// ─────────────────────────────────────────────────────────────────────────────

function handleAttendance(data) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Attendance Log');

  if (!sheet) {
    sheet = ss.insertSheet('Attendance Log');
    var hdrs = ['Timestamp (PH)','Agent','Action','Details','IP Address',
                'Location','Device / OS / Browser','Screenshot',
                'Work Duration','Hours (decimal)'];
    sheet.appendRow(hdrs);
    sheet.getRange(1,1,1,hdrs.length)
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  // Build "details" cell based on action
  var details = '';
  var action  = data.action || '';
  if (action === 'BREAK_START') {
    details = (data.breakType || '') + (data.breakReason ? ' — ' + data.breakReason : '') +
              ' | worked so far: ' + (data.workedSoFar || '');
  } else if (action === 'RESUME') {
    details = 'Break was ' + (data.breakType || '') + ' · duration: ' + (data.breakDuration || '');
  } else if (action === 'CLOCK_OUT') {
    details = 'Clocked in at: ' + (data.clockInTime || '');
  }

  // Screenshot → Google Drive (CLOCK_IN only)
  var screenshotLink = '';
  if (action === 'CLOCK_IN' && data.screenshot && data.screenshot.length > 20) {
    try {
      var decoded  = Utilities.base64Decode(data.screenshot);
      var filename = 'attendance_' + (data.agentName || 'unknown') + '_' +
                     Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyyMMdd_HHmmss') + '.jpg';
      var blob     = Utilities.newBlob(decoded, 'image/jpeg', filename);
      var iter     = DriveApp.getFoldersByName('CallbackVM Screenshots');
      var folder   = iter.hasNext() ? iter.next() : DriveApp.createFolder('CallbackVM Screenshots');
      var file     = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      screenshotLink = file.getUrl();
    } catch (imgErr) {
      console.error('Screenshot error:', imgErr.toString());
    }
  }

  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Manila', 'MM/dd/yyyy hh:mm:ss a'),
    data.agentName || '',
    action,
    details,
    data.ip       || '',
    data.location || '',
    [data.device, data.os, data.browser].filter(Boolean).join(' · '),
    screenshotLink,
    data.totalWorked   || '',
    data.durationHours ? parseFloat(data.durationHours) : '',
  ]);
  sheet.autoResizeColumns(1, 10);

  // Update Daily Summary on clock-out
  if (action === 'CLOCK_OUT') {
    updateDailySummary(ss, data);

    // Notify agent via email
    try {
      var hours = parseFloat(data.durationHours) || 0;
      var h     = Math.floor(hours);
      var m     = Math.round((hours - h) * 60);
      var humanHours = h + ' hr' + (h !== 1 ? 's' : '') + (m > 0 ? ' ' + m + ' min' : '');
      MailApp.sendEmail(
        NOTIFICATION_EMAIL,
        'Clock-Out: ' + (data.agentName || 'Unknown') + ' — ' + humanHours + ' worked',
        'Agent:       ' + (data.agentName  || '') + '\n' +
        'Clocked in:  ' + (data.clockInTime || '') + '\n' +
        'Clocked out: ' + (data.timestamp   || '') + '\n' +
        'Work hours:  ' + (data.totalWorked || '') + '  (' + hours.toFixed(2) + ' hrs)\n'
      );
    } catch (mailErr) {
      console.error('Clock-out email error:', mailErr.toString());
    }
  }

  // Notify on clock-in too
  if (action === 'CLOCK_IN') {
    try {
      MailApp.sendEmail(
        NOTIFICATION_EMAIL,
        'Clock-In: ' + (data.agentName || 'Unknown') + ' at ' + (data.timestamp || ''),
        'Agent:    ' + (data.agentName || '') + '\n' +
        'Time:     ' + (data.timestamp || '') + '\n' +
        'IP:       ' + (data.ip        || '') + '\n' +
        'Location: ' + (data.location  || '') + '\n' +
        'Device:   ' + [data.device, data.os, data.browser].filter(Boolean).join(' · ') + '\n' +
        (screenshotLink ? 'Screenshot: ' + screenshotLink + '\n' : '')
      );
    } catch (mailErr) {
      console.error('Clock-in email error:', mailErr.toString());
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Summary tab — one row per agent per day, accumulates hours across
// multiple sessions (e.g. half-day then come back)
// ─────────────────────────────────────────────────────────────────────────────

function updateDailySummary(ss, data) {
  var sheet = ss.getSheetByName('Daily Summary');
  if (!sheet) {
    sheet = ss.insertSheet('Daily Summary');
    var hdrs = ['Date','Agent','Total Hours Worked','Sessions','First Clock-In','Last Clock-Out'];
    sheet.appendRow(hdrs);
    sheet.getRange(1,1,1,hdrs.length)
      .setFontWeight('bold').setBackground('#ea580c').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  var today    = Utilities.formatDate(new Date(), 'Asia/Manila', 'MM/dd/yyyy');
  var agent    = data.agentName || '';
  var newHours = parseFloat(data.durationHours) || 0;
  var lastRow  = sheet.getLastRow();

  if (lastRow > 1) {
    var vals = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (vals[i][0] === today && vals[i][1] === agent) {
        var updatedHours    = Math.round(((parseFloat(vals[i][2]) || 0) + newHours) * 10000) / 10000;
        var updatedSessions = (parseInt(vals[i][3]) || 0) + 1;
        sheet.getRange(i + 2, 3).setValue(updatedHours);
        sheet.getRange(i + 2, 4).setValue(updatedSessions);
        sheet.getRange(i + 2, 6).setValue(data.timestamp || '');
        sheet.autoResizeColumns(1, 6);
        return;
      }
    }
  }

  // New row for this agent today
  sheet.appendRow([today, agent, Math.round(newHours * 10000) / 10000, 1, data.clockInTime || '', data.timestamp || '']);
  sheet.autoResizeColumns(1, 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// Run these manually once to authorize all scopes (MailApp + DriveApp)
// ─────────────────────────────────────────────────────────────────────────────

function testEmail() {
  MailApp.sendEmail(NOTIFICATION_EMAIL, 'Callback VM — Test Email',
    'If you received this, the email integration is working correctly.');
  Logger.log('Test email sent.');
}

function testAttendance() {
  var now = new Date();
  var ts  = Utilities.formatDate(now, 'Asia/Manila', 'MMM d, yyyy h:mm:ss a');
  // Simulate a full day: clock-in, break, resume, clock-out (1.5 hrs total)
  handleAttendance({ agentName:'TestAgent', action:'CLOCK_IN',    timestamp:ts, ip:'1.2.3.4', location:'Manila, PH', isp:'Test ISP', device:'PC', os:'Windows', browser:'Chrome', screenRes:'1920x1080', screenshot:'' });
  handleAttendance({ agentName:'TestAgent', action:'BREAK_START', timestamp:ts, breakType:'LUNCH',  breakReason:'', workedSoFar:'01:00:00' });
  handleAttendance({ agentName:'TestAgent', action:'RESUME',      timestamp:ts, breakType:'LUNCH',  breakDuration:'00:30:00' });
  handleAttendance({ agentName:'TestAgent', action:'CLOCK_OUT',   timestamp:ts, clockInTime:ts, totalWorked:'01:30:00', durationHours:'1.5000', ip:'1.2.3.4', location:'Manila, PH' });
  Logger.log('testAttendance done — check Attendance Log and Daily Summary tabs.');
}
