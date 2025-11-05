"use client";

/**
 * LIFFを確実に使える状態にする。
 * - SDK未読込なら動的ロード
 * - init未実行でも初期化
 */
async function ensureLiff(): Promise<any> {
  if (typeof window === "undefined") throw new Error("No window");
  const w = window as any;

  // SDKを動的ロード
  if (!w.liff) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load LIFF SDK"));
      document.body.appendChild(s);
    });
  }
  const liff = w.liff;

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) throw new Error("NEXT_PUBLIC_LIFF_ID is missing");

  // 2回目以降のinitもOK（LIFF側が握りつぶす）
  await liff.init({ liffId });
  await liff.ready;

  return liff;
}

/** 参加用URL（/?group=...&invite=1）を生成 */
export function buildInviteUrl(groupId: string) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID!;
  // ← LIFFのディープリンク形式にするのがポイント！
  const url = new URL(`https://liff.line.me/${liffId}`);
  url.searchParams.set("group", groupId);
  url.searchParams.set("invite", "1");
  return url.toString();
}


/**
 * 招待の本体。
 * - LINEアプリ内 & shareTargetPicker可 → 共有ピッカー
 * - それ以外 → LINE共有URL or クリップボードにフォールバック
 * - アプリ内で未ログインなら liff.login() に誘導（戻ってきたらもう一度押せばOK）
 */
export async function inviteByLine(groupId: string, groupName: string) {
  const url = buildInviteUrl(groupId);
  const text = `「${groupName}」に招待します！\n参加して割り勘しよう👇\n${url}`;
  const lineShareUrl = "https://line.me/R/share?text=" + encodeURIComponent(text);

  try {
    const liff = await ensureLiff();
    const inClient =
      typeof liff.isInClient === "function" ? liff.isInClient() : false;
    const loggedIn = typeof liff.isLoggedIn === "function" ? liff.isLoggedIn() : false;

    // アプリ内だが未ログイン → まずログイン（戻ったら再タップで共有OK）
    if (inClient && !loggedIn) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    // アプリ内 & 共有APIあり → 共有ピッカー
    const canShare =
      inClient &&
      typeof liff.isApiAvailable === "function" &&
      liff.isApiAvailable("shareTargetPicker");

    if (canShare) {
      await liff.shareTargetPicker([{ type: "text", text }], { isMultiple: true });
      return;
    }

    // アプリ内だが共有APIなし → 共有URLを外部で開く
    if (inClient) {
      await liff.openWindow({ url: lineShareUrl, external: true });
      return;
    }

    // LINE外ブラウザ → まずクリップボード
    try {
      await navigator.clipboard.writeText(url);
      alert("招待URLをコピーしました。LINEトークに貼り付けて送ってください。");
    } catch {
      // クリップボード不可なら共有URLを新規タブで
      window.open(lineShareUrl, "_blank");
    }
  } catch (err) {
    console.error("inviteByLine error:", err);
    // 何か失敗しても最後の砦：クリップボード or 共有URL
    try {
      await navigator.clipboard.writeText(url);
      alert("招待URLをコピーしました。LINEトークに貼り付けて送ってください。");
    } catch {
      window.open(lineShareUrl, "_blank");
    }
  }
}