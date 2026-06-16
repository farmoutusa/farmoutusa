import React, { useState, useEffect } from 'react';

// Format an ISO string into a given IANA timezone using the browser's Intl API
function fmt(iso, zone, opts = {}) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      ...opts,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtAgent(iso, opts = {}) {
  // Format in the agent's own browser timezone
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      ...opts,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function LiveAgentClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="text-right text-xs text-gray-500">
      <div>Your local time</div>
      <div className="font-mono text-sm text-gray-700 tabular-nums">
        {now.toLocaleTimeString('en-US', { hour12: false })}
      </div>
      <div className="text-gray-400">{tz}</div>
    </div>
  );
}

export default function ResultCard({ result, onZoneChange }) {
  const {
    verdict, formattedNumber, country,
    candidateZones, selectedZone, localTime,
    callbackDueIso, callbackDueCustomerIso, nextWindowIso,
    businessStart, businessEnd, retryHours, retryMinutes,
    error: resultError,
  } = result;

  const isGood    = verdict === 'call_now';
  const isUnknown = verdict === 'unknown_timezone';
  const retry     = `${retryHours}h ${String(retryMinutes).padStart(2, '0')}m`;

  const borderCls = isGood    ? 'border-green-400'
                  : isUnknown ? 'border-yellow-400'
                  : 'border-amber-400';
  const bgCls     = isGood    ? 'bg-green-50'
                  : isUnknown ? 'bg-yellow-50'
                  : 'bg-amber-50';

  return (
    <div className={`rounded-2xl shadow-lg border-2 ${borderCls} ${bgCls} p-6 space-y-4`}>

      {/* Top row: number + agent clock */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Customer</div>
          <div className="text-2xl font-mono font-bold text-gray-900">{formattedNumber}</div>
          <div className="text-sm text-gray-500 mt-0.5">{country}</div>
        </div>
        <LiveAgentClock />
      </div>

      {/* Timezone picker */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Customer Timezone
          {candidateZones?.length > 1 && (
            <span className="ml-2 font-normal text-amber-600">
              multi-timezone country — best-guess selected
            </span>
          )}
        </label>
        {candidateZones?.length > 1 ? (
          <select
            value={selectedZone}
            onChange={e => onZoneChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {candidateZones.map((z, i) => (
              <option key={z} value={z}>{z}{i === 0 ? ' ★ best guess' : ''}</option>
            ))}
          </select>
        ) : (
          <div className="text-sm font-semibold text-gray-800">{selectedZone}</div>
        )}
      </div>

      {/* Customer's current local time */}
      {localTime && (
        <div className="bg-white rounded-xl border px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-0.5">
            Customer's current local time
          </div>
          <div className="text-lg font-mono font-semibold text-gray-900">
            {fmt(localTime, selectedZone, { second: '2-digit' })}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            Calling window: {businessStart} – {businessEnd} customer local
          </div>
        </div>
      )}

      {/* Verdict banner */}
      <div className={`rounded-xl px-5 py-4 ${
        isGood    ? 'bg-green-500 text-white'
        : isUnknown ? 'bg-yellow-500 text-white'
        : 'bg-amber-500 text-white'
      }`}>
        {isGood && (
          <p className="text-xl font-bold">✅  OK to call now</p>
        )}

        {isUnknown && (
          <div>
            <p className="text-lg font-bold mb-1">⚠️  Timezone unknown</p>
            <p className="text-sm opacity-90">{resultError}</p>
          </div>
        )}

        {!isGood && !isUnknown && (
          <div className="space-y-3">
            <p className="text-xl font-bold">⏳  Don't call now</p>

            {callbackDueIso && (
              <div>
                <p className="text-xs font-semibold uppercase opacity-80 mb-0.5">
                  Suggested callback (now + {retry})
                </p>
                <p className="font-mono text-sm">
                  Customer: {fmt(callbackDueCustomerIso, selectedZone)}
                </p>
                <p className="font-mono text-sm opacity-75">
                  Your time: {fmtAgent(callbackDueIso)}
                </p>
              </div>
            )}

            {nextWindowIso && (
              <div className="pt-2 border-t border-white/30">
                <p className="text-xs font-semibold uppercase opacity-80 mb-0.5">
                  Next calling window opens
                </p>
                <p className="font-mono text-sm">
                  Customer: {fmt(nextWindowIso, selectedZone)}
                </p>
                <p className="font-mono text-sm opacity-75">
                  Your time: {fmtAgent(nextWindowIso)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
