function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function extractSubdomainFromIss(iss) {
  const slug = normalizeKekaSubdomain(iss);
  if (!slug || slug === 'app') return null;
  return slug;
}

export function normalizeKekaSubdomain(value) {
  if (!value || typeof value !== 'string') return null;

  let s = value.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const fullHost = s.match(/^([a-z0-9-]+)\.keka\.com$/i);
  if (fullHost) return fullHost[1];

  if (/^[a-z0-9-]+$/i.test(s)) return s;

  const embedded = s.match(/([a-z0-9-]+)\.keka\.com/i);
  if (embedded) return embedded[1];

  return null;
}

export function extractUserInfo(payload) {
  if (!payload) return null;

  const kekaUserId = payload.sub || payload.user_id || payload.userId;
  if (!kekaUserId) return null;

  const subdomain = normalizeKekaSubdomain(
    pickString(
      payload.subdomain,
      payload.tenant_subdomain,
      payload.tenantSubdomain,
      extractSubdomainFromIss(payload.iss)
    )
  );

  const firstName = pickString(payload.given_name, payload.firstName, payload.first_name);
  const lastName = pickString(payload.family_name, payload.lastName, payload.last_name);
  const displayName = pickString(
    payload.name,
    payload.display_name,
    payload.displayName,
    payload.employee_name,
    payload.employeeName,
    [firstName, lastName].filter(Boolean).join(' ')
  );

  const companyName = pickString(
    payload.company_name,
    payload.companyName,
    payload.tenant_name,
    payload.tenantName,
    payload.organization_name,
    payload.organizationName,
    payload.org_name,
    payload.employer_name,
    payload.employerName,
    payload.company,
    payload.organization
  );

  return {
    keka_user_id: String(kekaUserId),
    email: pickString(payload.email, payload.unique_name, payload.upn),
    tenant_id: pickString(payload.tenant_id, payload.tenantId),
    subdomain,
    display_name: displayName,
    company_name: companyName
  };
}

export function mergeUserInfo(base, extra) {
  if (!extra) return base;
  return {
    ...base,
    display_name: pickString(extra.display_name, base.display_name),
    company_name: pickString(extra.company_name, base.company_name),
    email: pickString(extra.email, base.email),
    subdomain: normalizeKekaSubdomain(pickString(extra.subdomain, base.subdomain)),
    tenant_id: pickString(extra.tenant_id, base.tenant_id)
  };
}
