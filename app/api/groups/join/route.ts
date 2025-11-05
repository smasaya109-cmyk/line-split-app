// app/api/groups/join/route.ts
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authz?.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });

    const { groupId, name } = await req.json();
    if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const groupRef = adminDb.collection("groups").doc(groupId);
    const snap = await groupRef.get();
    if (!snap.exists) return NextResponse.json({ error: "group not found" }, { status: 404 });

    // memberUids に自分を追加（重複は arrayUnion が防ぐ）
    await groupRef.set(
      { memberUids: FieldValue.arrayUnion(uid) },
      { merge: true }
    );

    // members/{uid} を作成/更新
    await groupRef.collection("members").doc(uid).set(
      {
        uid,
        name: name || "メンバー",
        joinedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "internal" }, { status: 500 });
  }
}
