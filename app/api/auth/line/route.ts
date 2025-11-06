// app/api/auth/line/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: "idToken is required" }, { status: 400 });
    }
    const clientId = process.env.LINE_CHANNEL_ID;
    if (!clientId) {
      return NextResponse.json({ error: "LINE_CHANNEL_ID is not set" }, { status: 500 });
    }

    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: "LINE verify failed", detail: data }, { status: 401 });
    }

    const uid = `line:${data.sub}`;
    const customToken = await adminAuth.createCustomToken(uid, {
      name: data.name || "",
      picture: data.picture || "",
    });

    return NextResponse.json({ customToken });
  } catch (e: any) {
    return NextResponse.json({ error: "auth error", detail: String(e) }, { status: 500 });
  }
}
