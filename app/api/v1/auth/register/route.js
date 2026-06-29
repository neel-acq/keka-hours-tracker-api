import { authHandler } from '@/lib/auth.js';
import * as queries from '@/lib/db/queries.js';
import { toClientProfile } from '@/lib/client-dto.js';
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
  const clientProfile =
    displayName || companyName
      ? { display_name: displayName, company_name: companyName }
      : undefined;

  return authHandler(
    request,
    async ({ user, userInfo }) => {
      let updated = user;
      if (displayName || companyName || userInfo?.display_name || userInfo?.company_name) {
        updated =
          (await queries.updateUserProfile(user.keka_user_id, {
            display_name: displayName || userInfo?.display_name,
            company_name: companyName || userInfo?.company_name
          })) || user;
      }

      return withCors(
        jsonOk({
          profile: toClientProfile(updated)
        })
      );
    },
    {
      extensionVersion: body.extensionVersion || null,
      clientProfile
    }
  );
}
