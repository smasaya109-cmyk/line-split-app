/* lib/invite.ts */
/* eslint-disable @typescript-eslint/no-explicit-any */

// window.liff の型を雑に許可（TSビルドで未定義エラーにならないように）
declare global {
  interface Window {
    liff?: any;
  }
}

/** 招待リンクは LIFF ディープリンクにします（常に LINE アプリ内で起動） */
export function buildInviteUrl(groupId: string) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID!;
  const url = new URL(`https://liff.line.me/${liffId}`);
  url.searchParams.set("group", groupId);
  url.searchParams.set("invite", "1");
  return url.toString();
}

/** LIFF を遅延ロード＆初期化（ブラウザのみ） */
async function loadLiff(): Promise<any> {
  if (typeof window === "undefined") throw new Error("no window");
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
  if (!l._initCalled) {
    await l.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
    l._initCalled = true;
  }
  await l.ready;
  return l;
}

/** 友だちへ招待（Flex → だめならURLシェアにフォールバック） */
export async function inviteByLine(groupId: string, groupName: string) {
  if (typeof window === "undefined") return;

  const inviteUrl = buildInviteUrl(groupId);
  const textBackup = {
    type: "text",
    text: `"${groupName}" に参加しよう！\n${inviteUrl}`,
  };

  const l = await loadLiff().catch(() => undefined);

  // LIFFが取れなければURLシェアへ
  if (!l) {
    window.open(
      "https://line.me/R/share?text=" + encodeURIComponent(textBackup.text),
      "_blank"
    );
    return;
  }

  if (!l.isLoggedIn?.()) {
    l.login();
    return;
  }

  const flex = {
    type: "flex",
    altText: `"${groupName}"から招待が届きました！`,
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: "https://static.line-scdn.net/line_lp/img/meta/og-image.png",
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
        action: { type: "uri", label: "open", uri: inviteUrl },
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `"${groupName}"から招待が届きました！`,
            wrap: true,
            weight: "bold",
            size: "lg",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
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
    },
  } as any;

  try {
    const canShare = l.isInClient?.() && l.isApiAvailable?.("shareTargetPicker");
    if (canShare) {
      await l.shareTargetPicker([flex]);
      return;
    }
    // 端末がピッカー未対応 → URLシェア
    await l.openWindow({
      url: "https://line.me/R/share?text=" + encodeURIComponent(textBackup.text),
      external: true,
    });
  } catch {
    await l.openWindow({
      url: "https://line.me/R/share?text=" + encodeURIComponent(textBackup.text),
      external: true,
    });
  }
}

/** LINEアプリで現在のURLを開き直す */
export async function openInLineAppCurrentUrl() {
  if (typeof window === "undefined") return;
  const l = await loadLiff().catch(() => undefined);
  if (l) {
    l.openWindow({ url: window.location.href, external: false });
  } else {
    alert("LINEアプリから開いてください。");
  }
}

/** 簡易診断（ページ側の“診断”ボタン用） */
export async function liffDiagnostics() {
  if (typeof window === "undefined")
    return { inClient: false, loggedIn: false, canShare: false, ctx: undefined as any };
  const l = await loadLiff().catch(() => undefined);
  if (!l) return { inClient: false, loggedIn: false, canShare: false, ctx: undefined as any };
  const inClient = !!l.isInClient?.();
  const loggedIn = !!l.isLoggedIn?.();
  const canShare = inClient && !!l.isApiAvailable?.("shareTargetPicker");
  const ctx = l.getContext?.();
  return { inClient, loggedIn, canShare, ctx };
}
