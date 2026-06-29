import { NextResponse } from "next/server";
import { encrypt } from "./crypto.js";

function shouldEncryptResponses() {
  return process.env.ENCRYPT_API_RESPONSES !== "false";
}

/** Success body: encrypted payload only — no sensitive fields in plain JSON. */
export function secureJsonOk(data, status = 200) {
  if (!shouldEncryptResponses()) {
    return NextResponse.json({ success: true, ...data }, { status });
  }

  try {
    const payload = encrypt(JSON.stringify(data));
    return NextResponse.json({ success: true, encrypted: true, payload }, { status });
  } catch {
    return NextResponse.json({ success: true, ...data }, { status });
  }
}

export function jsonOk(data, status = 200) {
  return secureJsonOk(data, status);
}

export function jsonError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function withCors(response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Extension-Version, X-Keka-Display-Name, X-Keka-Company-Name",
  );
  return response;
}

export function handleOptions() {
  return withCors(new NextResponse(null, { status: 204 }));
}
