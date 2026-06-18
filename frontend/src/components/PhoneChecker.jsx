import React, { useState } from 'react';
import { checkNumber } from '../check.js';
import ResultCard from './ResultCard.jsx';

export default function PhoneChecker() {
  const [number,       setNumber]      = useState('');
  const [result,       setResult]      = useState(null);
  const [error,        setError]       = useState('');
  const [selectedZone, setSelectedZone] = useState(null);

  function runCheck(zone) {
    setError('');
    try {
      const data = checkNumber(number.trim(), zone ?? null);
      setResult(data);
      if (data.selectedZone) setSelectedZone(data.selectedZone);
    } catch (e) {
      setError(e.message);
      setResult(null);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!number.trim()) return;
    setResult(null);
    setSelectedZone(null);
    runCheck(null);
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Check Callback Window</h2>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="tel"
            value={number}
            onChange={e => setNumber(e.target.value)}
            placeholder="+1 415 555 2671"
            autoFocus
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base font-mono
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!number.trim()}
            className="bg-blue-600 text-white px-7 py-3 rounded-xl font-semibold text-sm
                       hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            Check
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2">
          Enter the full international number with country code, e.g.{' '}
          <span className="font-mono">+63 2 8123 4567</span>
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm leading-relaxed">
          {error}
        </div>
      )}

      {result && (
        <ResultCard
          result={result}
          onZoneChange={zone => { setSelectedZone(zone); runCheck(zone); }}
        />
      )}
    </div>
  );
}
