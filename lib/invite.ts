// /lib/invite.ts
// ※ 'use client' は不要。サーバー環境でも安全に評価されるように
//   window/liff 参照は関数の中に閉じ込めています。

/** Flexカードのヒーロー画像（任意で差し替えOK・HTTPS必須） */
const DEFAULT_HERO_IMAGE =
  "https://static.line-scdn.net/line_lp/img/meta/og-image.png";

/** 安全に liff を取得（SSR では undefined を返す） */
function getLiff(): any | undefined {
  if (typeof window === "undefined") return undefined;
  // CDNでロードした liff を参照
  return (window as any).liff;
}

/**
 * 友だちに招待を送る（Flex → 使えなければURLシェアにフォールバック）
 * @param groupId   招待したいグループID
 * @param groupName 招待カードに表示するグループ名
 * @param heroImage カード上部の画像URL（未指定なら既定画像）
 */
export async function inviteByLine(
  groupId: string,
  groupName: string,
  heroImage: string = DEFAULT_HERO_IMAGE
): Promise<void> {
  // 共有先URL（LIFF内でもブラウザでも動くように origin を分岐）
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://line-split.vercel.app";
  const joinUrl = `${origin}/?group=${encodeURIComponent(groupId)}`;

  const fallbackText = `"${groupName}" に参加しよう！\n${joinUrl}`;
  const liff = getLiff();

  // LIFFがなければ（Safari/Chrome 直開きなど）URLシェアへ
  if (!liff) {
    if (typeof window !== "undefined") {
      window.open(
        "https://line.me/R/share?text=" + encodeURIComponent(fallbackText),
        "_blank"
      );
    }
    return;
  }

  // 未ログインならログインへ（戻りで再実行される想定）
  if (typeof liff.isLoggedIn === "function" && !liff.isLoggedIn()) {
    try {
      await liff.login();
      return;
    } catch {
      // 失敗時はURLシェアへ
      await liff.openWindow({
        url:
          "https://line.me/R/share?text=" + encodeURIComponent(fallbackText),
        external: true,
      });
      return;
    }
  }

  // Share Target Picker が使える端末なら Flex を送る
  try {
    const canShare =
      typeof liff.isApiAvailable === "function" &&
      liff.isApiAvailable("shareTargetPicker");

    if (canShare) {
      const flexMessage = {
        type: "flex",
        altText: `"${groupName}"から招待が届きました！`,
        contents: {
          type: "bubble",
          hero: {
            type: "image",
            url: heroImage || DEFAULT_HERO_IMAGE,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
            action: { type: "uri", label: "open", uri: joinUrl },
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: `"${groupName}"から招待が届きました！`,
                weight: "bold",
                wrap: true,
                size: "lg",
              },
            ],
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
                action: { type: "uri", label: "参加する", uri: joinUrl },
              },
            ],
            flex: 0,
          },
          styles: { footer: { separator: true } },
        },
      };

      await liff.shareTargetPicker([flexMessage], { isMultiple: true });
      return;
    }

    // 使えない端末 → URLシェアへ
    await liff.openWindow({
      url: "https://line.me/R/share?text=" + encodeURIComponent(fallbackText),
      external: true,
    });
  } catch {
    // どのみち最後はURLシェアでフォールバック
    await liff.openWindow({
      url: "https://line.me/R/share?text=" + encodeURIComponent(fallbackText),
      external: true,
    });
  }
}
