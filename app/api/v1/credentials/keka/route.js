import { authHandler } from '@/lib/auth.js';
import * as queries from '@/lib/db/queries.js';
import { extractTokenExpiry, decodeJwtPayload } from '@/lib/auth.js';
import { jsonOk, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request) {
  return authHandler(request, async ({ user, token }) => {
    const body = await request.json().catch(() => ({}));
    const jwtToken = body.token || token;
    const payload = decodeJwtPayload(jwtToken);
    const saved = await queries.saveToken(
      user.id,
      jwtToken,
      body.source || 'extension',
      extractTokenExpiry(payload)
    );
    return withCors(jsonOk({ saved: !!saved }));
  });
}
