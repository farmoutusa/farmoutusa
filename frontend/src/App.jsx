import React, { useState, useEffect, useRef } from 'react';
import PhoneChecker from './components/PhoneChecker.jsx';
import USATimezonePanel from './components/USATimezonePanel.jsx';
import AttendanceTab from './components/AttendanceTab.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';

function useInstallPrompt() {
  const [prompt,    setPrompt]    = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = e => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setPrompt(null); setDismissed(true); });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function install() {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setDismissed(true);
    setPrompt(null);
  }

  return { canInstall: !!prompt && !dismissed, install, dismiss: () => setDismissed(true) };
}

const PASSWORD        = 'farmoutusavmtool';
const ADMIN_PASSWORD  = 'S26Ultr@';
const SESSION_KEY     = 'cwc_auth';
const DEVICE_KEY      = 'cwc_device';
const ADMIN_SESSION_KEY = 'cwc_admin';

function PasswordGate({ onUnlock, onAdminUnlock }) {
  const [input,  setInput]  = useState('');
  const [error,  setError]  = useState(false);
  const [device, setDevice] = useState(() =>
    window.innerWidth < 600 ? 'mobile' : 'pc'
  );

  function handleSubmit(e) {
    e.preventDefault();
    if (input === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      onAdminUnlock();
    } else if (input === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1');
      sessionStorage.setItem(DEVICE_KEY, device);
      onUnlock(device);
    } else {
      setError(true);
      setInput('');
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm border-t-4 border-orange-500">
        <div className="text-center mb-6">
          <img src="/farmoutusalogo.png" alt="farmout usa" className="w-56 mx-auto mt-4" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">I'm viewing on</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'pc',     label: '💻  PC / Desktop' },
                { id: 'mobile', label: '📱  Mobile'       },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDevice(id)}
                  className={`py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    device === id
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false); }}
              autoFocus
              placeholder="Enter password"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {error && (
              <p className="text-red-500 text-xs mt-1">Incorrect password. Try again.</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-orange-500 text-white py-3 rounded-xl text-sm font-semibold
                       hover:bg-orange-600 active:bg-orange-700 transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [adminUnlocked, setAdminUnlocked] = useState(
    () => sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'
  );
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1'
  );
  const [device, setDevice] = useState(
    () => sessionStorage.getItem(DEVICE_KEY) || 'pc'
  );

  const isMobile = device === 'mobile';
  const { canInstall, install, dismiss } = useInstallPrompt();
  const loggingOut    = useRef(false);
  const tamperLogged  = useRef(false);
  const [activeTab,      setActiveTab]      = useState('attendance');
  const [clockTampered,  setClockTampered]  = useState(false);

  function handleAdminLogout() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.reload();
  }

  if (adminUnlocked) {
    return <AdminDashboard onLogout={handleAdminLogout} />;
  }

  // Detect system clock changes using performance.now() (monotonic, unaffected by OS clock)
  useEffect(() => {
    if (!unlocked) return;
    let refDate = Date.now();
    let refPerf = performance.now();

    function resetRef() { refDate = Date.now(); refPerf = performance.now(); }

    // After sleep/wake, reset baseline so we don't flag legitimate wakeups
    function onVisibility() { if (!document.hidden) setTimeout(resetRef, 600); }
    document.addEventListener('visibilitychange', onVisibility);

    const id = setInterval(async () => {
      if (document.hidden) return;
      const drift = Math.abs(Date.now() - (refDate + (performance.now() - refPerf)));
      if (drift > 30000 && !tamperLogged.current) {
        tamperLogged.current = true;
        setClockTampered(true);
        // Log incident to Google Sheet silently
        try {
          const agentName = (() => {
            try { return JSON.parse(localStorage.getItem('cwc_attendance'))?.agentName || localStorage.getItem('cwc_agent_name') || 'Unknown'; } catch { return localStorage.getItem('cwc_agent_name') || 'Unknown'; }
          })();
          let ip = 'Unknown';
          try { ip = (await (await fetch('https://api.ipify.org?format=json')).json()).ip; } catch {}
          const ts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date());
          fetch('https://script.google.com/macros/s/AKfycbwhExqtU7hEphKCNP7WWUkp5sAQMFEPsdd1lPgUO1O7cXyEFUf4ecHB2OuXNoWb8lUs/exec?' + new URLSearchParams({ type: 'attendance', action: 'CLOCK_TAMPER', agentName, timestamp: ts, drift: Math.round(drift / 1000) + 's', ip, _t: Date.now() }), { method: 'GET', mode: 'no-cors', cache: 'no-store' });
        } catch {}
      }
    }, 3000);

    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisibility); };
  }, [unlocked]);

  // Ask "are you sure?" when the user tries to close the tab/window
  useEffect(() => {
    if (!unlocked) return;
    const handler = e => {
      if (loggingOut.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unlocked]);

  async function handleLogout() {
    if (!window.confirm('Log out? You will need to enter the password again next time.')) return;
    loggingOut.current = true;
    // Clear all service worker caches so the next load fetches fresh code
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DEVICE_KEY);
    window.location.reload();
  }

  if (!unlocked) {
    return (
      <PasswordGate
        onUnlock={dev => { setDevice(dev); setUnlocked(true); }}
        onAdminUnlock={() => setAdminUnlocked(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {clockTampered && (
        <div className="sticky top-0 z-50 bg-red-600 text-white px-4 py-3 text-center shadow-lg">
          <p className="text-sm font-bold">🚨 System clock change detected.</p>
          <p className="text-xs mt-0.5 text-red-100">
            Changing the time is recorded and goes against company policy.
            Your work hours will not be changed — they are computed using server time.
          </p>
        </div>
      )}
      <header className="bg-white shadow-md border-t-4 border-orange-500">
        <div className={`max-w-5xl mx-auto flex items-end justify-between ${isMobile ? 'px-3 py-2' : 'px-4 py-3'}`}>
          <div>
            <img
              src="/farmoutusalogo.png"
              alt="farmout usa"
              className={`${isMobile ? 'w-32' : 'w-44'} -my-2`}
            />
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors pb-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-.943a.75.75 0 1 0-1.004-1.114l-2.5 2.25a.75.75 0 0 0 0 1.114l2.5 2.25a.75.75 0 1 0 1.004-1.114l-1.048-.943h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
            </svg>
            Log out
          </button>
        </div>
      </header>

      <main className={`max-w-5xl mx-auto ${isMobile ? 'px-3 py-3' : 'px-4 py-3'}`}>
        {/* Tab Bar */}
        <div className="flex bg-white rounded-2xl shadow mb-3 overflow-hidden border border-gray-100">
          {[
            { id: 'attendance', label: '🕐 Attendance'       },
            { id: 'checker',    label: '📞 Callback Checker' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'checker' ? (
          isMobile ? (
            <div className="space-y-3">
              <PhoneChecker isMobile />
              <USATimezonePanel isMobile />
            </div>
          ) : (
            <div className="flex gap-4 items-start">
              <div className="flex-1 min-w-0">
                <PhoneChecker />
              </div>
              <USATimezonePanel />
            </div>
          )
        ) : (
          <AttendanceTab isMobile={isMobile} />
        )}
      </main>

      <footer className="mt-8 py-4 text-center text-xs text-gray-400">
        Created by <span className="font-semibold text-gray-500">Masterlabs</span>
        {' '}|{' '}
        <span className="font-semibold text-gray-500">+639479984309</span>
      </footer>

      {canInstall && (
        <div className="fixed bottom-0 left-0 right-0 bg-blue-900 text-white px-4 py-3
                        flex items-center justify-between shadow-2xl z-50 border-t-2 border-orange-500">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white rounded-lg px-2 py-1 shrink-0">
              <img src="/farmoutusalogo.png" alt="" className="h-7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">Install Callback VM System</p>
              <p className="text-xs text-blue-300">Add to home screen for quick access</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 ml-3">
            <button
              onClick={dismiss}
              className="text-xs text-blue-300 hover:text-white px-2 py-1.5 transition-colors"
            >
              Later
            </button>
            <button
              onClick={install}
              className="bg-orange-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold
                         hover:bg-orange-600 transition-colors whitespace-nowrap"
            >
              Install
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
