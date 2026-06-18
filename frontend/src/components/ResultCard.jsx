import React, { useState, useEffect } from 'react';

const ZONE_LABELS = {
  // USA
  'America/New_York':    'Eastern · New York',
  'America/Chicago':     'Central · Chicago',
  'America/Denver':      'Mountain · Denver',
  'America/Los_Angeles': 'Pacific · Los Angeles',
  'America/Phoenix':     'Arizona · Phoenix (no DST)',
  'America/Anchorage':   'Alaska · Anchorage',
  'Pacific/Honolulu':    'Hawaii · Honolulu',
  // Canada
  'America/Toronto':     'Eastern · Toronto',
  'America/Winnipeg':    'Central · Winnipeg',
  'America/Edmonton':    'Mountain · Edmonton',
  'America/Vancouver':   'Pacific · Vancouver',
  // Australia
  'Australia/Sydney':    'AEDT/AEST · Sydney',
  'Australia/Brisbane':  'AEST · Brisbane',
  'Australia/Adelaide':  'ACDT/ACST · Adelaide',
  'Australia/Perth':     'AWST · Perth',
  'Australia/Darwin':    'ACST · Darwin',
  // Brazil
  'America/Sao_Paulo':   'BRT · São Paulo',
  'America/Fortaleza':   'BRT · Fortaleza',
  'America/Manaus':      'AMT · Manaus',
  'America/Belem':       'BRT · Belém',
  // Russia
  'Europe/Moscow':       'MSK · Moscow',
  'Asia/Yekaterinburg':  'YEKT · Yekaterinburg',
  'Asia/Novosibirsk':    'NOVT · Novosibirsk',
  'Asia/Irkutsk':        'IRKT · Irkutsk',
  'Asia/Vladivostok':    'VLAT · Vladivostok',
  // Indonesia
  'Asia/Jakarta':        'WIB · Jakarta',
  'Asia/Makassar':       'WITA · Makassar',
  'Asia/Jayapura':       'WIT · Jayapura',
};

function zoneLabel(zone) {
  return ZONE_LABELS[zone] ?? zone.split('/').pop().replace(/_/g, ' ');
}

function fmt(iso, zone, showSeconds = false) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      ...(showSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    }).format(new Date(iso));
  } catch { return iso; }
}

function fmtAgent(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch { return iso; }
}

function LiveAgentClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  return (
    <div className="text-right text-xs text-gray-500">
      <div>Your time</div>
      <div className="font-mono text-sm text-gray-700 tabular-nums whitespace-nowrap">{time}</div>
      <div className="text-gray-400 text-xs">{tz}</div>
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
  const multiZone = candidateZones?.length > 1;

  const borderCls = isGood ? 'border-green-400' : isUnknown ? 'border-yellow-400' : 'border-amber-400';
  const bgCls     = isGood ? 'bg-green-50'      : isUnknown ? 'bg-yellow-50'      : 'bg-amber-50';

  return (
    <div className={`rounded-2xl shadow-lg border-2 ${borderCls} ${bgCls} p-4 space-y-3`}>

      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Customer</div>
          <div className="text-2xl font-mono font-bold text-gray-900">{formattedNumber}</div>
          <div className="text-sm text-gray-500">{country}</div>
        </div>
        <LiveAgentClock />
      </div>

      {/* Timezone */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Customer Timezone
          {multiZone && (
            <span className="ml-2 font-normal text-amber-600">select the customer's region</span>
          )}
        </label>
        {multiZone ? (
          <select
            value={selectedZone}
            onChange={e => onZoneChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {candidateZones.map(z => (
              <option key={z} value={z}>{zoneLabel(z)}</option>
            ))}
          </select>
        ) : (
          <div className="text-sm font-semibold text-gray-800">{selectedZone}</div>
        )}
      </div>

      {/* Customer local time */}
      {localTime && (
        <div className="bg-white rounded-xl border px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-0.5">
            Customer's current local time
          </div>
          <div className="text-lg font-mono font-semibold text-gray-900">
            {fmt(localTime, selectedZone, true)}
          </div>
          <div className="text-xs text-gray-400">
            Calling window: {businessStart} – {businessEnd} customer local
          </div>
        </div>
      )}

      {/* Verdict */}
      <div className={`rounded-xl px-4 py-3 ${
        isGood ? 'bg-green-500 text-white' : isUnknown ? 'bg-yellow-500 text-white' : 'bg-amber-500 text-white'
      }`}>
        {isGood && <p className="text-xl font-bold">✅  OK to call now</p>}

        {isUnknown && (
          <div>
            <p className="text-lg font-bold mb-0.5">⚠️  Timezone unknown</p>
            <p className="text-sm opacity-90">{resultError}</p>
          </div>
        )}

        {!isGood && !isUnknown && (
          <div className="space-y-2">
            <p className="text-xl font-bold">⏳  Don't call now</p>

            {callbackDueIso && (
              <div>
                <p className="text-xs font-semibold uppercase opacity-80 mb-0.5">
                  Suggested callback (now + {retry})
                </p>
                <p className="font-mono text-sm">Customer: {fmt(callbackDueCustomerIso, selectedZone)}</p>
                <p className="font-mono text-sm opacity-75">Your time: {fmtAgent(callbackDueIso)}</p>
              </div>
            )}

            {nextWindowIso && (
              <div className="pt-2 border-t border-white/30">
                <p className="text-xs font-semibold uppercase opacity-80 mb-0.5">
                  Next calling window opens
                </p>
                <p className="font-mono text-sm">Customer: {fmt(nextWindowIso, selectedZone)}</p>
                <p className="font-mono text-sm opacity-75">Your time: {fmtAgent(nextWindowIso)}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
