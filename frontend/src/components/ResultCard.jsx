import React, { useState, useEffect } from 'react';

function fmt(iso, zone, opts = {}) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone, weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false, ...opts,
    }).format(new Date(iso));
  } catch { return iso; }
}

function fmtAgent(iso, opts = {}) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false, ...opts,
    }).format(new Date(iso));
  } catch { return iso; }
}

function getZoneSnapshot(zone) {
  const now   = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: 'numeric', minute: 'numeric',
    hour12: false, timeZoneName: 'short',
  }).formatToParts(now);
  const h    = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m    = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const abbr = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
  return { min: h * 60 + m, abbr, timeStr: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` };
}

function shortName(zone) {
  return zone.split('/').pop().replace(/_/g, ' ');
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
      <div>Your time</div>
      <div className="font-mono text-sm text-gray-700 tabular-nums">
        {now.toLocaleTimeString('en-US', { hour12: false })}
      </div>
      <div className="text-gray-400 text-xs">{tz}</div>
    </div>
  );
}

function ZoneGrid({ zones, selectedZone, businessStart, businessEnd, onZoneChange }) {
  const startMin = parseInt(businessStart) * 60;
  const endMin   = parseInt(businessEnd)   * 60;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const cols = zones.length <= 4 ? zones.length : Math.ceil(zones.length / 2);
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };

  return (
    <div className="grid gap-2" style={gridStyle}>
      {zones.map(zone => {
        const { min, abbr, timeStr } = getZoneSnapshot(zone);
        const ok      = min >= startMin && min < endMin;
        const active  = zone === selectedZone;
        return (
          <button
            key={zone}
            onClick={() => onZoneChange(zone)}
            className={`text-left rounded-xl p-2 border-2 transition-all cursor-pointer
              ${active
                ? 'border-blue-500 bg-blue-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-300'}`}
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-xs font-bold text-gray-600">{abbr}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none
                ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {ok ? 'OK' : 'No'}
              </span>
            </div>
            <div className="font-mono text-base font-bold text-gray-900">{timeStr}</div>
            <div className="text-xs text-gray-400 mt-0.5 truncate">{shortName(zone)}</div>
          </button>
        );
      })}
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

      {/* Timezone: grid for multi-zone, plain label for single */}
      {multiZone ? (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1.5">
            Customer Timezone — select the correct one
          </div>
          <ZoneGrid
            zones={candidateZones}
            selectedZone={selectedZone}
            businessStart={businessStart}
            businessEnd={businessEnd}
            onZoneChange={onZoneChange}
          />
        </div>
      ) : (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-0.5">Customer Timezone</div>
          <div className="text-sm font-semibold text-gray-800">{selectedZone}</div>
        </div>
      )}

      {/* Customer local time */}
      {localTime && (
        <div className="bg-white rounded-xl border px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-0.5">
            Customer's current local time
          </div>
          <div className="text-lg font-mono font-semibold text-gray-900">
            {fmt(localTime, selectedZone, { second: '2-digit' })}
          </div>
          <div className="text-xs text-gray-400">
            Calling window: {businessStart} – {businessEnd} customer local
          </div>
        </div>
      )}

      {/* Verdict banner */}
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
