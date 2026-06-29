import { authHandler } from '@/lib/auth.js';
import * as queries from '@/lib/db/queries.js';
import { fetchEmployeeIdentity } from '@/lib/services/keka-profile.js';
import { toClientProfile } from '@/lib/client-dto.js';
import { jsonOk, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

/** Backend proxy for Keka GET /k/dashboard/api/context — slim encrypted profile only. */
export async function GET(request) {
  return authHandler(request, async ({ user, token, userInfo }) => {
    const subdomain = user.subdomain || userInfo?.subdomain;
    const profile = await fetchEmployeeIdentity(token, subdomain);

    let updated = user;
    if (profile) {
      updated =
        (await queries.updateUserProfile(user.keka_user_id, profile)) || user;
    }

    return withCors(jsonOk({ profile: toClientProfile(updated) }));
  });
}
