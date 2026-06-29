import * as queries from './db/queries.js';

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

export function extractUserInfo(payload) {
  if (!payload) return null;
  const kekaUserId = payload.sub || payload.user_id || payload.userId;
  if (!kekaUserId) return null;
  return {
    keka_user_id: String(kekaUserId),
    email: payload.email || payload.unique_name || null,
    tenant_id: payload.tenant_id || payload.tenantId || null,
    subdomain: payload.subdomain || null,
    display_name: payload.name || payload.given_name || payload.display_name || null
  };
}

export function extractTokenExpiry(payload) {
  return payload?.exp ? new Date(payload.exp * 1000).toISOString() : null;
}

export function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

export async function requireAuth(request, { extensionVersion } = {}) {
  const token = getBearerToken(request);
  if (!token) {
    const err = new Error('Missing Authorization Bearer token');
    err.status = 401;
    throw err;
  }

  const payload = decodeJwtPayload(token);
  const userInfo = extractUserInfo(payload);
  if (!userInfo) {
    const err = new Error('Invalid Keka JWT');
    err.status = 401;
    throw err;
  }

  if (payload?.exp && payload.exp * 1000 < Date.now()) {
    const err = new Error('Keka token expired');
    err.status = 401;
    throw err;
  }

  const user = await queries.upsertUser({
    ...userInfo,
    extension_version: extensionVersion || null
  });

  await queries.saveToken(user.id, token, 'api-auth', extractTokenExpiry(payload));

  return { user, token, payload, userInfo };
}

export async function authHandler(request, handler) {
  try {
    const extVersion = request.headers.get('x-extension-version');
    const auth = await requireAuth(request, { extensionVersion: extVersion });
    const result = await handler(auth, request);
    return result;
  } catch (err) {
    const { jsonError, withCors } = await import('./http.js');
    return withCors(jsonError(err.message || 'Unauthorized', err.status || 401));
  }
}
