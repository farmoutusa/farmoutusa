import { parsePhoneNumber } from 'libphonenumber-js';

const BUSINESS_START = 8;   // 08:00
const BUSINESS_END   = 19;  // 19:00
const RETRY_H = 3;
const RETRY_M = 15;

const COUNTRY_ZONES = {
  // Americas
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
  CA: ['America/Toronto', 'America/Winnipeg', 'America/Edmonton', 'America/Vancouver'],
  MX: ['America/Mexico_City', 'America/Tijuana'],
  BR: ['America/Sao_Paulo', 'America/Fortaleza', 'America/Manaus', 'America/Belem'],
  AR: ['America/Argentina/Buenos_Aires'],
  CL: ['America/Santiago'],
  CO: ['America/Bogota'],
  PE: ['America/Lima'],
  VE: ['America/Caracas'],
  EC: ['America/Guayaquil'],
  UY: ['America/Montevideo'],
  PY: ['America/Asuncion'],
  BO: ['America/La_Paz'],
  // Europe
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
  RO: ['Europe/Bucharest'],
  HU: ['Europe/Budapest'],
  CZ: ['Europe/Prague'],
  SE: ['Europe/Stockholm'],
  NO: ['Europe/Oslo'],
  DK: ['Europe/Copenhagen'],
  FI: ['Europe/Helsinki'],
  GR: ['Europe/Athens'],
  TR: ['Europe/Istanbul'],
  UA: ['Europe/Kyiv'],
  RU: ['Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk', 'Asia/Irkutsk', 'Asia/Vladivostok'],
  // Asia-Pacific
  CN: ['Asia/Shanghai'],
  JP: ['Asia/Tokyo'],
  KR: ['Asia/Seoul'],
  IN: ['Asia/Kolkata'],
  PK: ['Asia/Karachi'],
  BD: ['Asia/Dhaka'],
  LK: ['Asia/Colombo'],
  NP: ['Asia/Kathmandu'],
  TH: ['Asia/Bangkok'],
  VN: ['Asia/Ho_Chi_Minh'],
  MY: ['Asia/Kuala_Lumpur'],
  SG: ['Asia/Singapore'],
  PH: ['Asia/Manila'],
  ID: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'],
  TW: ['Asia/Taipei'],
  HK: ['Asia/Hong_Kong'],
  MO: ['Asia/Macau'],
  AU: ['Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Australia/Darwin'],
  NZ: ['Pacific/Auckland'],
  FJ: ['Pacific/Fiji'],
  // Middle East
  SA: ['Asia/Riyadh'],
  AE: ['Asia/Dubai'],
  IL: ['Asia/Jerusalem'],
  IQ: ['Asia/Baghdad'],
  IR: ['Asia/Tehran'],
  KW: ['Asia/Kuwait'],
  QA: ['Asia/Qatar'],
  BH: ['Asia/Bahrain'],
  OM: ['Asia/Muscat'],
  JO: ['Asia/Amman'],
  LB: ['Asia/Beirut'],
  // Africa
  ZA: ['Africa/Johannesburg'],
  NG: ['Africa/Lagos'],
  EG: ['Africa/Cairo'],
  KE: ['Africa/Nairobi'],
  ET: ['Africa/Addis_Ababa'],
  GH: ['Africa/Accra'],
  TZ: ['Africa/Dar_es_Salaam'],
  UG: ['Africa/Kampala'],
  MA: ['Africa/Casablanca'],
  DZ: ['Africa/Algiers'],
  TN: ['Africa/Tunis'],
  SD: ['Africa/Khartoum'],
};

function localMinAt(zone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(date);
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  return h * 60 + m;
}

function nextWindowIso(zone) {
  const now    = new Date();
  const curMin = localMinAt(zone, now);
  const start  = BUSINESS_START * 60;
  const until  = curMin < start ? start - curMin : 24 * 60 - curMin + start;
  return new Date(now.getTime() + until * 60_000).toISOString();
}

export function checkNumber(rawNumber, selectedZone = null) {
  if (!rawNumber?.trim()) throw new Error('Enter a phone number.');

  let parsed;
  try { parsed = parsePhoneNumber(rawNumber.trim()); } catch { parsed = null; }
  if (!parsed?.isValid()) {
    throw new Error('Invalid number — include the country code, e.g. +63 2 8123 4567');
  }

  const country = parsed.country;
  const zones   = COUNTRY_ZONES[country];

  if (!zones) return {
    verdict: 'unknown_timezone',
    formattedNumber: parsed.formatInternational(),
    country,
    error: `No timezone data for country code: ${country}`,
  };

  const candidateZones = zones;
  const zone = (selectedZone && candidateZones.includes(selectedZone))
    ? selectedZone
    : candidateZones[0];

  const now      = new Date();
  const localMin = localMinAt(zone, now);
  const startMin = BUSINESS_START * 60;
  const endMin   = BUSINESS_END   * 60;

  const base = {
    formattedNumber: parsed.formatInternational(),
    country,
    candidateZones,
    selectedZone: zone,
    localTime: now.toISOString(),
    businessStart: `${String(BUSINESS_START).padStart(2, '0')}:00`,
    businessEnd:   `${String(BUSINESS_END).padStart(2, '0')}:00`,
    retryHours: RETRY_H,
    retryMinutes: RETRY_M,
  };

  if (localMin >= startMin && localMin < endMin) {
    return { ...base, verdict: 'call_now' };
  }

  const retryTotalMin = RETRY_H * 60 + RETRY_M;
  const callbackDue   = new Date(now.getTime() + retryTotalMin * 60_000);
  const cbLocalMin    = localMinAt(zone, callbackDue);
  const cbInWindow    = cbLocalMin >= startMin && cbLocalMin < endMin;

  return {
    ...base,
    verdict: 'do_not_call',
    callbackDueIso:         cbInWindow ? callbackDue.toISOString() : null,
    callbackDueCustomerIso: cbInWindow ? callbackDue.toISOString() : null,
    nextWindowIso: nextWindowIso(zone),
  };
}
