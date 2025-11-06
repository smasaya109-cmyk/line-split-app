// lib/invite.ts
export async function inviteByLine(groupId: string, groupName: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/?group=${encodeURIComponent(groupId)}&invite=1`;
  const text = `「${groupName}」割り勘グループに参加しよう！\n${url}`;

  const liff = (globalThis as any).liff;

  if (liff?.isApiAvailable?.("shareTargetPicker")) {
    try {
      await liff.shareTargetPicker([{ type: "text", text }]);
      return;
    } catch {
      /* fallback */
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: "割り勘グループに招待", text, url });
      return;
    } catch {
      /* fallback */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    alert(`招待リンクをコピーしました:\n${url}`);
  } catch {
    alert(`このURLを共有してください:\n${url}`);
  }
}

