// app/api/auth/line/route.ts
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "no idToken" }, { status: 400 });

    // LINEのIDトークン検証
    const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: process.env.LINE_CHANNEL_ID!, // ← LINE Login Channel ID
      }),
    });

    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok || !verifyJson.sub) {
      return NextResponse.json({ error: "line verify failed", detail: verifyJson }, { status: 401 });
    }

    // LINEのユーザーIDをFirebaseのuidとして使う
    const uid = `line:${verifyJson.sub}`; // 衝突回避のためprefix

    // 必要なら displayName/picture 等を custom claims ではなく users/{uid} で管理
    const customToken = await adminAuth.createCustomToken(uid);
    return NextResponse.json({ customToken });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}
