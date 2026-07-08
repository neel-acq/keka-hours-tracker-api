import { NextResponse } from 'next/server';
import * as queries from '@/lib/db/queries.js';
import { jsonOk, jsonError, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

async function handleReset(request) {
  try {
    const adminSecret = process.env.ADMIN_SECRET;
    if (adminSecret) {
      const providedSecret =
        request.headers.get('x-admin-secret') ||
        request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (providedSecret !== adminSecret) {
        return withCors(jsonError('Unauthorized: Invalid admin secret', 401));
      }
    }

    await queries.clearAllData();
    return withCors(
      jsonOk({
        message: 'All application data removed successfully from all tables'
      })
    );
  } catch (err) {
    return withCors(jsonError(err.message || 'Failed to clear data', 500));
  }
}

export async function POST(request) {
  return handleReset(request);
}

export async function DELETE(request) {
  return handleReset(request);
}
