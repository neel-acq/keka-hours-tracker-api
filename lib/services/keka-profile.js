import { createLogger } from '../logger.js';
import { normalizeKekaSubdomain } from '../user-info.js';

const profileLog = createLogger('[KekaProfile]');

function kekaBaseUrl(subdomain) {
  const slug = normalizeKekaSubdomain(subdomain) || 'acquaint';
  return `https://${slug}.keka.com`;
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Parse GET /k/dashboard/api/context response */
export function parseContextPayload(data) {
  if (!data || typeof data !== 'object') return null;

  const root =
    data.data && typeof data.data === 'object'
      ? data.data
      : data.employee || data.org
        ? data
        : null;
  if (!root || typeof root !== 'object') return null;

  const displayName = pickString(
    root.employee?.displayName,
    root.employee?.display_name,
    root.employee?.name
  );

  const companyName = pickString(
    root.org?.name,
    root.org?.shortName,
    root.org?.short_name
  );

  if (!displayName && !companyName) return null;

  return {
    display_name: displayName,
    company_name: companyName
  };
}

export async function fetchEmployeeIdentity(token, subdomain) {
  if (!token) return null;

  const base = kekaBaseUrl(subdomain);
  const contextPath = '/k/dashboard/api/context';

  try {
    const response = await fetch(`${base}${contextPath}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Referer: `${base}/`
      }
    });
    if (response.ok) {
      const data = await response.json();
      const parsed = parseContextPayload(data);
      if (parsed) {
        profileLog.log('context profile', parsed);
        return parsed;
      }
      profileLog.warn('context response missing profile fields', base);
    } else {
      profileLog.warn('context fetch failed', base, response.status);
    }
  } catch (err) {
    profileLog.warn('context fetch error', base, err.message);
  }

  return null;
}
