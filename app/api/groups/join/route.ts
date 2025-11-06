// app/api/groups/join/route.ts
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "no auth" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid; // "line:xxxxxxxx"

    const { groupId, displayName } = await req.json();
    if (!groupId) return NextResponse.json({ error: "no groupId" }, { status: 400 });

    const groupRef = adminDb.collection("groups").doc(groupId);
    const snap = await groupRef.get();
    if (!snap.exists) return NextResponse.json({ error: "not found" }, { status: 404 });

    // すでに見えていればOK（冪等化）
    const data = snap.data()!;
    const visibleTo: string[] = Array.isArray(data.visibleTo) ? data.visibleTo : [];
    if (!visibleTo.includes(uid)) {
      visibleTo.push(uid);
      await groupRef.update({ visibleTo });
    }

    // メンバーサブコレクションに自分を追加（冪等）
    const memberRef = groupRef.collection("members").doc(uid);
    const m = await memberRef.get();
    if (!m.exists) {
      await memberRef.set({
        name: displayName || "LINEユーザー",
        joinedAt: new Date(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}
