import React, { useState } from 'react';
import PhoneChecker from './components/PhoneChecker.jsx';
import USATimezonePanel from './components/USATimezonePanel.jsx';

const PASSWORD = 'farmoutusa';
const SESSION_KEY = 'cwc_auth';


function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (input === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1');
      onUnlock();
    } else {
      setError(true);
      setInput('');
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm border-t-4 border-orange-500">
        <div className="text-center mb-6 space-y-1">
          <img src="/farmoutusalogo.png" alt="farmout usa" className="w-56 mx-auto" />
          <h1 className="text-xl font-bold text-blue-900">Callback VM System</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
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

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md border-t-4 border-orange-500">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <img src="/farmoutusalogo.png" alt="farmout usa" className="w-44 -my-2" />
          <h1 className="text-xl font-bold text-blue-900 leading-tight">Callback VM System</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0">
            <PhoneChecker />
          </div>
          <USATimezonePanel />
        </div>
      </main>

      <footer className="mt-8 py-4 text-center text-xs text-gray-400">
        Created by <span className="font-semibold text-gray-500">Masterlabs</span>
        {' '}|{' '}
        <span className="font-semibold text-gray-500">+639479984309</span>
      </footer>
    </div>
  );
}
