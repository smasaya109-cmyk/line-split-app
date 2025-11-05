// lib/invite.ts
"use client";

/* 型エラー防止用のゆるい型宣言（ビルド時に liff 未定義でもOKにする） */
declare global {
  interface Window {
    liff?: any;
  }
}

/** LIFF SDK を遅延ロード & 初期化（ブラウザのみ） */
async function loadLiff(): Promise<any> {
  if (typeof window === "undefined") throw new Error("no window");

  // SDK未読込ならスクリプトを動的追加
  if (!window.liff) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("LIFF SDK load failed"));
      document.head.appendChild(s);
    });
  }

  const l = window.liff!;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) throw new Error("NEXT_PUBLIC_LIFF_ID is missing");

  // 二重初期化ガード（任意のフラグを持たせる）
  if (!l.__initialized) {
    await l.init({ liffId });
    l.__initialized = true;
  }
  await l.ready;
  return l;
}

/** 参加リンクは LIFF ディープリンクで生成（常に LINE アプリ内で起動） */
export function buildInviteUrl(groupId: string, liffIdOverride?: string) {
  const liffId = liffIdOverride ?? process.env.NEXT_PUBLIC_LIFF_ID!;
  const url = new URL(`https://liff.line.me/${liffId}`);
  url.searchParams.set("group", groupId);
  url.searchParams.set("invite", "1");
  return url.toString();
}

/**
 * 友だちに招待を送る。
 * - 可能なら shareTargetPicker（友だち選択画面）
 * - だめなら LINE共有URL → クリップボードコピーにフォールバック
 * - 未ログインならログインに誘導（戻って再タップ）
 */
export async function inviteByLine(groupId: string, groupName: string) {
  if (typeof window === "undefined") return;

  const origin = window.location.origin;
  const inviteUrl = buildInviteUrl(groupId);
  const heroImageUrl = new URL("/card.png", origin).toString(); // ← /public/card.png を使用
  const alt = `「${groupName}」から招待が届きました！`;

  // Flex 招待カード（画像＋参加ボタン）
  const flexInvite: any = {
    type: "flex",
    altText: alt,
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: heroImageUrl,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
        action: { type: "uri", label: "open", uri: inviteUrl },
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "text", text: alt, wrap: true, weight: "bold", size: "lg" }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#06C755",
            action: { type: "uri", label: "参加する", uri: inviteUrl },
          },
        ],
        flex: 0,
      },
      styles: { footer: { separator: true } },
    },
  };

  const shareText = `「${groupName}」に招待します！\n参加して割り勘しよう👇\n${inviteUrl}`;
  const lineShareUrl = "https://line.me/R/share?text=" + encodeURIComponent(shareText);

  // LIFF を確実に使えるように
  let l: any | undefined;
  try {
    l = await loadLiff();
  } catch {
    // SDK/初期化に失敗 → 共有URLにフォールバック
    window.open(lineShareUrl, "_blank");
    return;
  }

  const inClient = !!l.isInClient?.();
  const loggedIn = !!l.isLoggedIn?.();

  // アプリ内で未ログイン → まずログイン
  if (inClient && !loggedIn) {
    l.login({ redirectUri: window.location.href });
    return;
  }

  try {
    // アプリ内 & shareTargetPicker 利用可 → 友だち選択画面
    const canShare = inClient && !!l.isApiAvailable?.("shareTargetPicker");
    if (canShare) {
      await l.shareTargetPicker([flexInvite], { isMultiple: true });
      return;
    }

    // アプリ内だがピッカー不可 → LINE共有URLを外部で開く
    if (inClient) {
      await l.openWindow({ url: lineShareUrl, external: true });
      return;
    }

    // LINE外ブラウザ → まず招待URLをコピー
    try {
      await navigator.clipboard.writeText(inviteUrl);
      alert("招待URLをコピーしました。LINEトークに貼り付けて送ってください。");
    } catch {
      // クリップボード不可 → 共有URLを新規タブで開く
      window.open(lineShareUrl, "_blank");
    }
  } catch {
    // 何かで失敗 → 最後のフォールバック
    try {
      await navigator.clipboard.writeText(inviteUrl);
      alert("招待URLをコピーしました。LINEトークに貼り付けて送ってください。");
    } catch {
      window.open(lineShareUrl, "_blank");
    }
  }
}

/** 現在のURLを LINE アプリ（内ブラウザ）で開き直す */
export async function openInLineAppCurrentUrl() {
  if (typeof window === "undefined") return;
  try {
    const l = await loadLiff();
    l.openWindow({ url: window.location.href, external: false });
  } catch {
    alert("LINEアプリから開いてください。");
  }
}

/** 簡易診断（inClient / loggedIn / canShare を返す） */
export async function liffDiagnostics() {
  if (typeof window === "undefined")
    return { inClient: false, loggedIn: false, canShare: false, ctx: undefined as any };

  try {
    const l = await loadLiff();
    const inClient = !!l.isInClient?.();
    const loggedIn = !!l.isLoggedIn?.();
    const canShare = inClient && !!l.isApiAvailable?.("shareTargetPicker");
    const ctx = l.getContext?.();
    return { inClient, loggedIn, canShare, ctx };
  } catch {
    return { inClient: false, loggedIn: false, canShare: false, ctx: undefined as any };
  }
}
