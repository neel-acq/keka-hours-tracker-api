import { NextResponse } from 'next/server';

export function jsonOk(data, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function jsonError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function withCors(response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export function handleOptions() {
  return withCors(new NextResponse(null, { status: 204 }));
}
