const express = require('express');
const router = express.Router();
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { DateTime } = require('luxon');

// Business-hours window and retry interval — edit these to change behavior.
const BUSINESS_START = '08:00';
const BUSINESS_END   = '19:00';
const RETRY_HOURS    = 3;
const RETRY_MINUTES  = 15;

// ── timezone resolver ─────────────────────────────────────────────────────────
// Try libphonenumber-geo-carrier first (area-code precision for multi-TZ countries).
// If unavailable, fall through to the country-level map below.
let geoTimezones = null;
try {
  const geo = require('libphonenumber-geo-carrier');
  const fn = geo.timezones ?? geo.default?.timezones;
  if (typeof fn === 'function') geoTimezones = fn;
} catch {
  // package not installed — country fallback will be used
}

// Country → IANA timezone list (covers 99% of support-team use-cases)
const COUNTRY_TZ = {
  US: ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'],
  CA: ['America/Toronto','America/Winnipeg','America/Edmonton','America/Vancouver','America/St_Johns'],
  MX: ['America/Mexico_City','America/Tijuana','America/Monterrey'],
  BR: ['America/Sao_Paulo','America/Manaus','America/Belem','America/Fortaleza','America/Recife','America/Cuiaba','America/Porto_Velho','America/Rio_Branco'],
  AR: ['America/Argentina/Buenos_Aires'],
  CL: ['America/Santiago'],
  CO: ['America/Bogota'],
  PE: ['America/Lima'],
  VE: ['America/Caracas'],
  UY: ['America/Montevideo'],
  GB: ['Europe/London'],
  IE: ['Europe/Dublin'],
  FR: ['Europe/Paris'],
  DE: ['Europe/Berlin'],
  IT: ['Europe/Rome'],
  ES: ['Europe/Madrid'],
  PT: ['Europe/Lisbon'],
  NL: ['Europe/Amsterdam'],
  BE: ['Europe/Brussels'],
  CH: ['Europe/Zurich'],
  AT: ['Europe/Vienna'],
  PL: ['Europe/Warsaw'],
  SE: ['Europe/Stockholm'],
  NO: ['Europe/Oslo'],
  DK: ['Europe/Copenhagen'],
  FI: ['Europe/Helsinki'],
  RU: ['Europe/Moscow','Asia/Yekaterinburg','Asia/Omsk','Asia/Krasnoyarsk','Asia/Irkutsk','Asia/Vladivostok'],
  UA: ['Europe/Kyiv'],
  TR: ['Europe/Istanbul'],
  SA: ['Asia/Riyadh'],
  AE: ['Asia/Dubai'],
  IL: ['Asia/Jerusalem'],
  IN: ['Asia/Kolkata'],
  PK: ['Asia/Karachi'],
  BD: ['Asia/Dhaka'],
  LK: ['Asia/Colombo'],
  NP: ['Asia/Kathmandu'],
  CN: ['Asia/Shanghai'],
  HK: ['Asia/Hong_Kong'],
  TW: ['Asia/Taipei'],
  JP: ['Asia/Tokyo'],
  KR: ['Asia/Seoul'],
  SG: ['Asia/Singapore'],
  MY: ['Asia/Kuala_Lumpur'],
  TH: ['Asia/Bangkok'],
  VN: ['Asia/Ho_Chi_Minh'],
  ID: ['Asia/Jakarta','Asia/Makassar','Asia/Jayapura'],
  PH: ['Asia/Manila'],
  AU: ['Australia/Sydney','Australia/Melbourne','Australia/Adelaide','Australia/Darwin','Australia/Brisbane','Australia/Perth'],
  NZ: ['Pacific/Auckland'],
  ZA: ['Africa/Johannesburg'],
  NG: ['Africa/Lagos'],
  EG: ['Africa/Cairo'],
  KE: ['Africa/Nairobi'],
  GH: ['Africa/Accra'],
};

// ── helpers ───────────────────────────────────────────────────────────────────
function parseHHMM(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function inBusinessHours(dt, startStr, endStr) {
  const mins = dt.hour * 60 + dt.minute;
  return mins >= parseHHMM(startStr) && mins < parseHHMM(endStr);
}

// Returns the next occurrence of HH:MM in the given zone (always in the future)
function nextWindowOpen(dt, startStr) {
  const [h, m] = startStr.split(':').map(Number);
  let candidate = dt.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  if (candidate <= dt) candidate = candidate.plus({ days: 1 });
  return candidate;
}

// ── route ─────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => { try {
  const { number, selectedZone } = req.body ?? {};

  if (!number || typeof number !== 'string' || !number.trim()) {
    return res.status(400).json({ error: 'Please provide a phone number.' });
  }

  // 1. Parse
  const parsed = parsePhoneNumberFromString(number.trim());
  if (!parsed?.isValid()) {
    return res.status(422).json({
      error:
        'Invalid or unrecognised phone number. ' +
        'Please enter the full number in international format with the country code. ' +
        'Examples: +1 415 555 2671 (US), +44 20 7946 0958 (UK), ' +
        '+63 2 8123 4567 (PH), +61 2 9374 4000 (AU).',
    });
  }

  const country         = parsed.country;
  const formattedNumber = parsed.formatInternational();

  // 2. Resolve candidate timezones (geo-carrier → country map)
  let candidateZones = [];
  if (geoTimezones) {
    try {
      const raw = await geoTimezones(parsed);
      if (Array.isArray(raw)) candidateZones = raw.filter(z => z?.includes('/'));
    } catch { /* ignore — fall through to country map */ }
  }
  if (!candidateZones.length && country && COUNTRY_TZ[country]) {
    candidateZones = COUNTRY_TZ[country];
  }

  if (!candidateZones.length) {
    return res.json({
      formattedNumber,
      country,
      candidateZones: [],
      selectedZone:   null,
      localTime:      null,
      verdict:        'unknown_timezone',
      error: `Could not determine a timezone for ${country ?? 'this number'}. Please select one manually.`,
    });
  }

  // 3. Pick zone — honour the agent's override if it's in the candidate list
  const zone = (selectedZone && candidateZones.includes(selectedZone))
    ? selectedZone
    : candidateZones[0];

  const nowInZone = DateTime.now().setZone(zone);
  const inWindow  = inBusinessHours(nowInZone, BUSINESS_START, BUSINESS_END);

  let verdict               = 'call_now';
  let callbackDueIso        = null; // UTC-anchored ISO for storage / agent display
  let callbackDueCustomerIso = null;
  let nextWindowIso         = null;

  if (!inWindow) {
    verdict = 'schedule';

    const callbackDue      = DateTime.now().plus({ hours: RETRY_HOURS, minutes: RETRY_MINUTES });
    callbackDueIso         = callbackDue.toISO();
    callbackDueCustomerIso = callbackDue.setZone(zone).toISO();

    // Always surface next 8am so agents are never told to call at 3am
    const next    = nextWindowOpen(nowInZone, BUSINESS_START);
    nextWindowIso = next.toISO();
  }

  res.json({
    formattedNumber,
    country,
    candidateZones,
    selectedZone:          zone,
    localTime:             nowInZone.toISO(),
    localTimeFormatted:    nowInZone.toFormat('cccc, LLL d HH:mm:ss ZZZZ'),
    verdict,
    businessStart:         BUSINESS_START,
    businessEnd:           BUSINESS_END,
    retryHours:            RETRY_HOURS,
    retryMinutes:          RETRY_MINUTES,
    callbackDueIso,
    callbackDueCustomerIso,
    nextWindowIso,
  });
} catch (e) { res.status(500).json({ error: e.message }); } });

module.exports = router;
