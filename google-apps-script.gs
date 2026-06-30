// ─────────────────────────────────────────────────────────────────────────────
// Callback VM System — Google Apps Script
// ─────────────────────────────────────────────────────────────────────────────

var NOTIFICATION_EMAIL   = 'zotacvoicemail@gmail.com';
var SHEET_ID             = '1ai6NZwW2Inp3ta1uj48UTQeWMwXQfOBuU0iZP8tUFEM';
var DEFAULT_ADMIN_KEY    = 'S26Ultr@';
var DEFAULT_AGENT_KEY    = 'farmoutusavmtool';

// Hour caps in milliseconds
var HOUR_CAPS = { 'Full-time': 9 * 3600 * 1000, 'Part-time': 5 * 3600 * 1000 };

// ── Settings tab helpers ──────────────────────────────────────────────────────
// Passwords are stored in a hidden "Settings" sheet tab so no extra OAuth
// scope authorization is needed (PropertiesService requires a separate step).

function getOrCreateSettingsSheet(ss) {
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) {
    sheet = ss.insertSheet('Settings');
    sheet.appendRow(['Key', 'Value']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  return sheet;
}

function getSetting(ss, key) {
  var sheet = ss.getSheetByName('Settings');
  if (!sheet || sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === key) return String(rows[i][1]);
  }
  return null;
}

function setSetting(ss, key, value) {
  var sheet = getOrCreateSettingsSheet(ss);
  if (sheet.getLastRow() > 1) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === key) {
        sheet.getRange(i + 2, 2).setValue(value);
        return;
      }
    }
  }
  sheet.appendRow([key, value]);
}

