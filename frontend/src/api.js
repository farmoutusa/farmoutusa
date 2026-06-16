// Base URL: empty string = same origin (works with Vite proxy in dev and
// Express static serving in prod). Override with VITE_API_URL for
// separate-deployment scenarios (e.g. frontend on Netlify, backend on Render).
const BASE = import.meta.env.VITE_API_URL ?? '';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export const api = {
  check: (number, selectedZone) => req('POST', '/api/check', { number, selectedZone }),
};
