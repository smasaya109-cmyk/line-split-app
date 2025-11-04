"use client";

import liff from "@line/liff";

/** 参加用URL（/?group=...&invite=1）を生成 */
export function buildInviteUrl(groupId: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://line-split.vercel.app";
  const url = new URL(origin);
  url.searchParams.set("group", groupId);
  url.searchParams.set("invite", "1"); // 招待ゲート用フラグ
  return url.toString();
}

/** LINEのShare Target Pickerで招待（未対応端末はURLコピーにフォールバック） */
export async function inviteByLine(groupId: string, groupName: string) {
  const url = buildInviteUrl(groupId);
  await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
  await liff.ready;

  const text = `「${groupName}」に招待します！\n参加して割り勘しよう👇\n${url}`;

  if (typeof liff.isApiAvailable === "function" && liff.isApiAvailable("shareTargetPicker")) {
    await liff.shareTargetPicker([{ type: "text", text }]);
  } else {
    await navigator.clipboard.writeText(url);
    alert("共有未対応のため、招待URLをコピーしました。LINEトークに貼り付けて送ってください。");
  }
}
