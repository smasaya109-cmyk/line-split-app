// app/api/groups/join/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth, FieldValue, adminFs } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { groupId, displayName } = await req.json();
    if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

    const groupRef = adminDb.collection("groups").doc(groupId);
    await adminDb.runTransaction(async (tx) => {
      const gs = await tx.get(groupRef);
      if (!gs.exists) throw new Error("group not found");

      // visibleTo に uid を追加
      tx.update(groupRef, { visibleTo: FieldValue.arrayUnion(uid) });

      // members/{uid} がなければ作成（id=uidにしておくと参照しやすい）
      const memberRef = groupRef.collection("members").doc(uid);
      const ms = await tx.get(memberRef);
      if (!ms.exists) {
        tx.set(memberRef, {
          name: displayName || "LINEユーザー",
          uid,
          joinedAt: adminFs.FieldValue.serverTimestamp(),
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "join error", detail: String(e) }, { status: 500 });
  }
}
