import { parsePhoneNumber } from 'libphonenumber-js';

const BUSINESS_START = 8;
const BUSINESS_END   = 19;
const RETRY_H = 3;
const RETRY_M = 15;

// US + Canada area code → IANA timezone (first 3 digits of national number)
const NANP = {
  // ── EASTERN (America/New_York) ──────────────────────────────────────────
  // Connecticut
  '203':'America/New_York','475':'America/New_York','860':'America/New_York','959':'America/New_York',
  // DC + Maryland
  '202':'America/New_York','240':'America/New_York','301':'America/New_York',
  '410':'America/New_York','443':'America/New_York','667':'America/New_York',
  // Delaware
  '302':'America/New_York',
  // Florida (east + south; 850 = panhandle → Central)
  '239':'America/New_York','305':'America/New_York','321':'America/New_York','352':'America/New_York',
  '386':'America/New_York','407':'America/New_York','448':'America/New_York','561':'America/New_York',
  '727':'America/New_York','754':'America/New_York','772':'America/New_York','786':'America/New_York',
  '813':'America/New_York','863':'America/New_York','904':'America/New_York',
  '941':'America/New_York','954':'America/New_York',
  // Georgia
  '229':'America/New_York','404':'America/New_York','470':'America/New_York','478':'America/New_York',
  '678':'America/New_York','706':'America/New_York','762':'America/New_York','770':'America/New_York',
  '912':'America/New_York','943':'America/New_York',
  // Indiana (most)
  '219':'America/New_York','260':'America/New_York','317':'America/New_York','463':'America/New_York',
  '574':'America/New_York','765':'America/New_York','812':'America/New_York','930':'America/New_York',
  // Kentucky (Eastern)
  '502':'America/New_York','606':'America/New_York','859':'America/New_York',
  // Maine
  '207':'America/New_York',
  // Massachusetts
  '339':'America/New_York','351':'America/New_York','413':'America/New_York','508':'America/New_York',
  '617':'America/New_York','774':'America/New_York','781':'America/New_York',
  '857':'America/New_York','978':'America/New_York',
  // Michigan (most; 906 Upper Peninsula → Central)
  '231':'America/New_York','248':'America/New_York','269':'America/New_York','313':'America/New_York',
  '517':'America/New_York','586':'America/New_York','616':'America/New_York','679':'America/New_York',
  '734':'America/New_York','810':'America/New_York','947':'America/New_York','989':'America/New_York',
  // New Hampshire
  '603':'America/New_York',
  // New Jersey
  '201':'America/New_York','551':'America/New_York','609':'America/New_York','640':'America/New_York',
  '732':'America/New_York','848':'America/New_York','856':'America/New_York','862':'America/New_York',
  '908':'America/New_York','973':'America/New_York',
  // New York
  '212':'America/New_York','315':'America/New_York','332':'America/New_York','347':'America/New_York',
  '363':'America/New_York','516':'America/New_York','518':'America/New_York','585':'America/New_York',
  '607':'America/New_York','631':'America/New_York','646':'America/New_York','680':'America/New_York',
  '716':'America/New_York','718':'America/New_York','838':'America/New_York','845':'America/New_York',
  '914':'America/New_York','917':'America/New_York','929':'America/New_York','934':'America/New_York',
  // North Carolina
  '252':'America/New_York','336':'America/New_York','704':'America/New_York','743':'America/New_York',
  '828':'America/New_York','910':'America/New_York','919':'America/New_York',
  '980':'America/New_York','984':'America/New_York',
  // Ohio
  '216':'America/New_York','220':'America/New_York','234':'America/New_York','283':'America/New_York',
  '330':'America/New_York','380':'America/New_York','419':'America/New_York','440':'America/New_York',
  '513':'America/New_York','567':'America/New_York','614':'America/New_York',
  '740':'America/New_York','937':'America/New_York',
  // Pennsylvania
  '215':'America/New_York','223':'America/New_York','267':'America/New_York','272':'America/New_York',
  '412':'America/New_York','445':'America/New_York','484':'America/New_York','570':'America/New_York',
  '610':'America/New_York','717':'America/New_York','724':'America/New_York','814':'America/New_York',
  '835':'America/New_York','878':'America/New_York',
  // Rhode Island
  '401':'America/New_York',
  // South Carolina
  '803':'America/New_York','839':'America/New_York','843':'America/New_York',
  '854':'America/New_York','864':'America/New_York',
  // Tennessee Eastern
  '423':'America/New_York','865':'America/New_York',
  // Vermont
  '802':'America/New_York',
  // Virginia
  '276':'America/New_York','434':'America/New_York','540':'America/New_York','571':'America/New_York',
  '703':'America/New_York','757':'America/New_York','804':'America/New_York',
  // West Virginia
  '304':'America/New_York','681':'America/New_York',
  // Canada Eastern (Ontario + Quebec)
  '226':'America/New_York','249':'America/New_York','289':'America/New_York','343':'America/New_York',
  '365':'America/New_York','416':'America/New_York','418':'America/New_York','437':'America/New_York',
  '438':'America/New_York','450':'America/New_York','514':'America/New_York','519':'America/New_York',
  '548':'America/New_York','579':'America/New_York','581':'America/New_York','613':'America/New_York',
  '647':'America/New_York','705':'America/New_York','819':'America/New_York',
  '873':'America/New_York','905':'America/New_York',
  // Canada Atlantic (Nova Scotia, NB, PEI — closest to Halifax)
  '506':'America/Halifax','782':'America/Halifax','902':'America/Halifax',

  // ── CENTRAL (America/Chicago) ────────────────────────────────────────────
  // Alabama
  '205':'America/Chicago','251':'America/Chicago','256':'America/Chicago',
  '334':'America/Chicago','659':'America/Chicago','938':'America/Chicago',
  // Arkansas
  '479':'America/Chicago','501':'America/Chicago','870':'America/Chicago',
  // Florida panhandle
  '850':'America/Chicago',
  // Illinois
  '217':'America/Chicago','224':'America/Chicago','309':'America/Chicago','312':'America/Chicago',
  '331':'America/Chicago','447':'America/Chicago','464':'America/Chicago','618':'America/Chicago',
  '630':'America/Chicago','708':'America/Chicago','730':'America/Chicago','773':'America/Chicago',
  '779':'America/Chicago','815':'America/Chicago','847':'America/Chicago','872':'America/Chicago',
  // Iowa
  '319':'America/Chicago','515':'America/Chicago','563':'America/Chicago',
  '641':'America/Chicago','712':'America/Chicago',
  // Kansas
  '316':'America/Chicago','620':'America/Chicago','785':'America/Chicago','913':'America/Chicago',
  // Kentucky Western
  '270':'America/Chicago','364':'America/Chicago',
  // Louisiana
  '225':'America/Chicago','318':'America/Chicago','337':'America/Chicago',
  '504':'America/Chicago','985':'America/Chicago',
  // Michigan Upper Peninsula
  '906':'America/Chicago',
  // Minnesota
  '218':'America/Chicago','320':'America/Chicago','507':'America/Chicago','612':'America/Chicago',
  '651':'America/Chicago','763':'America/Chicago','952':'America/Chicago',
  // Mississippi
  '228':'America/Chicago','601':'America/Chicago','662':'America/Chicago','769':'America/Chicago',
  // Missouri
  '314':'America/Chicago','417':'America/Chicago','573':'America/Chicago',
  '636':'America/Chicago','660':'America/Chicago','816':'America/Chicago',
  // Nebraska
  '308':'America/Chicago','402':'America/Chicago','531':'America/Chicago',
  // North Dakota
  '701':'America/Chicago',
  // Oklahoma
  '405':'America/Chicago','539':'America/Chicago','580':'America/Chicago','918':'America/Chicago',
  // South Dakota
  '605':'America/Chicago',
  // Tennessee Central/West
  '615':'America/Chicago','629':'America/Chicago','731':'America/Chicago',
  '901':'America/Chicago','931':'America/Chicago',
  // Texas (most)
  '210':'America/Chicago','214':'America/Chicago','254':'America/Chicago','281':'America/Chicago',
  '325':'America/Chicago','346':'America/Chicago','361':'America/Chicago','409':'America/Chicago',
  '430':'America/Chicago','469':'America/Chicago','512':'America/Chicago','682':'America/Chicago',
  '713':'America/Chicago','726':'America/Chicago','737':'America/Chicago','806':'America/Chicago',
  '817':'America/Chicago','830':'America/Chicago','832':'America/Chicago','903':'America/Chicago',
  '936':'America/Chicago','940':'America/Chicago','945':'America/Chicago',
  '956':'America/Chicago','972':'America/Chicago','979':'America/Chicago',
  // Wisconsin
  '262':'America/Chicago','414':'America/Chicago','534':'America/Chicago',
  '608':'America/Chicago','715':'America/Chicago','920':'America/Chicago',
  // Canada Central (Manitoba)
  '204':'America/Chicago','431':'America/Chicago',
  // Canada Saskatchewan (Central, no DST)
  '306':'America/Regina','639':'America/Regina',

  // ── MOUNTAIN (America/Denver) ────────────────────────────────────────────
  // Colorado
  '303':'America/Denver','719':'America/Denver','720':'America/Denver','970':'America/Denver',
  // Idaho
  '208':'America/Denver','986':'America/Denver',
  // Montana
  '406':'America/Denver',
  // New Mexico
  '505':'America/Denver','575':'America/Denver',
  // Texas El Paso
  '432':'America/Denver','915':'America/Denver',
  // Utah
  '385':'America/Denver','435':'America/Denver','801':'America/Denver',
  // Wyoming
  '307':'America/Denver',
  // Canada Alberta
  '403':'America/Denver','587':'America/Denver','780':'America/Denver','825':'America/Denver',

  // ── ARIZONA — Mountain, no DST (America/Phoenix) ─────────────────────────
  '480':'America/Phoenix','520':'America/Phoenix','602':'America/Phoenix',
  '623':'America/Phoenix','928':'America/Phoenix',

  // ── PACIFIC (America/Los_Angeles) ────────────────────────────────────────
  // California
  '209':'America/Los_Angeles','213':'America/Los_Angeles','279':'America/Los_Angeles',
  '310':'America/Los_Angeles','323':'America/Los_Angeles','341':'America/Los_Angeles',
  '369':'America/Los_Angeles','408':'America/Los_Angeles','415':'America/Los_Angeles',
  '424':'America/Los_Angeles','442':'America/Los_Angeles','510':'America/Los_Angeles',
  '530':'America/Los_Angeles','559':'America/Los_Angeles','562':'America/Los_Angeles',
  '619':'America/Los_Angeles','626':'America/Los_Angeles','628':'America/Los_Angeles',
  '650':'America/Los_Angeles','657':'America/Los_Angeles','661':'America/Los_Angeles',
  '669':'America/Los_Angeles','707':'America/Los_Angeles','714':'America/Los_Angeles',
  '747':'America/Los_Angeles','760':'America/Los_Angeles','764':'America/Los_Angeles',
  '805':'America/Los_Angeles','818':'America/Los_Angeles','820':'America/Los_Angeles',
  '831':'America/Los_Angeles','858':'America/Los_Angeles','909':'America/Los_Angeles',
  '916':'America/Los_Angeles','925':'America/Los_Angeles','949':'America/Los_Angeles',
  '951':'America/Los_Angeles',
  // Nevada
  '702':'America/Los_Angeles','725':'America/Los_Angeles','775':'America/Los_Angeles',
  // Oregon
  '458':'America/Los_Angeles','503':'America/Los_Angeles','541':'America/Los_Angeles',
  '971':'America/Los_Angeles',
  // Washington state
  '206':'America/Los_Angeles','253':'America/Los_Angeles','360':'America/Los_Angeles',
  '425':'America/Los_Angeles','509':'America/Los_Angeles','564':'America/Los_Angeles',
  // Canada BC
  '236':'America/Los_Angeles','250':'America/Los_Angeles','604':'America/Los_Angeles',
  '672':'America/Los_Angeles','778':'America/Los_Angeles',

  // ── ALASKA (America/Anchorage) ────────────────────────────────────────────
  '907':'America/Anchorage',

  // ── HAWAII (Pacific/Honolulu) ─────────────────────────────────────────────
  '808':'Pacific/Honolulu',
};

