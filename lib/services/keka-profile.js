function kekaBaseUrl(subdomain) {
  const slug = subdomain || 'acquaint';
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
  const root = data?.data;
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
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      const data = await response.json();
      const parsed = parseContextPayload(data);
      if (parsed) return parsed;
    }
  } catch {
    // fall through
  }

  return null;
}
