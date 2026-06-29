import { authHandler } from '@/lib/auth.js';
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
    async ({ user }) =>
      withCors(
        jsonOk({
          user: {
            id: user.id,
            keka_user_id: user.keka_user_id,
            email: user.email,
            display_name: user.display_name,
            company_name: user.company_name,
            subdomain: user.subdomain
          },
          extensionVersion: body.extensionVersion || null
        })
      ),
    {
      extensionVersion: body.extensionVersion || null,
      clientProfile
    }
  );
}
