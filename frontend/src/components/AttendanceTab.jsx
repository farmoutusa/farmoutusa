import React, { useState, useEffect, useRef } from 'react';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwhExqtU7hEphKCNP7WWUkp5sAQMFEPsdd1lPgUO1O7cXyEFUf4ecHB2OuXNoWb8lUs/exec';
const ATT_KEY = 'cwc_attendance';
const PH_TZ   = 'Asia/Manila';

const BREAK_TYPES = [
  { id: 'LUNCH',    emoji: '🍽️', label: 'Lunch'    },
  { id: 'RESTROOM', emoji: '🚽', label: 'Restroom'  },
  { id: 'OTHER',    emoji: '📋', label: 'Other'     },
];

// Break limits and warning thresholds (in ms)
const BREAK_LIMIT   = { LUNCH: 60*60000, RESTROOM: 15*60000, OTHER: 30*60000 };
const BREAK_WARN_AT = { LUNCH: 55*60000, RESTROOM: 13*60000, OTHER: 25*60000 };
const BREAK_LABEL   = { LUNCH: '1 hour', RESTROOM: '15 minutes', OTHER: '30 minutes' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNow() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TZ,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date());
}

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function fmtHuman(ms) {
  if (ms < 0) ms = 0;
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

async function getClientInfo() {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  if (ua.includes('Edg'))     browser = 'Edge';
  else if (ua.includes('Chrome'))  browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari'))  browser = 'Safari';

  let os = 'Unknown';
  if (ua.includes('Windows'))                      os = 'Windows';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Android'))                 os = 'Android';
  else if (ua.includes('Mac'))                     os = 'macOS';
  else if (ua.includes('Linux'))                   os = 'Linux';

  const deviceType = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'PC';
  const screenRes  = `${screen.width}x${screen.height}`;

  let ip = 'Unknown', city = '', country = '', isp = '';
  try {
    const d = await (await fetch('https://ipapi.co/json/', { cache: 'no-store' })).json();
    ip = d.ip || 'Unknown'; city = d.city || ''; country = d.country_name || ''; isp = d.org || '';
  } catch {
    try { ip = (await (await fetch('https://api.ipify.org?format=json')).json()).ip || 'Unknown'; } catch {}
  }
  return { ip, city, country, isp, deviceType, os, browser, screenRes };
}

async function compressToThumb(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 320 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL('image/jpeg', 0.12).split(',')[1];
        resolve(b64.length < 20000 ? b64 : '');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function log(payload) {
  await fetch(SCRIPT_URL + '?' + new URLSearchParams({ ...payload, _t: Date.now() }).toString(), {
    method: 'GET', mode: 'no-cors', cache: 'no-store',
  });
}

function fetchJsonp(params) {
  return new Promise((resolve, reject) => {
    const cb = '__att_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const tid = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 10000);
    const script = document.createElement('script');
    function cleanup() { clearTimeout(tid); delete window[cb]; script.remove(); }
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Failed')); };
    script.src = SCRIPT_URL + '?' + new URLSearchParams({ ...params, callback: cb, _t: Date.now() });
    document.head.appendChild(script);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AttendanceTab({ isMobile }) {
  const [att, setAtt] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ATT_KEY)); } catch { return null; }
  });
  const [agentName,      setAgentName]      = useState(() => att?.agentName || localStorage.getItem('cwc_agent_name') || '');
  const [staffList,      setStaffList]      = useState([]);
  const [staffLoading,   setStaffLoading]   = useState(true);
  const [screenshot,     setScreenshot]     = useState(null);
  const [status,         setStatus]         = useState('idle');
  const [showBreakPicker,setShowBreakPicker]= useState(false);
  const [pendingOther,   setPendingOther]   = useState(false);
  const [otherReason,    setOtherReason]    = useState('');
  const [lastClockOut,   setLastClockOut]   = useState(null);
  const [photoRequired,  setPhotoRequired]  = useState(false);
  const [tick,           setTick]           = useState(0);
  const [breakAlert,     setBreakAlert]     = useState(null); // null | 'warning' | 'exceeded'
  const breakWarnedRef    = useRef(false);
  const breakExceededRef  = useRef(false);

  // 1-second tick to drive live timers
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Load staff list for name dropdown
  useEffect(() => {
    fetchJsonp({ type: 'staff_list' })
      .then(data => { if (data?.names?.length) setStaffList(data.names); })
      .catch(() => {})
      .finally(() => setStaffLoading(false));
  }, []);

  // Reset alert refs whenever a new break starts
  useEffect(() => {
    if (att?.phase === 'on_break') {
      breakWarnedRef.current   = false;
      breakExceededRef.current = false;
      setBreakAlert(null);
    }
  }, [att?.breakStart]);

  // Check break limits every tick
  useEffect(() => {
    if (!att || att.phase !== 'on_break') return;
    const bMs   = Date.now() - att.breakStart;
    const limit = BREAK_LIMIT[att.breakType]   ?? BREAK_LIMIT.OTHER;
    const warn  = BREAK_WARN_AT[att.breakType] ?? BREAK_WARN_AT.OTHER;
    if (bMs >= limit && !breakExceededRef.current) {
      breakExceededRef.current = true;
      setBreakAlert('exceeded');
    } else if (bMs >= warn && !breakWarnedRef.current) {
      breakWarnedRef.current = true;
      setBreakAlert('warning');
    }
  }, [tick]);

  function saveAtt(data) {
    if (data) localStorage.setItem(ATT_KEY, JSON.stringify(data));
    else      localStorage.removeItem(ATT_KEY);
    setAtt(data);
  }

  function workMs() {
    if (!att) return 0;
    const base = att.totalWorkMs || 0;
    return att.phase === 'working' ? base + (Date.now() - att.workSessionStart) : base;
  }

  function breakMs() {
    if (!att || att.phase !== 'on_break') return 0;
    return Date.now() - att.breakStart;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleClockIn() {
    if (!agentName.trim()) { alert('Enter your name first.'); return; }
    if (!screenshot) { setPhotoRequired(true); return; }
    setPhotoRequired(false);
    setStatus('sending');
    const [info, b64] = await Promise.all([
      getClientInfo(),
      screenshot ? compressToThumb(screenshot.file) : Promise.resolve(''),
    ]);
    const ts = Date.now(), phTime = fmtNow();
    try {
      await log({
        type: 'attendance', action: 'CLOCK_IN',
        agentName: agentName.trim(), timestamp: phTime, clientEpoch: ts,
        ip: info.ip, location: [info.city, info.country].filter(Boolean).join(', '),
        isp: info.isp, device: info.deviceType, os: info.os,
        browser: info.browser, screenRes: info.screenRes, screenshot: b64,
      });
      localStorage.setItem('cwc_agent_name', agentName.trim());
      saveAtt({ phase: 'working', agentName: agentName.trim(), clockInTs: ts, clockInPhTime: phTime, totalWorkMs: 0, workSessionStart: ts, breakStart: null, breakType: null, breakReason: '' });
      setStatus('idle');
      setScreenshot(null);
    } catch { setStatus('error'); }
  }

  async function handleBreakStart(breakType, reason) {
    const now = Date.now();
    const accumulated = att.totalWorkMs + (now - att.workSessionStart);
    try {
      await log({ type: 'attendance', action: 'BREAK_START', agentName: att.agentName, timestamp: fmtNow(), clientEpoch: Date.now(), breakType, breakReason: reason || '', workedSoFar: fmtDuration(accumulated) });
    } catch {}
    saveAtt({ ...att, phase: 'on_break', totalWorkMs: accumulated, workSessionStart: null, breakStart: now, breakType, breakReason: reason || '' });
    setShowBreakPicker(false); setPendingOther(false); setOtherReason('');
  }

  async function handleResume() {
    const now = Date.now();
    breakWarnedRef.current   = false;
    breakExceededRef.current = false;
    setBreakAlert(null);
    try {
      await log({ type: 'attendance', action: 'RESUME', agentName: att.agentName, timestamp: fmtNow(), clientEpoch: now, breakType: att.breakType, breakDuration: fmtDuration(now - att.breakStart) });
    } catch {}
    saveAtt({ ...att, phase: 'working', workSessionStart: now, breakStart: null, breakType: null, breakReason: '' });
  }

  async function handleClockOut() {
    if (!att || att.phase !== 'working') return;
    setStatus('sending');
    const now = Date.now();
    const totalWorkMs = att.totalWorkMs + (now - att.workSessionStart);
    const phTime = fmtNow();
    const info = await getClientInfo();
    try {
      await log({
        type: 'attendance', action: 'CLOCK_OUT',
        agentName: att.agentName, timestamp: phTime, clientEpoch: now,
        clockInTime: att.clockInPhTime,
        totalWorked: fmtDuration(totalWorkMs),
        durationHours: (totalWorkMs / 3600000).toFixed(4),
        ip: info.ip, location: [info.city, info.country].filter(Boolean).join(', '),
      });
      setLastClockOut({ agentName: att.agentName, workedMs: totalWorkMs, clockInTime: att.clockInPhTime, clockOutTime: phTime });
      saveAtt(null);
      setStatus('idle');
    } catch { setStatus('error'); }
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setScreenshot({ file, preview: URL.createObjectURL(file) });
    setPhotoRequired(false);
  }

  const wrapCls = `space-y-3 ${isMobile ? '' : 'max-w-lg mx-auto pt-1'}`;

  // ── Clock-Out Summary ──────────────────────────────────────────────────────
  if (lastClockOut) return (
    <div className={wrapCls}>
      <div className="bg-blue-900 text-white rounded-2xl shadow p-6 text-center space-y-2">
        <p className="text-3xl">🎉</p>
        <p className="text-base font-bold">Good work, {lastClockOut.agentName}!</p>
        <p className="text-4xl font-mono font-bold text-orange-400 tracking-wider mt-1">
          {fmtHuman(lastClockOut.workedMs)}
        </p>
        <p className="text-sm text-blue-300">worked today</p>
        <div className="text-xs text-blue-400 border-t border-blue-700 pt-2 mt-2 space-y-0.5">
          <p>Clocked in: {lastClockOut.clockInTime}</p>
          <p>Clocked out: {lastClockOut.clockOutTime}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 text-center">Logged to Google Sheets. Summary updated.</p>
      <button onClick={() => setLastClockOut(null)} className="w-full border border-gray-200 rounded-xl py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        Clock in again
      </button>
    </div>
  );

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (!att) return (
    <div className={wrapCls}>
      <div className="bg-white rounded-2xl shadow p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-800">🕐 Attendance Log</h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Staff Name</label>
          {staffLoading ? (
            <div className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-400 bg-gray-50">
              Loading names…
            </div>
          ) : staffList.length > 0 ? (
            <select
              value={agentName}
              onChange={e => { setAgentName(e.target.value); if (e.target.value) localStorage.setItem('cwc_agent_name', e.target.value); }}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            >
              <option value="">— Select your name —</option>
              {staffList.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : (
            <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Your name"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Kayako + VoIP app screenshot <span className="text-red-500 font-normal">*required</span>
          </label>
          <label className={`flex items-center gap-2 cursor-pointer border-2 border-dashed rounded-xl p-3 transition-colors ${
            photoRequired ? 'border-red-400 bg-red-50 hover:border-red-500' : 'border-gray-200 hover:border-orange-300'
          }`}>
            <span className="text-xl">📎</span>
            <span className={`text-xs truncate ${photoRequired ? 'text-red-500' : 'text-gray-500'}`}>
              {screenshot ? screenshot.file.name : 'Click to attach file or photo'}
            </span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
          {screenshot && (
            <img src={screenshot.preview} alt="Preview" className="mt-2 rounded-xl w-full max-h-48 object-contain bg-gray-50 border border-gray-200" />
          )}
          {photoRequired && (
            <div className="mt-2 bg-red-50 border border-red-300 rounded-xl px-3 py-2.5">
              <p className="text-sm font-semibold text-red-600">📸 Photo required</p>
              <p className="text-xs text-red-500 mt-0.5">A photo of your Kayako and VoIP app should be attached.</p>
            </div>
          )}
        </div>

        <button onClick={handleClockIn} disabled={status === 'sending'}
          className="w-full bg-blue-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-800 disabled:opacity-40 transition-colors">
          {status === 'sending' ? 'Logging…' : '✅ Clock In'}
        </button>
        {status === 'error' && <p className="text-red-500 text-xs text-center">Failed. Please try again.</p>}
      </div>
      <p className="text-xs text-gray-400 text-center pb-2">IP address, device, and location are captured automatically.</p>
    </div>
  );

  // ── On Break ──────────────────────────────────────────────────────────────
  if (att.phase === 'on_break') {
    const bLabel    = BREAK_TYPES.find(b => b.id === att.breakType)?.label || att.breakType;
    const limitMs   = BREAK_LIMIT[att.breakType]   ?? BREAK_LIMIT.OTHER;
    const remaining = Math.max(0, limitMs - breakMs());
    const isOver    = breakMs() > limitMs;
    const overMs    = Math.max(0, breakMs() - limitMs);

    return (
      <div className={wrapCls}>
        {/* Break limit alert */}
        {breakAlert === 'exceeded' && (
          <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-4 space-y-2 shadow">
            <p className="text-sm font-bold text-red-700">🚨 {bLabel} break limit reached!</p>
            <p className="text-xs text-red-600">
              Your {BREAK_LABEL[att.breakType] ?? '30-minute'} break is over.
              You are <span className="font-bold">{fmtDuration(overMs)}</span> over time.
              Please resume work now.
            </p>
            <button onClick={handleResume}
              className="w-full bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors">
              ▶️ Resume Work Now
            </button>
          </div>
        )}
        {breakAlert === 'warning' && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 space-y-2 shadow">
            <p className="text-sm font-bold text-amber-700">⚠️ Break ending soon!</p>
            <p className="text-xs text-amber-700">
              Your {bLabel} break ends in{' '}
              <span className="font-bold">{fmtDuration(remaining)}</span>.
              Get ready to clock back in.
            </p>
            <div className="flex gap-2">
              <button onClick={handleResume}
                className="flex-1 bg-green-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-colors">
                ▶️ Resume Now
              </button>
              <button onClick={() => setBreakAlert(null)}
                className="px-3 py-2 rounded-xl text-xs text-amber-600 border border-amber-300 hover:bg-amber-100 transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">🕐 Attendance Log</h3>
            <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 border ${isOver ? 'text-red-600 bg-red-50 border-red-300' : 'text-amber-600 bg-amber-50 border-amber-200'}`}>
              {isOver ? 'Over Break' : 'On Break'}
            </span>
          </div>

          <div className="text-center space-y-1">
            <p className="text-xs text-gray-500 font-medium">
              {att.breakReason ? `${bLabel} · ${att.breakReason}` : bLabel}
            </p>
            <p className={`text-4xl font-mono font-bold tracking-widest ${isOver ? 'text-red-500' : 'text-amber-500'}`}>
              {fmtDuration(breakMs())}
            </p>
            <p className="text-xs text-gray-400">
              {isOver ? `${fmtDuration(overMs)} over limit` : `limit: ${BREAK_LABEL[att.breakType] ?? '30 min'}`}
            </p>
          </div>

          <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2 text-center">
            <p className="text-xs text-green-600">Work time so far</p>
            <p className="text-xl font-mono font-bold text-green-800">{fmtDuration(att.totalWorkMs)}</p>
          </div>

          <button onClick={handleResume}
            className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-green-700 transition-colors">
            ▶️ Resume Work
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center">{att.agentName} · Clocked in at {att.clockInPhTime}</p>
      </div>
    );
  }

  // ── Working ───────────────────────────────────────────────────────────────
  return (
    <div className={wrapCls}>
      <div className="bg-white rounded-2xl shadow p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">🕐 Attendance Log</h3>
          <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">Working</span>
        </div>

        {/* Live Work Timer */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-xs text-green-600 font-medium">Total work time</p>
          <p className="text-4xl font-mono font-bold text-green-800 tracking-widest mt-1">{fmtDuration(workMs())}</p>
          <p className="text-xs text-gray-400 mt-1">{att.agentName} · In at {att.clockInPhTime}</p>
        </div>

        {/* Break Picker */}
        {!showBreakPicker ? (
          <button onClick={() => setShowBreakPicker(true)}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-2.5 text-sm text-gray-400 hover:border-orange-300 hover:text-orange-500 transition-colors">
            ☕ Take a Break
          </button>
        ) : (
          <div className="border border-gray-200 rounded-xl p-3 space-y-3">
            <p className="text-xs text-gray-500 font-medium">Select break type:</p>
            <div className="grid grid-cols-3 gap-2">
              {BREAK_TYPES.map(bt => (
                <button key={bt.id}
                  onClick={() => bt.id === 'OTHER' ? setPendingOther(true) : handleBreakStart(bt.id, '')}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
                    pendingOther && bt.id === 'OTHER'
                      ? 'bg-purple-100 border-purple-400 text-purple-700'
                      : 'border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600 bg-gray-50'
                  }`}>
                  <span className="block text-lg mb-0.5">{bt.emoji}</span>
                  {bt.label}
                </button>
              ))}
            </div>
            {pendingOther && (
              <div className="space-y-2">
                <input value={otherReason} onChange={e => setOtherReason(e.target.value)} autoFocus
                  placeholder="e.g. Coaching, Training, Team Meeting…"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <button onClick={() => handleBreakStart('OTHER', otherReason)} disabled={!otherReason.trim()}
                  className="w-full bg-purple-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-purple-700 disabled:opacity-40 transition-colors">
                  Start Break
                </button>
              </div>
            )}
            <button onClick={() => { setShowBreakPicker(false); setPendingOther(false); setOtherReason(''); }}
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors">
              Cancel
            </button>
          </div>
        )}

        {/* Clock Out — hidden while break picker is open to prevent accidents */}
        {!showBreakPicker && (
          <button onClick={handleClockOut} disabled={status === 'sending'}
            className="w-full bg-red-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-40 transition-colors">
            {status === 'sending' ? 'Logging…' : '🔴 Clock Out for the Day'}
          </button>
        )}
        {status === 'error' && <p className="text-red-500 text-xs text-center">Failed. Please try again.</p>}
      </div>
    </div>
  );
}