// Returns current passwords from the Settings sheet, falling back to hard-coded defaults.
function getCurrentPasswords(ss) {
  try {
    return {
      admin: getSetting(ss, 'ADMIN_PASSWORD') || DEFAULT_ADMIN_KEY,
      agent: getSetting(ss, 'AGENT_PASSWORD') || DEFAULT_AGENT_KEY,
    };
  } catch (e) {
    return { admin: DEFAULT_ADMIN_KEY, agent: DEFAULT_AGENT_KEY };
  }
}

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
      var attResult, attErr;
      try {
        attResult = handleAttendance(data);
      } catch (e) {
        attErr = e.toString();
      }
      var attPayload = attErr ? { success: false, error: attErr } : (attResult || { success: true });
      // If a callback was provided, always return JSONP (even on error) so the
      // browser gets a definitive response instead of a silent timeout.
      if (data.callback) {
        return ContentService
          .createTextOutput(data.callback + '(' + JSON.stringify(attPayload) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService
        .createTextOutput(JSON.stringify(attPayload))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === 'validate_login') {
      return handleValidateLogin(data);
    }

    if (data.type === 'admin') {
      return handleAdminRequest(data);
    }

    if (data.type === 'staff_list') {
      return handleStaffList(data);
    }

    if (data.type === 'messages') {
      return handleMessages(data);
    }

    // ── Callback Log ──────────────────────────────────────────────────────
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Callback Log');
    if (!sheet) { sheet = ss.getActiveSheet(); sheet.setName('Callback Log'); }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp (PH)','Customer Name','Customer Phone','Customer Local Time','Staff','Staff Time (PH)','Call Details']);
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
  console.log('handleAttendance START action=' + (data.action || '?') + ' agent=' + (data.agentName || '?'));
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Attendance Log');

  if (!sheet) {
    sheet = ss.insertSheet('Attendance Log');
    // Column 11 (Server Epoch) is internal — used to compute authoritative duration
    var hdrs = ['Timestamp (PH)','Staff','Action','Details','IP Address',
                'Location','Device / OS / Browser','Screenshot',
                'Work Duration','Hours (decimal)','Server Epoch'];
    sheet.appendRow(hdrs);
    sheet.getRange(1,1,1,hdrs.length)
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    // Hide the internal epoch column
    sheet.hideColumns(11);
  }

  var action  = data.action || '';
  var agentName = data.agentName || '';

  // ── Force clock-out (agent re-logging in from a different device) ──────────
  if (action === 'FORCE_CLOCK_OUT') {
    var nowFco     = new Date().getTime();
    var cutoffFco  = nowFco - 24 * 60 * 60 * 1000;
    if (sheet.getLastRow() > 1) {
      var fcoRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
      var fcoOpen = false;
      for (var fi = 0; fi < fcoRows.length; fi++) {
        var fName   = String(fcoRows[fi][1]);
        var fAction = String(fcoRows[fi][2]);
        var fEpoch  = Number(fcoRows[fi][10]);
        if (fName !== agentName || !fEpoch || fEpoch < cutoffFco) continue;
        if (fAction === 'CLOCK_IN')  fcoOpen = true;
        if (fAction === 'CLOCK_OUT') fcoOpen = false;
      }
      if (fcoOpen) {
        var fcoComputed = computeServerDuration(sheet, agentName, nowFco);
        sheet.appendRow([
          Utilities.formatDate(new Date(), 'Asia/Manila', 'MM/dd/yyyy hh:mm:ss a'),
          agentName,
          'CLOCK_OUT',
          'Auto clock-out: agent re-logged in from another device',
          '', '', '', '',
          fcoComputed ? fcoComputed.hhmmss : '',
          fcoComputed ? Math.round(fcoComputed.hours * 10000) / 10000 : '',
          nowFco,
        ]);
        sheet.autoResizeColumns(1, 10);
        if (fcoComputed) {
          data.durationHours = fcoComputed.hours.toFixed(4);
          data.totalWorked   = fcoComputed.hhmmss;
          updateDailySummary(ss, data);
        }
      }
    }
    return { success: true };
  }

  // ── Duplicate clock-in prevention (multi-browser/device) ──────────────────
  if (action === 'CLOCK_IN') {
    var nowCheck = new Date().getTime();
    var cutoffCheck = nowCheck - 24 * 60 * 60 * 1000;
    if (sheet.getLastRow() > 1) {
      var checkRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
      var hasOpenSession = false;
      // Walk rows chronologically; track the most recent CLOCK_IN/CLOCK_OUT for this agent
      for (var ci = 0; ci < checkRows.length; ci++) {
        var cAgent  = String(checkRows[ci][1]);
        var cAction = String(checkRows[ci][2]);
        var cEpoch  = Number(checkRows[ci][10]);
        if (cAgent !== agentName || !cEpoch || cEpoch < cutoffCheck) continue;
        if (cAction === 'CLOCK_IN')  hasOpenSession = true;
        if (cAction === 'CLOCK_OUT') hasOpenSession = false;
      }
      if (hasOpenSession) {
        return { success: false, error: 'already_clocked_in' };
      }
    }
  }

  // Build "details" cell based on action
  var details = '';
  if (action === 'BREAK_START') {
    details = (data.breakType || '') + (data.breakReason ? ' — ' + data.breakReason : '') +
              ' | worked so far: ' + (data.workedSoFar || '');
  } else if (action === 'RESUME') {
    details = 'Break was ' + (data.breakType || '') + ' · duration: ' + (data.breakDuration || '');
  } else if (action === 'CLOCK_OUT') {
    details = 'Clocked in at: ' + (data.clockInTime || '');
  } else if (action === 'OVERTIME') {
    details = 'Overtime started at: ' + (data.timestamp || '');
  }

  // Screenshot → Google Drive (CLOCK_IN only)
  var screenshotLink = '';
  if (action === 'CLOCK_IN' && data.screenshot && data.screenshot.length > 20) {
    try {
      var decoded  = Utilities.base64Decode(data.screenshot);
      var filename = 'attendance_' + (agentName || 'unknown') + '_' +
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

  var serverEpoch = new Date().getTime();

  // Server-side clock check — compare client's epoch to server's own time.
  // This is immune to sleep/wake false positives because the check only
  // fires at the moment the staff member actively submits an action.
  var clientEpoch = parseInt(data.clientEpoch) || 0;
  if (clientEpoch > 0 && action !== 'CLOCK_TAMPER') {
    var clockDiffMs = Math.abs(serverEpoch - clientEpoch);
    if (clockDiffMs > 5 * 60 * 1000) { // > 5 minutes apart
      try {
        var diffMins = Math.round(clockDiffMs / 60000);
        var clientDir = (serverEpoch > clientEpoch) ? 'behind' : 'ahead of';
        MailApp.sendEmail(
          NOTIFICATION_EMAIL,
          '⚠️ Clock Mismatch: ' + (agentName || 'Unknown') + ' (' + diffMins + ' min ' + clientDir + ' server)',
          'A staff member\'s local clock differs significantly from the server clock.\n\n' +
          'Staff:       ' + (agentName || 'Unknown') + '\n' +
          'Action:      ' + action + '\n' +
          'Client time: ' + new Date(clientEpoch).toISOString() + '\n' +
          'Server time: ' + new Date(serverEpoch).toISOString() + '\n' +
          'Difference:  ' + diffMins + ' minutes (' + clientDir + ' server)\n\n' +
          'Work hours are computed entirely from server timestamps and are not affected.'
        );
      } catch (mailErr) { console.error('Clock check email error:', mailErr.toString()); }
    }
  }

  // For CLOCK_OUT: recompute duration from server-side epochs (cheat-proof)
  var serverHours = null;
  var serverWorked = '';
  if (action === 'CLOCK_OUT') {
    var computed = computeServerDuration(sheet, agentName, serverEpoch);
    if (computed) {
      serverHours  = computed.hours;
      serverWorked = computed.hhmmss;
    }
  }

  console.log('handleAttendance BEFORE appendRow agent=' + (agentName || '?') + ' action=' + action);
  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Manila', 'MM/dd/yyyy hh:mm:ss a'),
    agentName,
    action,
    details,
    data.ip       || '',
    data.location || '',
    [data.device, data.os, data.browser].filter(Boolean).join(' · '),
    screenshotLink,
    action === 'CLOCK_OUT' ? (serverWorked || data.totalWorked || '') : (data.workedSoFar || ''),
    action === 'CLOCK_OUT' ? (serverHours !== null ? Math.round(serverHours * 10000) / 10000 : '') : '',
    serverEpoch,
  ]);
  console.log('handleAttendance AFTER appendRow agent=' + (agentName || '?') + ' action=' + action);
  sheet.autoResizeColumns(1, 10);

  // Update Daily Summary on clock-out
  if (action === 'CLOCK_OUT') {
    // Pass server-computed hours to summary (override browser value)
    if (serverHours !== null) data.durationHours = serverHours.toFixed(4);
    updateDailySummary(ss, data);

    // Notify staff via email
    try {
      var hours = parseFloat(data.durationHours) || 0;
      var h     = Math.floor(hours);
      var m     = Math.round((hours - h) * 60);
      var humanHours = h + ' hr' + (h !== 1 ? 's' : '') + (m > 0 ? ' ' + m + ' min' : '');
      MailApp.sendEmail(
        NOTIFICATION_EMAIL,
        'Clock-Out: ' + (agentName || 'Unknown') + ' — ' + humanHours + ' worked',
        'Staff:       ' + (agentName  || '') + '\n' +
        'Clocked in:  ' + (data.clockInTime || '') + '\n' +
        'Clocked out: ' + (data.timestamp   || '') + '\n' +
        'Work hours:  ' + (data.totalWorked || '') + '  (' + hours.toFixed(2) + ' hrs)\n'
      );
    } catch (mailErr) {
      console.error('Clock-out email error:', mailErr.toString());
    }
  }

  // Notify on clock-in
  if (action === 'CLOCK_IN') {
    // Look up employee type for cap info
    var empType = getEmployeeType(ss, agentName);
    var dailyCapMs = HOUR_CAPS[empType] || HOUR_CAPS['Part-time'];

    try {
      MailApp.sendEmail(
        NOTIFICATION_EMAIL,
        'Clock-In: ' + (agentName || 'Unknown') + ' at ' + (data.timestamp || ''),
        'Staff:    ' + (agentName || '') + '\n' +
        'Type:     ' + empType + '\n' +
        'Daily Cap: ' + (dailyCapMs / 3600000) + ' hrs\n' +
        'Time:     ' + (data.timestamp || '') + '\n' +
        'IP:       ' + (data.ip        || '') + '\n' +
        'Location: ' + (data.location  || '') + '\n' +
        'Device:   ' + [data.device, data.os, data.browser].filter(Boolean).join(' · ') + '\n' +
        (screenshotLink ? 'Screenshot: ' + screenshotLink + '\n' : '')
      );
    } catch (mailErr) {
      console.error('Clock-in email error:', mailErr.toString());
    }

    return { success: true, epoch: serverEpoch, employeeType: empType, dailyCapMs: dailyCapMs };
  }

  return { success: true, epoch: serverEpoch };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side duration calculator — reads server epochs stored in column 11.
// Called at CLOCK_OUT time so the browser clock cannot influence payroll data.
// ─────────────────────────────────────────────────────────────────────────────

function computeServerDuration(sheet, agentName, clockOutEpoch) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var today  = Utilities.formatDate(new Date(), 'Asia/Manila', 'MM/dd/yyyy');
  var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();

  var clockInEpoch    = null;
  var breakStartEpoch = null;
  var totalBreakMs    = 0;

  for (var i = 0; i < values.length; i++) {
    var rowAgent  = String(values[i][1]);
    var rowAction = String(values[i][2]);
    var rowEpoch  = values[i][10];  // column 11 (0-indexed col 10)
    var rowDate   = String(values[i][0]).substring(0, 10); // "MM/dd/yyyy"

    if (rowAgent !== agentName || rowDate !== today || !rowEpoch) continue;

    if (rowAction === 'CLOCK_IN') {
      // Start fresh (handles multiple sessions)
      clockInEpoch    = rowEpoch;
      totalBreakMs    = 0;
      breakStartEpoch = null;
    }
    if (rowAction === 'BREAK_START') {
      breakStartEpoch = rowEpoch;
    }
    if (rowAction === 'RESUME' && breakStartEpoch) {
      totalBreakMs   += (rowEpoch - breakStartEpoch);
      breakStartEpoch = null;
    }
  }

  if (!clockInEpoch) return null;

  var workedMs = Math.max(0, clockOutEpoch - clockInEpoch - totalBreakMs);
  var s   = Math.floor(workedMs / 1000);
  var h   = Math.floor(s / 3600);
  var m   = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  return {
    hours: workedMs / 3600000,
    hhmmss: String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Summary tab — one row per staff member per day, accumulates hours across
// multiple sessions (e.g. half-day then come back)
// ─────────────────────────────────────────────────────────────────────────────

function updateDailySummary(ss, data) {
  var sheet = ss.getSheetByName('Daily Summary');
  if (!sheet) {
    sheet = ss.insertSheet('Daily Summary');
    var hdrs = ['Date','Staff','Total Hours Worked','Sessions','First Clock-In','Last Clock-Out'];
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

  // New row for this staff member today.
  // Columns 5 & 6 are set via setValues with text format so Sheets doesn't
  // auto-convert the time strings to Date objects on subsequent reads.
  var newRow = sheet.getLastRow() + 1;
  sheet.appendRow([today, agent, Math.round(newHours * 10000) / 10000, 1, '', '']);
  sheet.getRange(newRow, 5, 1, 2).setNumberFormat('@').setValues([[data.clockInTime || '', data.timestamp || '']]);
  sheet.autoResizeColumns(1, 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// Login validation — JSONP; returns { role: 'admin' | 'agent' | null }
// ─────────────────────────────────────────────────────────────────────────────

function handleValidateLogin(data) {
  var cb       = data.callback || 'callback';
  var password = data.password || '';
  var ip       = data.ip       || '';
  var ss, pws;
  try {
    ss  = SpreadsheetApp.openById(SHEET_ID);
    pws = getCurrentPasswords(ss);
  } catch (e) {
    pws = { admin: DEFAULT_ADMIN_KEY, agent: DEFAULT_AGENT_KEY };
  }
  var role = null;
  if (password === pws.admin) role = 'admin';
  else if (password === pws.agent) role = 'agent';

  if (ss) {
    try { logLoginAttempt(ss, password, role, ip); } catch (e) {}
  }

  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify({ role: role }) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function logLoginAttempt(ss, password, role, ip) {
  var sheet = ss.getSheetByName('Login Log');
  if (!sheet) {
    sheet = ss.insertSheet('Login Log');
    var hdrs = ['Timestamp (PH)', 'Result', 'Password Entered', 'IP Address'];
    sheet.appendRow(hdrs);
    sheet.getRange(1, 1, 1, hdrs.length)
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Manila', 'MM/dd/yyyy hh:mm:ss a'),
    role ? '✅ ' + role : '❌ failed',
    password,
    ip || '',
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff List — public read, admin-only write
// ─────────────────────────────────────────────────────────────────────────────

function handleStaffList(data) {
  var cb = data.callback || 'callback';
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var names = getStaffNames(ss);
    var screenshotAllowed = (getSetting(ss, 'ALLOW_SCREENSHOTS') || '0') === '1';
    var staffProfiles = getEmployeeProfiles(ss);
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify({ names: names, screenshotAllowed: screenshotAllowed, staffProfiles: staffProfiles }) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (e) {
    return ContentService
      .createTextOutput(cb + '({"names":[],"screenshotAllowed":false,"staffProfiles":[]})')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

function getStaffNames(ss) {
  var sheet = ss.getSheetByName('Staff List');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
    .map(function(r) { return String(r[0]).trim(); })
    .filter(function(n) { return n.length > 0; })
    .sort();
}

function addStaffMember(ss, name) {
  if (!name || !String(name).trim()) return { error: 'Name is required' };
  name = String(name).trim();
  var sheet = ss.getSheetByName('Staff List');
  if (!sheet) {
    sheet = ss.insertSheet('Staff List');
    sheet.appendRow(['Name']);
    sheet.getRange(1, 1).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  if (sheet.getLastRow() > 1) {
    var existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][0]).trim().toLowerCase() === name.toLowerCase()) {
        return { error: 'Name already exists' };
      }
    }
  }
  sheet.appendRow([name]);
  return { success: true, names: getStaffNames(ss) };
}

function removeStaffMember(ss, name) {
  if (!name) return { error: 'Name is required' };
  name = String(name).trim();
  var sheet = ss.getSheetByName('Staff List');
  if (!sheet || sheet.getLastRow() < 2) return { error: 'Staff list is empty' };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]).trim() === name) {
      sheet.deleteRow(i + 2);
      return { success: true, names: getStaffNames(ss) };
    }
  }
  return { error: 'Name not found' };
}

// ── Employee Profiles ─────────────────────────────────────────────────────────
// Sheet: "Employee Profiles"
// Columns: Name | Type | Birthday | Phone | Email | Start Date

function getOrCreateEmployeeProfilesSheet(ss) {
  var sheet = ss.getSheetByName('Employee Profiles');
  if (!sheet) {
    sheet = ss.insertSheet('Employee Profiles');
    var hdrs = ['Name', 'Type', 'Birthday', 'Phone', 'Email', 'Start Date'];
    sheet.appendRow(hdrs);
    sheet.getRange(1, 1, 1, hdrs.length)
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getEmployeeProfiles(ss) {
  var sheet = ss.getSheetByName('Employee Profiles');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  var profiles = [];
  for (var i = 0; i < rows.length; i++) {
    var name = String(rows[i][0]).trim();
    if (!name) continue;
    profiles.push({
      name:      name,
      type:      String(rows[i][1]).trim() || 'Part-time',
      birthday:  fmtSheetVal(rows[i][2], 'yyyy-MM-dd'),
      phone:     String(rows[i][3]).trim(),
      email:     String(rows[i][4]).trim(),
      startDate: fmtSheetVal(rows[i][5], 'yyyy-MM-dd'),
    });
  }
  return profiles;
}

function saveEmployeeProfile(ss, profile) {
  var sheet = getOrCreateEmployeeProfilesSheet(ss);
  var name  = String(profile.name || '').trim();
  if (!name) return { error: 'Name is required' };

  // Check if profile already exists (update) or is new (append)
  if (sheet.getLastRow() > 1) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toLowerCase() === name.toLowerCase()) {
        // Update existing row
        sheet.getRange(i + 2, 1, 1, 6).setValues([[
          name,
          profile.type      || 'Part-time',
          profile.birthday  || '',
          profile.phone     || '',
          profile.email     || '',
          profile.startDate || '',
        ]]);
        return { success: true, profiles: getEmployeeProfiles(ss) };
      }
    }
  }
  // Append new
  sheet.appendRow([
    name,
    profile.type      || 'Part-time',
    profile.birthday  || '',
    profile.phone     || '',
    profile.email     || '',
    profile.startDate || '',
  ]);
  return { success: true, profiles: getEmployeeProfiles(ss) };
}

function deleteEmployeeProfile(ss, name) {
  if (!name) return { error: 'Name is required' };
  name = String(name).trim();
  var sheet = ss.getSheetByName('Employee Profiles');
  if (!sheet || sheet.getLastRow() < 2) return { error: 'No profiles found' };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]).trim().toLowerCase() === name.toLowerCase()) {
      sheet.deleteRow(i + 2);
      return { success: true, profiles: getEmployeeProfiles(ss) };
    }
  }
  return { error: 'Profile not found' };
}