// Country-level fallback for non-NANP countries
const COUNTRY_ZONES = {
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

function normalize(raw) {
  let n = raw.trim();
  if (n.startsWith('00'))  return '+' + n.slice(2);
  if (n.startsWith('011')) return '+' + n.slice(3);
  if (!n.startsWith('+'))  return '+' + n;
  return n;
}

export function checkNumber(rawNumber, selectedZone = null) {
  if (!rawNumber?.trim()) throw new Error('Enter a phone number.');

  const normalized = normalize(rawNumber);
  let parsed;
  try { parsed = parsePhoneNumber(normalized); } catch { parsed = null; }
  if (!parsed?.isValid()) {
    throw new Error('Invalid number — include the country code, e.g. 63 2 8123 4567 or +63 2 8123 4567');
  }

  const country = parsed.country;

  // For NANP (+1) numbers, look up by area code for precise single-zone result
  let zones = null;
  let autoDetected = false;
  if (country === 'US' || country === 'CA') {
    const ac  = parsed.nationalNumber.slice(0, 3);
    const hit = NANP[ac];
    if (hit) { zones = [hit]; autoDetected = true; }
  }

  // Fall back to country-level map
  if (!zones) zones = COUNTRY_ZONES[country] ?? null;

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
    autoDetected,
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
