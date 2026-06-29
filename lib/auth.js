import * as queries from './db/queries.js';
import { decodeJwtPayload, extractUserInfo, mergeUserInfo } from './user-info.js';
import { fetchEmployeeIdentity } from './services/keka-profile.js';

export { decodeJwtPayload, extractUserInfo } from './user-info.js';

export function extractTokenExpiry(payload) {
  return payload?.exp ? new Date(payload.exp * 1000).toISOString() : null;
}

export function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

async function resolveUserInfo(token, payload) {
  let userInfo = extractUserInfo(payload);
  if (!userInfo) return null;

  const profile = await fetchEmployeeIdentity(token, userInfo.subdomain);
  return mergeUserInfo(userInfo, profile);
}

export async function requireAuth(request, { extensionVersion } = {}) {
  const token = getBearerToken(request);
  if (!token) {
    const err = new Error('Missing Authorization Bearer token');
    err.status = 401;
    throw err;
  }

  const payload = decodeJwtPayload(token);
  const userInfo = await resolveUserInfo(token, payload);
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
