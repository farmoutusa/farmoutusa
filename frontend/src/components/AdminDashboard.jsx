import React, { useState, useEffect, useCallback } from 'react';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwhExqtU7hEphKCNP7WWUkp5sAQMFEPsdd1lPgUO1O7cXyEFUf4ecHB2OuXNoWb8lUs/exec';

// ── JSONP fetch (bypasses CORS — GAS wraps response in a callback) ──────────
// adminKey is read fresh from sessionStorage on every call so a password
// change mid-session doesn't require a page reload for the new key to take effect.
function fetchAdmin(action, extra = {}) {
  return new Promise((resolve, reject) => {
    const adminKey = sessionStorage.getItem('cwc_admin_key') || '';
    const cb   = '__adm_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const tid  = setTimeout(() => { cleanup(); reject(new Error('Request timed out')); }, 15000);
    const script = document.createElement('script');

    function cleanup() { clearTimeout(tid); delete window[cb]; script.remove(); }

    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Network error')); };

    const params = new URLSearchParams({ type: 'admin', adminKey, action, callback: cb, _t: Date.now(), ...extra });
    script.src = SCRIPT_URL + '?' + params;
    document.head.appendChild(script);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtHours(h) {
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return mins + ' min';
  if (mins === 0) return hrs + ' hr' + (hrs !== 1 ? 's' : '');
  return hrs + ' hr' + (hrs !== 1 ? 's' : '') + ' ' + mins + ' min';
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status, breakType }) {
  const cfg = {
    working:     { cls: 'bg-green-100 text-green-700 border-green-300',  dot: '🟢', label: 'Working'     },
    on_break:    { cls: 'bg-amber-100 text-amber-700 border-amber-300',  dot: '🟡', label: breakType || 'On Break' },
    clocked_out: { cls: 'bg-gray-100  text-gray-500  border-gray-300',   dot: '⚪', label: 'Clocked Out' },
  }[status] || { cls: 'bg-gray-100 text-gray-400 border-gray-200', dot: '—', label: 'Unknown' };

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-0.5 ${cfg.cls}`}>
      <span>{cfg.dot}</span>{cfg.label}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow p-5 space-y-3">
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminDashboard({ onLogout }) {
  const [dash,         setDash]         = useState(null);
  const [dashLoading,  setDashLoading]  = useState(true);
  const [dashError,    setDashError]    = useState(null);
  const [refreshedAt,  setRefreshedAt]  = useState(null);

  const todayIso = new Date().toISOString().split('T')[0];
  const defaultFrom = new Date(Date.now() - 13 * 86400000).toISOString().split('T')[0];

  const [fromDate,     setFromDate]     = useState(defaultFrom);
  const [toDate,       setToDate]       = useState(todayIso);
  const [rangeData,    setRangeData]    = useState(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError,   setRangeError]   = useState(null);

  // Staff management
  const [staffList,    setStaffList]    = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffSaving,  setStaffSaving]  = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [staffError,   setStaffError]   = useState(null);

  // Password management
  const [newAgentPw,  setNewAgentPw]  = useState('');
  const [newAdminPw,  setNewAdminPw]  = useState('');
  const [pwSaving,    setPwSaving]    = useState(false);
  const [pwError,     setPwError]     = useState(null);
  const [pwSuccess,   setPwSuccess]   = useState(null);

  // Security settings
  const [screenshotAllowed,  setScreenshotAllowed]  = useState(false);
  const [screenshotSaving,   setScreenshotSaving]   = useState(false);

  // Login log
  const [loginLog,        setLoginLog]        = useState(null);
  const [loginLogLoading, setLoginLogLoading] = useState(false);
  const [loginLogError,   setLoginLogError]   = useState(null);

  // ── Employee Profiles ──────────────────────────────────────────────────────
  const [empProfiles, setEmpProfiles] = useState([]);
  const [empLoading,  setEmpLoading]  = useState(true);
  const [empSaving,   setEmpSaving]   = useState(false);
  const [empError,    setEmpError]    = useState(null);
  // empEditing: null = not editing, 'new' = add form, or the name string being edited
  const [empEditing,  setEmpEditing]  = useState(null);
  const EMPTY_EMP_FORM = { name: '', type: 'Part-time', birthday: '', phone: '', email: '', startDate: '' };
  const [empForm,     setEmpForm]     = useState(EMPTY_EMP_FORM);

  // ── Internal Messaging ─────────────────────────────────────────────────────
  const [msgTo,              setMsgTo]              = useState('All');
  const [msgText,            setMsgText]            = useState('');
  const [msgSending,         setMsgSending]         = useState(false);
  const [msgSendSuccess,     setMsgSendSuccess]     = useState(false);
  const [msgHistory,         setMsgHistory]         = useState(null);
  const [msgHistoryLoading,  setMsgHistoryLoading]  = useState(false);
  const [msgHistoryError,    setMsgHistoryError]    = useState(null);
  const [msgDeleting,        setMsgDeleting]        = useState(null); // id being deleted

  const loadDash = useCallback(async () => {
    try {
      setDashError(null);
      const data = await fetchAdmin('dashboard');
      if (data.error) throw new Error(data.error);
      setDash(data);
      if (typeof data.screenshotAllowed === 'boolean') setScreenshotAllowed(data.screenshotAllowed);
      setRefreshedAt(new Date());
    } catch (e) {
      setDashError(e.message);
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDash();
    const id = setInterval(loadDash, 60000);
    return () => clearInterval(id);
  }, [loadDash]);

  useEffect(() => {
    fetchAdmin('get_staff')
      .then(data => { if (data?.names) setStaffList(data.names); })
      .catch(() => {})
      .finally(() => setStaffLoading(false));
  }, []);

  useEffect(() => {
    fetchAdmin('get_employee_profiles')
      .then(data => { if (data?.profiles) setEmpProfiles(data.profiles); })
      .catch(() => {})
      .finally(() => setEmpLoading(false));
  }, []);

  async function handleAddStaff() {
    const name = newStaffName.trim();
    if (!name) return;
    setStaffSaving(true);
    setStaffError(null);
    try {
      const data = await fetchAdmin('add_staff', { name });
      if (data.error) { setStaffError(data.error); return; }
      if (data.names) setStaffList(data.names);
      setNewStaffName('');
    } catch (e) {
      setStaffError(e.message);
    } finally {
      setStaffSaving(false);
    }
  }

  async function handleRemoveStaff(name) {
    if (!window.confirm(`Remove "${name}" from the staff list?`)) return;
    setStaffSaving(true);
    setStaffError(null);
    try {
      const data = await fetchAdmin('remove_staff', { name });
      if (data.error) { setStaffError(data.error); return; }
      if (data.names) setStaffList(data.names);
    } catch (e) {
      setStaffError(e.message);
    } finally {
      setStaffSaving(false);
    }
  }

  async function handleLoadLoginLog() {
    setLoginLogLoading(true); setLoginLogError(null);
    try {
      const data = await fetchAdmin('get_login_log');
      if (data.error) { setLoginLogError(data.error); return; }
      setLoginLog(data.entries || []);
    } catch (e) { setLoginLogError(e.message); }
    finally { setLoginLogLoading(false); }
  }

  async function handleChangeAgentPw() {
    const pw = newAgentPw.trim();
    if (!pw) return;
    setPwSaving(true); setPwError(null); setPwSuccess(null);
    try {
      const data = await fetchAdmin('change_agent_password', { newPassword: pw });
      if (data.error) { setPwError(data.error); return; }
      setPwSuccess('Staff login password updated successfully.');
      setNewAgentPw('');
    } catch (e) { setPwError(e.message); }
    finally { setPwSaving(false); }
  }

  async function handleChangeAdminPw() {
    const pw = newAdminPw.trim();
    if (!pw) return;
    if (!window.confirm('Change admin password? You will be logged out and must sign in with the new password.')) return;
    setPwSaving(true); setPwError(null); setPwSuccess(null);
    try {
      const data = await fetchAdmin('change_admin_password', { newPassword: pw });
      if (data.error) { setPwError(data.error); return; }
      // Clear session so admin must re-authenticate with the new password
      sessionStorage.clear();
      window.location.reload();
    } catch (e) { setPwError(e.message); }
    finally { setPwSaving(false); }
  }

  async function handleToggleScreenshot(newVal) {
    setScreenshotAllowed(newVal); // optimistic — UI updates immediately
    setScreenshotSaving(true);
    try {
      await fetchAdmin('set_setting', { key: 'ALLOW_SCREENSHOTS', value: newVal ? '1' : '0' });
    } catch { /* ignore — persists after GAS redeploy */ }
    finally { setScreenshotSaving(false); }
  }

  async function handleRangeReport() {
    if (!fromDate || !toDate) return;
    setRangeLoading(true);
    setRangeError(null);
    setRangeData(null);
    try {
      const data = await fetchAdmin('range', { from: fromDate, to: toDate });
      if (data.error) throw new Error(data.error);
      setRangeData(data);
    } catch (e) {
      setRangeError(e.message);
    } finally {
      setRangeLoading(false);
    }
  }

  // ── Employee profile handlers ──────────────────────────────────────────────
  function handleEmpEditStart(profile) {
    setEmpEditing(profile.name);
    setEmpForm({
      name:      profile.name,
      type:      profile.type      || 'Part-time',
      birthday:  profile.birthday  || '',
      phone:     profile.phone     || '',
      email:     profile.email     || '',
      startDate: profile.startDate || '',
    });
    setEmpError(null);
  }

  function handleEmpAddStart() {
    setEmpEditing('new');
    setEmpForm(EMPTY_EMP_FORM);
    setEmpError(null);
  }

  function handleEmpCancel() {
    setEmpEditing(null);
    setEmpForm(EMPTY_EMP_FORM);
    setEmpError(null);
  }

  async function handleEmpSave() {
    if (!empForm.name.trim()) { setEmpError('Name is required'); return; }
    setEmpSaving(true); setEmpError(null);
    try {
      const data = await fetchAdmin('save_employee', {
        name:      empForm.name.trim(),
        type:      empForm.type,
        birthday:  empForm.birthday,
        phone:     empForm.phone,
        email:     empForm.email,
        startDate: empForm.startDate,
      });
      if (data.error) { setEmpError(data.error); return; }
      if (data.profiles) setEmpProfiles(data.profiles);
      setEmpEditing(null);
      setEmpForm(EMPTY_EMP_FORM);
    } catch (e) { setEmpError(e.message); }
    finally { setEmpSaving(false); }
  }

  async function handleEmpRemove(name) {
    if (!window.confirm(`Remove employee profile for "${name}"?`)) return;
    setEmpSaving(true); setEmpError(null);
    try {
      const data = await fetchAdmin('remove_employee', { name });
      if (data.error) { setEmpError(data.error); return; }
      if (data.profiles) setEmpProfiles(data.profiles);
    } catch (e) { setEmpError(e.message); }
    finally { setEmpSaving(false); }
  }

  // ── Message handlers ───────────────────────────────────────────────────────
  async function handleSendMessage() {
    if (!msgText.trim()) return;
    setMsgSending(true); setMsgSendSuccess(false);
    try {
      const data = await fetchAdmin('send_message', { to: msgTo, message: msgText.trim() });
      if (data.error) throw new Error(data.error);
      setMsgSendSuccess(true);
      setMsgText('');
      // Refresh history if it's already loaded
      if (msgHistory !== null) handleLoadMsgHistory();
    } catch (e) { /* silent */ }
    finally { setMsgSending(false); }
  }

  async function handleLoadMsgHistory() {
    setMsgHistoryLoading(true); setMsgHistoryError(null);
    try {
      const data = await fetchAdmin('get_messages_admin');
      if (data.error) { setMsgHistoryError(data.error); return; }
      setMsgHistory(data.messages || []);
    } catch (e) { setMsgHistoryError(e.message); }
    finally { setMsgHistoryLoading(false); }
  }

  async function handleDeleteMessage(id) {
    if (!window.confirm('Delete this message?')) return;
    setMsgDeleting(id);
    try {
      const data = await fetchAdmin('delete_message', { id });
      if (data.error) return;
      setMsgHistory(prev => prev ? prev.filter(m => m.id !== id) : prev);
    } catch {}
    finally { setMsgDeleting(null); }
  }

  const maxHours = rangeData?.agents?.length ? Math.max(...rangeData.agents.map(a => a.totalHours), 1) : 1;

  // Recipient options for messaging: All + everyone on the staff list
  const msgRecipients = ['All', ...staffList];

  if (dashLoading && !dash) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg border-t-4 border-orange-500 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/farmoutusalogo.png" alt="farmout usa" className="h-8 bg-white rounded px-1.5 py-0.5" />
            <div>
              <p className="text-xs text-blue-300 uppercase tracking-widest font-medium">Admin Dashboard</p>
              {dash && <p className="text-xs text-blue-400">{dash.serverTime} PH</p>}
            </div>
          </div>
          <button onClick={onLogout}
            className="flex items-center gap-1 text-xs text-blue-300 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-.943a.75.75 0 1 0-1.004-1.114l-2.5 2.25a.75.75 0 0 0 0 1.114l2.5 2.25a.75.75 0 1 0 1.004-1.114l-1.048-.943h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">

        {/* ── Live Status ─────────────────────────────────────────────────── */}
        <Section title="🟢 Live Staff Status">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString()}` : 'Loading…'}
            </p>
            <button onClick={loadDash} disabled={dashLoading}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
              {dashLoading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          {dashError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{dashError}</p>}

          {dash && (
            dash.agents.length === 0
              ? <p className="text-sm text-gray-400 text-center py-4">No staff active today.</p>
              : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left pb-2 font-medium px-1">Staff</th>
                        <th className="text-left pb-2 font-medium px-1">Status</th>
                        <th className="text-left pb-2 font-medium px-1">Clocked In At</th>
                        <th className="text-left pb-2 font-medium px-1">Break Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {dash.agents.map(a => (
                        <tr key={a.name} className="hover:bg-gray-50">
                          <td className="py-2.5 font-semibold text-gray-800 px-1">{a.name}</td>
                          <td className="py-2.5 px-1"><StatusBadge status={a.status} breakType={a.breakType} /></td>
                          <td className="py-2.5 text-xs text-gray-500 px-1">
                            {a.clockInTime ? a.clockInTime.replace(/^(\d+\/\d+\/\d+)\s/, '') : '—'}
                          </td>
                          <td className="py-2.5 text-xs px-1">
                            {a.totalBreakMs > 0
                              ? <span className="text-amber-600">{fmtHours(a.totalBreakMs / 3600000)}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </Section>

        {/* ── Today's Summary ─────────────────────────────────────────────── */}
        {dash?.todaySummary?.length > 0 && (
          <Section title={`📋 Today's Summary — ${dash.today}`}>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left pb-2 font-medium px-1">Staff</th>
                    <th className="text-left pb-2 font-medium px-1">Hours Worked</th>
                    <th className="text-left pb-2 font-medium px-1">Sessions</th>
                    <th className="text-left pb-2 font-medium px-1">First In</th>
                    <th className="text-left pb-2 font-medium px-1">Last Out</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dash.todaySummary.map(row => (
                    <tr key={row.agent} className="hover:bg-gray-50">
                      <td className="py-2.5 font-semibold text-gray-800 px-1">{row.agent}</td>
                      <td className="py-2.5 px-1">
                        <span className="font-bold text-blue-900">{fmtHours(Number(row.hours) || 0)}</span>
                        <span className="text-xs text-gray-400 ml-1">({(Number(row.hours)||0).toFixed(2)} hrs)</span>
                      </td>
                      <td className="py-2.5 text-gray-500 px-1">{row.sessions}</td>
                      <td className="py-2.5 text-xs text-gray-500 px-1">
                        {String(row.firstClockIn || '').replace(/^(\d+\/\d+\/\d+)\s/, '') || '—'}
                      </td>
                      <td className="py-2.5 text-xs text-gray-500 px-1">
                        {String(row.lastClockOut || '').replace(/^(\d+\/\d+\/\d+)\s/, '') || 'still in'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ── Date Range Report ────────────────────────────────────────────── */}
        <Section title="📊 Date Range Report">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">From</label>
              <input type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">To</label>
              <input type="date" value={toDate} min={fromDate} max={todayIso} onChange={e => setToDate(e.target.value)}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <button onClick={handleRangeReport} disabled={rangeLoading || !fromDate || !toDate}
              className="bg-orange-500 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-40 transition-colors">
              {rangeLoading ? 'Loading…' : 'Generate Report'}
            </button>
          </div>

          {rangeError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{rangeError}</p>}

          {rangeData && !rangeError && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {fmtDate(rangeData.from)} — {fmtDate(rangeData.to)}
              </p>

              {rangeData.agents.length === 0 ? (
                <p className="text-sm text-gray-400">No records found for this date range.</p>
              ) : (
                <div className="space-y-4">
                  {rangeData.agents.map(a => (
                    <div key={a.agent} className="space-y-1">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{a.agent}</p>
                          <p className="text-xs text-gray-400">{a.days} day{a.days !== 1 ? 's' : ''} worked</p>
                        </div>
                        <p className="text-base font-bold text-blue-900">{a.label}</p>
                      </div>
                      <div className="h-8 bg-gray-100 rounded-xl overflow-hidden">
                        <div
                          className="h-full bg-blue-900 rounded-xl flex items-center px-3 transition-all duration-700"
                          style={{ width: `${Math.max(6, (a.totalHours / maxHours) * 100)}%` }}
                        >
                          <span className="text-xs text-white font-semibold whitespace-nowrap">
                            {a.totalHours.toFixed(1)} hrs
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Total row */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total all staff</p>
                      <p className="text-sm font-bold text-orange-600">
                        {fmtHours(rangeData.agents.reduce((s, a) => s + a.totalHours, 0))}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Employee Profiles ────────────────────────────────────────────── */}
        <Section title="👤 Employee Profiles">
          {empLoading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : (
            <>
              {empProfiles.length === 0 && empEditing !== 'new' ? (
                <p className="text-sm text-gray-400">No employee profiles yet.</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left pb-2 font-medium px-1">Name</th>
                        <th className="text-left pb-2 font-medium px-1">Type</th>
                        <th className="text-left pb-2 font-medium px-1">Birthday</th>
                        <th className="text-left pb-2 font-medium px-1">Phone</th>
                        <th className="text-left pb-2 font-medium px-1">Email</th>
                        <th className="text-left pb-2 font-medium px-1">Start Date</th>
                        <th className="text-left pb-2 font-medium px-1">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {empProfiles.map(p => (
                        empEditing === p.name ? (
                          <tr key={p.name} className="bg-blue-50">
                            <td className="py-2 px-1 text-xs font-semibold text-gray-700">{p.name}</td>
                            <td className="py-2 px-1">
                              <select value={empForm.type} onChange={e => setEmpForm(f => ({ ...f, type: e.target.value }))}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-28">
                                <option>Full-time</option>
                                <option>Part-time</option>
                              </select>
                            </td>
                            <td className="py-2 px-1">
                              <input type="date" value={empForm.birthday} onChange={e => setEmpForm(f => ({ ...f, birthday: e.target.value }))}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-32" />
                            </td>
                            <td className="py-2 px-1">
                              <input type="tel" value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))}
                                placeholder="Phone"
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-28" />
                            </td>
                            <td className="py-2 px-1">
                              <input type="email" value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="Email"
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-36" />
                            </td>
                            <td className="py-2 px-1">
                              <input type="date" value={empForm.startDate} onChange={e => setEmpForm(f => ({ ...f, startDate: e.target.value }))}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-32" />
                            </td>
                            <td className="py-2 px-1">
                              <div className="flex gap-1.5">
                                <button onClick={handleEmpSave} disabled={empSaving}
                                  className="bg-blue-900 text-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-blue-800 disabled:opacity-40 transition-colors whitespace-nowrap">
                                  {empSaving ? '…' : 'Save'}
                                </button>
                                <button onClick={handleEmpCancel}
                                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg border border-gray-200 transition-colors">
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={p.name} className="hover:bg-gray-50">
                            <td className="py-2.5 font-semibold text-gray-800 px-1">{p.name}</td>
                            <td className="py-2.5 px-1">
                              <span className={`text-xs font-semibold rounded-full px-2 py-0.5 border ${
                                p.type === 'Full-time'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>{p.type}</span>
                            </td>
                            <td className="py-2.5 text-xs text-gray-500 px-1">{p.birthday || '—'}</td>
                            <td className="py-2.5 text-xs text-gray-500 px-1">{p.phone || '—'}</td>
                            <td className="py-2.5 text-xs text-gray-500 px-1">{p.email || '—'}</td>
                            <td className="py-2.5 text-xs text-gray-500 px-1">{p.startDate || '—'}</td>
                            <td className="py-2.5 px-1">
                              <div className="flex gap-1.5">
                                <button onClick={() => handleEmpEditStart(p)} disabled={empSaving || empEditing !== null}
                                  className="text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40">
                                  Edit
                                </button>
                                <button onClick={() => handleEmpRemove(p.name)} disabled={empSaving || empEditing !== null}
                                  className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40">
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add Employee form */}
              {empEditing === 'new' && (
                <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
                  <p className="text-xs font-bold text-blue-900 uppercase tracking-wide">New Employee</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name <span className="text-red-500">*</span></label>
                      <input type="text" value={empForm.name} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Full name"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Type</label>
                      <select value={empForm.type} onChange={e => setEmpForm(f => ({ ...f, type: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                        <option>Full-time</option>
                        <option>Part-time</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Birthday</label>
                      <input type="date" value={empForm.birthday} onChange={e => setEmpForm(f => ({ ...f, birthday: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                      <input type="tel" value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+63 9XX XXX XXXX"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                      <input type="email" value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="email@example.com"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                      <input type="date" value={empForm.startDate} onChange={e => setEmpForm(f => ({ ...f, startDate: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                  </div>
                  {empError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{empError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button onClick={handleEmpSave} disabled={empSaving || !empForm.name.trim()}
                      className="bg-blue-900 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-blue-800 disabled:opacity-40 transition-colors">
                      {empSaving ? 'Saving…' : 'Save Employee'}
                    </button>
                    <button onClick={handleEmpCancel}
                      className="px-4 py-2 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {empError && empEditing !== 'new' && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{empError}</p>
              )}

              {empEditing === null && (
                <button onClick={handleEmpAddStart}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-2.5 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
                  + Add Employee
                </button>
              )}
            </>
          )}
        </Section>

        {/* ── Internal Messaging ───────────────────────────────────────────── */}
        <Section title="💬 Internal Messaging">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">To</label>
                <select value={msgTo} onChange={e => setMsgTo(e.target.value)}
                  className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white min-w-[140px]">
                  {msgRecipients.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Message</label>
              <textarea
                value={msgText}
                onChange={e => { setMsgText(e.target.value); setMsgSendSuccess(false); }}
                placeholder="Type your message to agents…"
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSendMessage}
                disabled={msgSending || !msgText.trim()}
                className="bg-blue-900 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-blue-800 disabled:opacity-40 transition-colors"
              >
                {msgSending ? 'Sending…' : '📤 Send Message'}
              </button>
              {msgSendSuccess && (
                <span className="text-xs text-green-600 font-semibold">Message sent!</span>
              )}
            </div>
          </div>

          {/* Sent message history */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <button
              onClick={handleLoadMsgHistory}
              disabled={msgHistoryLoading}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {msgHistoryLoading ? 'Loading…' : msgHistory ? '↻ Refresh History' : 'View Sent Messages'}
            </button>

            {msgHistoryError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{msgHistoryError}</p>
            )}

            {msgHistory && (
              msgHistory.length === 0 ? (
                <p className="text-sm text-gray-400">No messages in the last 7 days.</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left pb-2 font-medium px-1">Time</th>
                        <th className="text-left pb-2 font-medium px-1">To</th>
                        <th className="text-left pb-2 font-medium px-1">Message</th>
                        <th className="text-left pb-2 font-medium px-1">Read By</th>
                        <th className="pb-2 px-1"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {msgHistory.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="py-2 text-xs text-gray-500 px-1 whitespace-nowrap">{m.timestamp}</td>
                          <td className="py-2 text-xs font-semibold text-blue-900 px-1 whitespace-nowrap">{m.to}</td>
                          <td className="py-2 text-xs text-gray-700 px-1 max-w-xs truncate">{m.message}</td>
                          <td className="py-2 text-xs text-gray-400 px-1">{m.readBy || '—'}</td>
                          <td className="py-2 px-1">
                            <button
                              onClick={() => handleDeleteMessage(m.id)}
                              disabled={msgDeleting === m.id}
                              className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-0.5 rounded-lg transition-colors disabled:opacity-40"
                            >
                              {msgDeleting === m.id ? '…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </Section>

        {/* ── Password Management ──────────────────────────────────────────── */}
        <Section title="🔐 Change Passwords">
          <div className="space-y-4">
            {/* Agent (staff) password */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Staff Login Password</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newAgentPw}
                  onChange={e => { setNewAgentPw(e.target.value); setPwError(null); setPwSuccess(null); }}
                  placeholder="New staff password"
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  onClick={handleChangeAgentPw}
                  disabled={!newAgentPw.trim() || pwSaving}
                  className="bg-blue-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-800 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {pwSaving ? 'Saving…' : 'Update'}
                </button>
              </div>
            </div>

            {/* Admin password */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Admin Password</p>
              <p className="text-xs text-amber-600 mb-1.5">You will be logged out immediately and must sign in with the new password.</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newAdminPw}
                  onChange={e => { setNewAdminPw(e.target.value); setPwError(null); setPwSuccess(null); }}
                  placeholder="New admin password"
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  onClick={handleChangeAdminPw}
                  disabled={!newAdminPw.trim() || pwSaving}
                  className="bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-800 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {pwSaving ? 'Saving…' : 'Update'}
                </button>
              </div>
            </div>

            {pwError   && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{pwError}</p>}
            {pwSuccess && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{pwSuccess}</p>}
          </div>
        </Section>

        {/* ── Staff Management ─────────────────────────────────────────────── */}
        <Section title="👥 Manage Staff">
          {staffLoading
            ? <p className="text-xs text-gray-400">Loading…</p>
            : staffList.length === 0
              ? <p className="text-sm text-gray-400">No staff added yet. Add names below.</p>
              : (
                <ul className="divide-y divide-gray-50">
                  {staffList.map(name => (
                    <li key={name} className="flex items-center justify-between py-2.5">
                      <span className="text-sm font-medium text-gray-800">{name}</span>
                      <button
                        onClick={() => handleRemoveStaff(name)}
                        disabled={staffSaving}
                        className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )
          }

          {staffError && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{staffError}</p>
          )}

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <input
              type="text"
              value={newStaffName}
              onChange={e => { setNewStaffName(e.target.value); setStaffError(null); }}
              onKeyDown={e => e.key === 'Enter' && handleAddStaff()}
              placeholder="Enter full name"
              className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={handleAddStaff}
              disabled={!newStaffName.trim() || staffSaving}
              className="bg-blue-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-800 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {staffSaving ? 'Saving…' : '+ Add'}
            </button>
          </div>
        </Section>

        {/* ── Security Settings ────────────────────────────────────────────── */}
        <Section title="🛡️ Security Settings">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-700">Allow Agent App Screenshots</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {screenshotAllowed
                  ? 'ON — agents can take screenshots and use the built-in error report button.'
                  : 'OFF — screenshot is blocked. Turn ON temporarily so agents can report errors.'}
              </p>
            </div>
            <button
              onClick={() => handleToggleScreenshot(!screenshotAllowed)}
              disabled={screenshotSaving}
              className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${
                screenshotAllowed ? 'bg-green-500' : 'bg-gray-300'
              } disabled:opacity-50`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                screenshotAllowed ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </Section>

        {/* ── Login Log ────────────────────────────────────────────────────── */}
        <Section title="🔍 Login Attempt Log">
          <p className="text-xs text-gray-400">Shows the last 50 login attempts — who typed what and whether it succeeded.</p>
          <button
            onClick={handleLoadLoginLog}
            disabled={loginLogLoading}
            className="bg-gray-800 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {loginLogLoading ? 'Loading…' : loginLog ? '↻ Refresh' : 'Load Log'}
          </button>

          {loginLogError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{loginLogError}</p>}

          {loginLog && (() => {
            // Build IP → list of row indices for cross-reference
            const ipMap = {};
            loginLog.forEach((e, i) => {
              if (!e.ip) return;
              if (!ipMap[e.ip]) ipMap[e.ip] = [];
              ipMap[e.ip].push(i);
            });

            return loginLog.length === 0
              ? <p className="text-sm text-gray-400">No login attempts recorded yet.</p>
              : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left pb-2 font-medium px-1">Time (PH)</th>
                        <th className="text-left pb-2 font-medium px-1">Result</th>
                        <th className="text-left pb-2 font-medium px-1">Password Typed</th>
                        <th className="text-left pb-2 font-medium px-1">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {loginLog.map((e, i) => {
                        const isFailed = e.result.startsWith('❌');
                        const sameIpRows = e.ip ? (ipMap[e.ip] || []).filter(j => j !== i) : [];
                        return (
                          <tr key={i} className={isFailed ? 'bg-red-50' : ''}>
                            <td className="py-2 text-xs text-gray-500 px-1 whitespace-nowrap">{e.time}</td>
                            <td className="py-2 text-xs font-semibold px-1 whitespace-nowrap">{e.result}</td>
                            <td className="py-2 text-xs font-mono px-1">{e.password}</td>
                            <td className="py-2 text-xs px-1">
                              {e.ip ? (
                                <div>
                                  <span className="font-mono text-gray-600">{e.ip}</span>
                                  {sameIpRows.length > 0 && (
                                    <div className="mt-0.5 text-gray-400 text-[10px] leading-tight">
                                      Same IP: {sameIpRows.slice(0, 3).map(j => (
                                        <span key={j} className={`inline-block mr-1 ${loginLog[j].result.startsWith('❌') ? 'text-red-400' : 'text-green-600'}`}>
                                          {loginLog[j].result}
                                        </span>
                                      ))}
                                      {sameIpRows.length > 3 && <span>+{sameIpRows.length - 3} more</span>}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
          })()}
        </Section>

      </main>

      <footer className="mt-8 py-4 text-center text-xs text-gray-400">
        Created by <span className="font-semibold text-gray-500">Masterlabs</span>
        {' '}|{' '}
        <span className="font-semibold text-gray-500">+639479984309</span>
      </footer>
    </div>
  );
}