// Returns 'Full-time' or 'Part-time' for an agent. Defaults to 'Part-time' if not found.
function getEmployeeType(ss, agentName) {
  var sheet = ss.getSheetByName('Employee Profiles');
  if (!sheet || sheet.getLastRow() < 2) return 'Part-time';
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(agentName).trim().toLowerCase()) {
      var t = String(rows[i][1]).trim();
      return (t === 'Full-time' || t === 'Part-time') ? t : 'Part-time';
    }
  }
  return 'Part-time';
}

// ── Internal Messaging ────────────────────────────────────────────────────────
// Sheet: "Messages" (hidden)
// Columns: ID | Timestamp | From | To | Message | Read_By

function getOrCreateMessagesSheet(ss) {
  var sheet = ss.getSheetByName('Messages');
  if (!sheet) {
    sheet = ss.insertSheet('Messages');
    var hdrs = ['ID', 'Timestamp', 'From', 'To', 'Message', 'Read_By'];
    sheet.appendRow(hdrs);
    sheet.getRange(1, 1, 1, hdrs.length)
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  return sheet;
}

function handleMessages(data) {
  var cb = data.callback || 'callback';

  function jsonp(obj) {
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify(obj) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = getOrCreateMessagesSheet(ss);
    var action = data.action || '';

    if (action === 'get') {
      var agentName = String(data.agentName || '').trim();
      if (!agentName) return jsonp({ messages: [] });

      var messages = [];
      if (sheet.getLastRow() > 1) {
        var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
        for (var i = 0; i < rows.length; i++) {
          var msgId   = String(rows[i][0]);
          var msgTs   = fmtSheetVal(rows[i][1]);
          var msgFrom = String(rows[i][2]);
          var msgTo   = String(rows[i][3]);
          var msgText = String(rows[i][4]);
          var readBy  = String(rows[i][5]);

          // Show if addressed to this agent or broadcast to All
          if (msgTo !== 'All' && msgTo !== agentName) continue;
          // Skip already read
          var readList = readBy ? readBy.split(',').map(function(s) { return s.trim(); }) : [];
          if (readList.indexOf(agentName) !== -1) continue;

          messages.push({ id: msgId, timestamp: msgTs, from: msgFrom, to: msgTo, message: msgText });
        }
      }
      return jsonp({ messages: messages });
    }

    if (action === 'mark_read') {
      var msgId    = String(data.messageId || '').trim();
      var agentNm  = String(data.agentName || '').trim();
      if (!msgId || !agentNm) return jsonp({ success: false, error: 'Missing params' });

      if (sheet.getLastRow() > 1) {
        var rows2 = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
        for (var j = 0; j < rows2.length; j++) {
          if (String(rows2[j][0]) === msgId) {
            var existingReadBy = String(rows2[j][5]);
            var readList2 = existingReadBy ? existingReadBy.split(',').map(function(s) { return s.trim(); }) : [];
            if (readList2.indexOf(agentNm) === -1) {
              readList2.push(agentNm);
              sheet.getRange(j + 2, 6).setValue(readList2.join(', '));
            }
            return jsonp({ success: true });
          }
        }
      }
      return jsonp({ success: false, error: 'Message not found' });
    }

    return jsonp({ error: 'Unknown action' });
  } catch (err) {
    return jsonp({ error: err.toString() });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run these manually once to authorize all scopes (MailApp + DriveApp)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Admin API — returns JSONP so the browser can read it despite GAS CORS limits
// ─────────────────────────────────────────────────────────────────────────────

function handleAdminRequest(data) {
  var cb = data.callback || 'callback';

  function jsonp(obj) {
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify(obj) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var currentPws = getCurrentPasswords(ss);
    if (data.adminKey !== currentPws.admin) return jsonp({ error: 'Unauthorized' });

    if (data.action === 'dashboard')    return jsonp(getAdminDashboard(ss));
    if (data.action === 'range')        return jsonp(getAdminRange(ss, data.from, data.to));
    if (data.action === 'get_staff')    return jsonp({ names: getStaffNames(ss) });
    if (data.action === 'add_staff')    return jsonp(addStaffMember(ss, data.name));
    if (data.action === 'remove_staff') return jsonp(removeStaffMember(ss, data.name));

    if (data.action === 'change_agent_password') {
      var newAgentPw = String(data.newPassword || '').trim();
      if (newAgentPw.length < 4) return jsonp({ error: 'Password must be at least 4 characters' });
      setSetting(ss, 'AGENT_PASSWORD', newAgentPw);
      return jsonp({ success: true });
    }

    if (data.action === 'change_admin_password') {
      var newAdminPw = String(data.newPassword || '').trim();
      if (newAdminPw.length < 4) return jsonp({ error: 'Password must be at least 4 characters' });
      setSetting(ss, 'ADMIN_PASSWORD', newAdminPw);
      return jsonp({ success: true });
    }

    if (data.action === 'set_setting') {
      var settingKey = String(data.key || '').trim();
      var settingVal = String(data.value || '').trim();
      if (!settingKey) return jsonp({ error: 'Key required' });
      setSetting(ss, settingKey, settingVal);
      return jsonp({ success: true });
    }

    if (data.action === 'get_login_log') {
      var logSheet = ss.getSheetByName('Login Log');
      if (!logSheet || logSheet.getLastRow() < 2) return jsonp({ entries: [] });
      var lastRow = logSheet.getLastRow();
      // Return latest 50 entries, newest first
      var startRow = Math.max(2, lastRow - 49);
      var numRows  = lastRow - startRow + 1;
      var rows = logSheet.getRange(startRow, 1, numRows, 4).getValues().reverse();
      var entries = rows.map(function(r) {
        return { time: fmtSheetVal(r[0]), result: String(r[1]), password: String(r[2]), ip: r[3] ? String(r[3]) : '' };
      });
      return jsonp({ entries: entries });
    }

    // ── Employee Profiles admin actions ──────────────────────────────────────
    if (data.action === 'get_employee_profiles') {
      return jsonp({ profiles: getEmployeeProfiles(ss) });
    }

    if (data.action === 'save_employee') {
      return jsonp(saveEmployeeProfile(ss, {
        name:      data.name,
        type:      data.type,
        birthday:  data.birthday,
        phone:     data.phone,
        email:     data.email,
        startDate: data.startDate,
      }));
    }

    if (data.action === 'remove_employee') {
      return jsonp(deleteEmployeeProfile(ss, data.name));
    }

    // ── Internal Messaging admin actions ─────────────────────────────────────
    if (data.action === 'send_message') {
      var msgSheet = getOrCreateMessagesSheet(ss);
      var msgId    = 'msg_' + new Date().getTime() + '_' + Math.floor(Math.random() * 9999);
      var msgTs    = Utilities.formatDate(new Date(), 'Asia/Manila', 'MM/dd/yyyy hh:mm:ss a');
      msgSheet.appendRow([msgId, msgTs, 'Admin', data.to || 'All', data.message || '', '']);
      return jsonp({ success: true, id: msgId });
    }

    if (data.action === 'get_messages_admin') {
      var msgSheet2 = ss.getSheetByName('Messages');
      if (!msgSheet2 || msgSheet2.getLastRow() < 2) return jsonp({ messages: [] });
      var cutoffMs  = new Date().getTime() - 7 * 24 * 60 * 60 * 1000;
      var allRows   = msgSheet2.getRange(2, 1, msgSheet2.getLastRow() - 1, 6).getValues();
      var recent    = [];
      for (var mi = allRows.length - 1; mi >= 0; mi--) {
        var rowTs = allRows[mi][1];
        var rowEpoch2 = rowTs instanceof Date ? rowTs.getTime() : new Date(String(rowTs)).getTime();
        if (rowEpoch2 < cutoffMs) continue;
        recent.push({
          id:        String(allRows[mi][0]),
          timestamp: fmtSheetVal(allRows[mi][1]),
          from:      String(allRows[mi][2]),
          to:        String(allRows[mi][3]),
          message:   String(allRows[mi][4]),
          readBy:    String(allRows[mi][5]),
        });
        if (recent.length >= 20) break;
      }
      return jsonp({ messages: recent });
    }

    if (data.action === 'delete_message') {
      var delSheet = ss.getSheetByName('Messages');
      if (!delSheet || delSheet.getLastRow() < 2) return jsonp({ error: 'No messages' });
      var delId  = String(data.id || '').trim();
      var delRows = delSheet.getRange(2, 1, delSheet.getLastRow() - 1, 1).getValues();
      for (var di = delRows.length - 1; di >= 0; di--) {
        if (String(delRows[di][0]) === delId) {
          delSheet.deleteRow(di + 2);
          return jsonp({ success: true });
        }
      }
      return jsonp({ error: 'Message not found' });
    }

    return jsonp({ error: 'Unknown action' });
  } catch (err) {
    return jsonp({ error: err.toString() });
  }
}

// Convert a value from getValues() to a string — handles both plain strings
// and Date objects (Sheets auto-converts date-like strings to Date objects).
function fmtSheetVal(val, dateFmt) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Manila', dateFmt || 'MM/dd/yyyy hh:mm:ss a');
  }
  return String(val);
}

function getAdminDashboard(ss) {
  var tz    = 'Asia/Manila';
  var today = Utilities.formatDate(new Date(), tz, 'MM/dd/yyyy');
  var attSheet = ss.getSheetByName('Attendance Log');
  var agentMap = {};

  if (attSheet && attSheet.getLastRow() > 1) {
    var nowMs    = new Date().getTime();
    // 48-hour window to capture night-shift workers who clocked IN up to 2 days ago
    var cutoffMs = nowMs - 48 * 60 * 60 * 1000;
    var rows = attSheet.getRange(2, 1, attSheet.getLastRow() - 1, 11).getValues();
    for (var i = 0; i < rows.length; i++) {
      var r      = rows[i];
      var epoch  = Number(r[10]);
      if (!epoch) {
        // Fallback for rows written before the epoch column was added
        var tsDate = r[0] instanceof Date ? r[0] : new Date(String(r[0]));
        epoch = isNaN(tsDate.getTime()) ? 0 : tsDate.getTime();
      }
      if (!epoch || epoch < cutoffMs) continue;
      var agent   = String(r[1]);
      var action  = String(r[2]);
      var details = String(r[3]);
      if (!agentMap[agent]) {
        agentMap[agent] = { name: agent, status: 'unknown', clockInTime: '', breakType: '', breakStart: 0, totalBreakMs: 0 };
      }
      var a = agentMap[agent];
      if (action === 'CLOCK_IN')    { a.status = 'working';     a.clockInTime = fmtSheetVal(r[0]); a.totalBreakMs = 0; a.breakStart = 0; }
      if (action === 'BREAK_START') { a.status = 'on_break';    a.breakType = details.split(/[\s—|]/)[0].trim(); a.breakStart = epoch; }
      if (action === 'RESUME')      { a.status = 'working';     if (a.breakStart > 0) { a.totalBreakMs += epoch - a.breakStart; } a.breakStart = 0; a.breakType = ''; }
      if (action === 'CLOCK_OUT')   { a.status = 'clocked_out'; if (a.breakStart > 0) { a.totalBreakMs += epoch - a.breakStart; } a.breakStart = 0; }
    }
  }

  var nowMs = new Date().getTime();
  var agents = Object.keys(agentMap).map(function(k) {
    var a = agentMap[k];
    var currentBreakMs = (a.status === 'on_break' && a.breakStart > 0) ? nowMs - a.breakStart : 0;
    return { name: a.name, status: a.status, clockInTime: a.clockInTime, breakType: a.breakType, totalBreakMs: Math.round(a.totalBreakMs + currentBreakMs) };
  });

  var sumSheet = ss.getSheetByName('Daily Summary');
  var todaySummary = [];
  if (sumSheet && sumSheet.getLastRow() > 1) {
    var sumRows = sumSheet.getRange(2, 1, sumSheet.getLastRow() - 1, 6).getValues();
    for (var j = 0; j < sumRows.length; j++) {
      // Column 1 (date) can come back as a Date object if Sheets auto-detected it
      var rowDate = fmtSheetVal(sumRows[j][0], 'MM/dd/yyyy');
      if (rowDate === today) {
        todaySummary.push({
          date:        rowDate,
          agent:       sumRows[j][1],
          hours:       sumRows[j][2],
          sessions:    sumRows[j][3],
          firstClockIn:  fmtSheetVal(sumRows[j][4]),
          lastClockOut:  fmtSheetVal(sumRows[j][5]),
        });
      }
    }
  }

  return {
    agents: agents,
    todaySummary: todaySummary,
    today: today,
    serverTime: Utilities.formatDate(new Date(), tz, 'MMM d, yyyy h:mm:ss a'),
    screenshotAllowed: (getSetting(ss, 'ALLOW_SCREENSHOTS') || '0') === '1',
  };
}

function getAdminRange(ss, fromDate, toDate) {
  // fromDate / toDate come from HTML date input: "yyyy-MM-dd"
  if (!fromDate || !toDate) return { error: 'Missing date range', agents: [] };

  var sumSheet = ss.getSheetByName('Daily Summary');
  if (!sumSheet || sumSheet.getLastRow() < 2) return { from: fromDate, to: toDate, agents: [] };

  // Convert "yyyy-MM-dd" → sortable "yyyy/MM/dd" for easy string comparison
  function toSortable(ymd) { return ymd.replace(/-/g, '/'); }
  // Sheet date column can be a string "MM/dd/yyyy" or a Date object — both handled
  function sheetToSortable(s) {
    var str = s instanceof Date ? Utilities.formatDate(s, 'Asia/Manila', 'MM/dd/yyyy') : String(s);
    var p   = str.split('/');
    return p.length === 3 ? p[2] + '/' + p[0] + '/' + p[1] : '';
  }

  var fromS = toSortable(fromDate);
  var toS   = toSortable(toDate);

  var rows = sumSheet.getRange(2, 1, sumSheet.getLastRow() - 1, 3).getValues();
  var map  = {};
  for (var i = 0; i < rows.length; i++) {
    var sortable = sheetToSortable(rows[i][0]);
    if (!sortable || sortable < fromS || sortable > toS) continue;
    var agent = String(rows[i][1]);
    var hrs   = parseFloat(rows[i][2]) || 0;
    if (!map[agent]) map[agent] = { agent: agent, totalHours: 0, days: 0 };
    map[agent].totalHours += hrs;
    map[agent].days++;
  }

  // Only include agents still on the active staff list
  var activeNames = getStaffNames(ss).map(function(n) { return n.toLowerCase(); });

  var agents = Object.keys(map)
    .filter(function(k) { return activeNames.indexOf(k.toLowerCase()) !== -1; })
    .map(function(k) {
      var a   = map[k];
      var tot = Math.round(a.totalHours * 10000) / 10000;
      var h   = Math.floor(tot);
      var m   = Math.round((tot - h) * 60);
      return { agent: a.agent, totalHours: tot, days: a.days, label: h + ' hr' + (h !== 1 ? 's' : '') + (m > 0 ? ' ' + m + ' min' : '') };
    }).sort(function(a, b) { return b.totalHours - a.totalHours; });

  return { from: fromDate, to: toDate, agents: agents };
}

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
