// ─────────────────────────────────────────────────────────────────────────────
// Callback VM System — Google Apps Script
// ─────────────────────────────────────────────────────────────────────────────

var NOTIFICATION_EMAIL   = 'zotacvoicemail@gmail.com';
var SHEET_ID             = '1ai6NZwW2Inp3ta1uj48UTQeWMwXQfOBuU0iZP8tUFEM';
var DEFAULT_ADMIN_KEY    = 'S26Ultr@';
var DEFAULT_AGENT_KEY    = 'farmoutusavmtool';

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
      var attResult = handleAttendance(data);
      // If a callback was provided, return JSONP so the browser can confirm receipt.
      // CLOCK_IN uses this for confirmed delivery; other actions remain fire-and-forget.
      if (data.callback) {
        return ContentService
          .createTextOutput(data.callback + '(' + JSON.stringify(attResult || { success: true }) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService
        .createTextOutput(JSON.stringify(attResult || { success: true }))
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
          '⚠️ Clock Mismatch: ' + (data.agentName || 'Unknown') + ' (' + diffMins + ' min ' + clientDir + ' server)',
          'A staff member\'s local clock differs significantly from the server clock.\n\n' +
          'Staff:       ' + (data.agentName || 'Unknown') + '\n' +
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
    var computed = computeServerDuration(sheet, data.agentName || '', serverEpoch);
    if (computed) {
      serverHours  = computed.hours;
      serverWorked = computed.hhmmss;
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
    action === 'CLOCK_OUT' ? (serverWorked || data.totalWorked || '') : (data.workedSoFar || ''),
    action === 'CLOCK_OUT' ? (serverHours !== null ? Math.round(serverHours * 10000) / 10000 : '') : '',
    serverEpoch,
  ]);
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
        'Clock-Out: ' + (data.agentName || 'Unknown') + ' — ' + humanHours + ' worked',
        'Staff:       ' + (data.agentName  || '') + '\n' +
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
    try {
      MailApp.sendEmail(
        NOTIFICATION_EMAIL,
        'Clock-In: ' + (data.agentName || 'Unknown') + ' at ' + (data.timestamp || ''),
        'Staff:    ' + (data.agentName || '') + '\n' +
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
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify({ names: names }) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (e) {
    return ContentService
      .createTextOutput(cb + '({"names":[]})')
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

  var agents = Object.keys(map).map(function(k) {
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
