import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: process.env.API_VERSION || '1',
    service: 'keka-hours-tracker-api'
  });
}
