import { authHandler } from '@/lib/auth.js';
import * as queries from '@/lib/db/queries.js';
import { jsonOk, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

function pickProfileField(body, ...keys) {
  for (const key of keys) {
    const value = body?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const displayName = pickProfileField(body, 'display_name', 'displayName');
  const companyName = pickProfileField(body, 'company_name', 'companyName');

  return authHandler(
    request,
    async ({ user, userInfo }) => {
      let updated = user;
      if (displayName || companyName) {
        updated =
          (await queries.updateUserProfile(user.keka_user_id, {
            display_name: displayName,
            company_name: companyName
          })) || user;
      } else if (userInfo?.display_name || userInfo?.company_name) {
        updated =
          (await queries.updateUserProfile(user.keka_user_id, {
            display_name: userInfo.display_name,
            company_name: userInfo.company_name
          })) || user;
      }

      return withCors(
        jsonOk({
          user: {
            id: updated.id,
            keka_user_id: updated.keka_user_id,
            email: updated.email,
            display_name: updated.display_name,
            company_name: updated.company_name,
            subdomain: updated.subdomain
          }
        })
      );
    },
    {
      clientProfile:
        displayName || companyName
          ? { display_name: displayName, company_name: companyName }
          : undefined
    }
  );
}
