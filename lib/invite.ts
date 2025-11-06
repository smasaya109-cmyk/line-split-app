// lib/invite.ts
export async function inviteByLine(groupId: string, groupName: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/?group=${encodeURIComponent(groupId)}&invite=1`;
  const text = `「${groupName}」割り勘グループに参加しよう！\n${url}`;

  const liff = (globalThis as any).liff;

  // LIFFのShare Target Pickerが使えるならそれを優先
  if (liff?.isApiAvailable?.("shareTargetPicker")) {
    try {
      await liff.shareTargetPicker([{ type: "text", text }]);
      return;
    } catch (_) {
      // noop → 他の手段にフォールバック
    }
  }

  // Web Share API
  if (navigator.share) {
    try {
      await navigator.share({ title: "割り勘グループに招待", text, url });
      return;
    } catch (_) {
      // noop
    }
  }

  // 何も使えない場合はクリップボード
  try {
    await navigator.clipboard.writeText(url);
    alert(`招待リンクをコピーしました:\n${url}`);
  } catch {
    alert(`このURLを共有してください:\n${url}`);
  }
}

