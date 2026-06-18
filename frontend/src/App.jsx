import React, { useState, useEffect } from 'react';
import PhoneChecker from './components/PhoneChecker.jsx';
import USATimezonePanel from './components/USATimezonePanel.jsx';

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

const PASSWORD   = 'farmoutusavmtool';
const SESSION_KEY = 'cwc_auth';
const DEVICE_KEY  = 'cwc_device';

function PasswordGate({ onUnlock }) {
  const [input,  setInput]  = useState('');
  const [error,  setError]  = useState(false);
  const [device, setDevice] = useState(() =>
    window.innerWidth < 600 ? 'mobile' : 'pc'
  );

  function handleSubmit(e) {
    e.preventDefault();
    if (input === PASSWORD) {
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
          <img src="/farmoutusalogo.png" alt="farmout usa" className="w-56 mx-auto" />
          <h1 className="text-xl font-bold text-blue-900 mt-1">Callback VM System</h1>
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
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1'
  );
  const [device, setDevice] = useState(
    () => sessionStorage.getItem(DEVICE_KEY) || 'pc'
  );

  const isMobile = device === 'mobile';
  const { canInstall, install, dismiss } = useInstallPrompt();

  if (!unlocked) {
    return <PasswordGate onUnlock={dev => { setDevice(dev); setUnlocked(true); }} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md border-t-4 border-orange-500">
        <div className={`max-w-5xl mx-auto ${isMobile ? 'px-3 py-2' : 'px-4 py-3'}`}>
          <img
            src="/farmoutusalogo.png"
            alt="farmout usa"
            className={`${isMobile ? 'w-32' : 'w-44'} -my-2`}
          />
          <h1 className={`font-bold text-blue-900 leading-tight ${isMobile ? 'text-base mt-0' : 'text-xl'}`}>
            Callback VM System
          </h1>
        </div>
      </header>

      <main className={`max-w-5xl mx-auto ${isMobile ? 'px-3 py-3' : 'px-4 py-3'}`}>
        {isMobile ? (
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
