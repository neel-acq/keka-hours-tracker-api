import { createLogger } from './logger.js';
import * as queries from './db/queries.js';
import { decodeJwtPayload, extractUserInfo, mergeUserInfo } from './user-info.js';
import { fetchEmployeeIdentity } from './services/keka-profile.js';

const authLog = createLogger('[Auth]');

export { decodeJwtPayload, extractUserInfo } from './user-info.js';

export function extractTokenExpiry(payload) {
  return payload?.exp ? new Date(payload.exp * 1000).toISOString() : null;
}

export function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

function pickHeaderProfile(request) {
  const display_name = request.headers.get('x-keka-display-name');
  const company_name = request.headers.get('x-keka-company-name');
  const profile = {
    display_name: display_name?.trim() || null,
    company_name: company_name?.trim() || null
  };
  if (!profile.display_name && !profile.company_name) return null;
  return profile;
}

function mergeClientProfile(request, optionsProfile) {
  const fromHeaders = pickHeaderProfile(request);
  if (!fromHeaders && !optionsProfile) return undefined;
  return mergeUserInfo(fromHeaders || {}, optionsProfile || {});
}

async function resolveUserInfo(token, payload, clientProfile) {
  let userInfo = extractUserInfo(payload);
  if (!userInfo) return null;

  const profile = await fetchEmployeeIdentity(token, userInfo.subdomain);
  userInfo = mergeUserInfo(userInfo, profile);
  if (clientProfile) {
    userInfo = mergeUserInfo(userInfo, clientProfile);
    authLog.log('profile from client', clientProfile);
  }
  authLog.log('resolved user', {
    keka_user_id: userInfo.keka_user_id,
    display_name: userInfo.display_name,
    company_name: userInfo.company_name
  });
  return userInfo;
}

export async function requireAuth(request, { extensionVersion, clientProfile } = {}) {
  const token = getBearerToken(request);
  if (!token) {
    const err = new Error('Missing Authorization Bearer token');
    err.status = 401;
    throw err;
  }

  const payload = decodeJwtPayload(token);
  const mergedProfile = mergeClientProfile(request, clientProfile);
  const userInfo = await resolveUserInfo(token, payload, mergedProfile);
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

  let finalUser = user;
  if (
    mergedProfile?.display_name ||
    mergedProfile?.company_name ||
    userInfo.display_name ||
    userInfo.company_name
  ) {
    finalUser =
      (await queries.updateUserProfile(user.keka_user_id, {
        display_name: userInfo.display_name,
        company_name: userInfo.company_name
      })) || user;
  }

  await queries.saveToken(finalUser.id, token, 'api-auth', extractTokenExpiry(payload));

  return { user: finalUser, token, payload, userInfo };
}

export async function authHandler(request, handler, options = {}) {
  try {
    const extVersion =
      request.headers.get('x-extension-version') || options.extensionVersion;
    const auth = await requireAuth(request, {
      extensionVersion: extVersion,
      clientProfile: options.clientProfile
    });
    const result = await handler(auth, request);
    return result;
  } catch (err) {
    const { jsonError, withCors } = await import('./http.js');
    authLog.warn(err.message || 'Unauthorized', err.status || 401);
    return withCors(jsonError(err.message || 'Unauthorized', err.status || 401));
  }
}
