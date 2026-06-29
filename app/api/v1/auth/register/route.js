import { authHandler } from '@/lib/auth.js';
import { jsonOk, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request) {
  return authHandler(request, async ({ user }) => {
    const body = await request.json().catch(() => ({}));
    return withCors(jsonOk({
      user: {
        id: user.id,
        keka_user_id: user.keka_user_id,
        email: user.email,
        display_name: user.display_name,
        company_name: user.company_name,
        subdomain: user.subdomain
      },
      extensionVersion: body.extensionVersion || null
    }));
  });
}
