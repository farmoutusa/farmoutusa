import React, { useState } from 'react';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwhExqtU7hEphKCNP7WWUkp5sAQMFEPsdd1lPgUO1O7cXyEFUf4ecHB2OuXNoWb8lUs/exec';

function fmtNow(zone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date());
}

export default function CallbackNoteForm({ result }) {
  const { formattedNumber, selectedZone } = result;

  const [customerName, setCustomerName] = useState('');
  const [callDetails,  setCallDetails]  = useState('');
  const [agentName,    setAgentName]    = useState(() => localStorage.getItem('cwc_agent_name') || '');
  const [status,       setStatus]       = useState('idle'); // idle | sending | done | error

  const agentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    const payload = {
      customerName: customerName.trim(),
      customerPhone: formattedNumber,
      customerTime: fmtNow(selectedZone),
      agentName: agentName.trim(),
      agentTime: fmtNow(agentTz),
      callDetails: callDetails.trim(),
    };
    try {
      const params = new URLSearchParams({ ...payload, _t: Date.now() });
      await fetch(SCRIPT_URL + '?' + params.toString(), {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
      });
      localStorage.setItem('cwc_agent_name', agentName.trim());
      setStatus('done');
      setCustomerName('');
      setCallDetails('');
    } catch {
      setStatus('error');
    }
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (status === 'done') {
    return (
      <div className="bg-green-50 rounded-2xl shadow border border-green-200 p-5 text-center space-y-2">
        <p className="text-green-700 text-lg font-bold">✅ Logged to Google Sheets</p>
        <p className="text-green-600 text-xs">Email notification sent to zotacvoicemail@gmail.com</p>
        <button
          onClick={() => setStatus('idle')}
          className="text-xs text-green-700 underline mt-1"
        >
          Log another callback
        </button>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-5 space-y-3">
      <h3 className="text-sm font-bold text-gray-800">📋 Log This Callback</h3>

      {/* Auto-filled info strip */}
      <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-500 space-y-1">
        <div><span className="font-medium text-gray-600">Phone:</span> <span className="font-mono">{formattedNumber}</span></div>
        <div><span className="font-medium text-gray-600">Customer time:</span> {fmtNow(selectedZone)}</div>
        <div><span className="font-medium text-gray-600">Agent time (PH):</span> {fmtNow(agentTz)}</div>
      </div>

      {/* Customer Name */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name *</label>
        <input
          value={customerName}
          onChange={e => setCustomerName(e.target.value)}
          required
          placeholder="e.g. John Smith"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Call Details */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Call Details *</label>
        <textarea
          value={callDetails}
          onChange={e => setCallDetails(e.target.value)}
          required
          rows={5}
          placeholder="Describe the callback — issue details, what was discussed, follow-up needed..."
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
      </div>

      {/* Agent Name */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Agent Name *</label>
        <input
          value={agentName}
          onChange={e => setAgentName(e.target.value)}
          required
          placeholder="Your name"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <p className="text-xs text-gray-400 mt-0.5">Saved for next time.</p>
      </div>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full bg-orange-500 text-white py-2.5 rounded-xl text-sm font-semibold
                   hover:bg-orange-600 disabled:opacity-40 transition-colors"
      >
        {status === 'sending' ? 'Logging…' : 'Log to Google Sheets'}
      </button>

      {status === 'error' && (
        <p className="text-red-600 text-xs text-center">
          Failed to submit. Check that the Apps Script is deployed and accessible.
        </p>
      )}
    </form>
  );
}
