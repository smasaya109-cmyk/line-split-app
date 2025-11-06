// app/api/firebaseCustomToken/route.ts
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// LINEのIDトークンを検証する（公式Verify API）
async function verifyLineIdToken(idToken: string, clientId: string) {
  const url = new URL("https://api.line.me/oauth2/v2.1/verify");
  url.searchParams.set("id_token", idToken);
  url.searchParams.set("client_id", clientId);

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error("LINE verify failed");
  const data = await res.json();
  // data.sub = ユーザー固有のID
  if (!data.sub) throw new Error("No sub in LINE verify");
  return data; // { sub, name, picture, ... }
}

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "missing idToken" }, { status: 400 });

    const clientId = process.env.LINE_CHANNEL_ID!;
    if (!clientId) return NextResponse.json({ error: "missing LINE_CHANNEL_ID" }, { status: 500 });

    const payload = await verifyLineIdToken(idToken, clientId);
    const lineUid = `line:${payload.sub}`; // FirebaseのUIDにする

    // 必要ならカスタムクレームも付与可
    const customToken = await adminAuth.createCustomToken(lineUid, {
      provider: "line",
    });

    return NextResponse.json({ token: customToken });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "internal error" }, { status: 500 });
  }
}
