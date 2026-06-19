import React, { useState, useEffect, useCallback } from 'react';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwhExqtU7hEphKCNP7WWUkp5sAQMFEPsdd1lPgUO1O7cXyEFUf4ecHB2OuXNoWb8lUs/exec';
const ADMIN_KEY  = 'S26Ultr@';

// ── JSONP fetch (bypasses CORS — GAS wraps response in a callback) ──────────
function fetchAdmin(action, extra = {}) {
  return new Promise((resolve, reject) => {
    const cb   = '__adm_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const tid  = setTimeout(() => { cleanup(); reject(new Error('Request timed out')); }, 15000);
    const script = document.createElement('script');

    function cleanup() { clearTimeout(tid); delete window[cb]; script.remove(); }

    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Network error')); };

    const params = new URLSearchParams({ type: 'admin', adminKey: ADMIN_KEY, action, callback: cb, _t: Date.now(), ...extra });
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

  const loadDash = useCallback(async () => {
    try {
      setDashError(null);
      const data = await fetchAdmin('dashboard');
      if (data.error) throw new Error(data.error);
      setDash(data);
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

  const maxHours = rangeData?.agents?.length ? Math.max(...rangeData.agents.map(a => a.totalHours), 1) : 1;

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
        <Section title="🟢 Live Agent Status">
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
              ? <p className="text-sm text-gray-400 text-center py-4">No agents active today.</p>
              : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left pb-2 font-medium px-1">Agent</th>
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
                    <th className="text-left pb-2 font-medium px-1">Agent</th>
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
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total all agents</p>
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
      </main>

      <footer className="mt-8 py-4 text-center text-xs text-gray-400">
        Created by <span className="font-semibold text-gray-500">Masterlabs</span>
        {' '}|{' '}
        <span className="font-semibold text-gray-500">+639479984309</span>
      </footer>
    </div>
  );
}
