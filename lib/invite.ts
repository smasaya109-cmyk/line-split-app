// lib/invite.ts
// 招待カードをLINEのシェアターゲットピッカーで送る（使えない端末はURL共有にフォールバック）

const HERO_IMAGE_URL =
  "https://static.line-scdn.net/line_lp/img/meta/og-image.png";

/**
 * LINEでグループ招待を送る
 * @param groupId Firestore groups/{groupId}
 * @param groupName 表示用グループ名（未指定なら "割り勘グループ"）
 */
export async function inviteByLine(
  groupId?: string,
  groupName?: string
): Promise<void> {
  if (typeof window === "undefined") return;

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID!;
  // ✅ 配るURLは必ず LIFF の深いURLにする
  const groupLink = groupId
    ? `https://liff.line.me/${liffId}?group=${groupId}`
    : `https://liff.line.me/${liffId}`;

  const name = groupName?.trim() || "割り勘グループ";

  // Flex Message（送れない端末もあるので下でフォールバックあり）
  const flexInvite: any = {
    type: "flex",
    altText: `"${name}"から招待が届きました！`,
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: HERO_IMAGE_URL,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
        action: { type: "uri", label: "open", uri: groupLink },
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `"${name}"から招待が届きました！`,
            wrap: true,
            weight: "bold",
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
            action: { type: "uri", label: "参加する", uri: groupLink },
          },
        ],
        flex: 0,
      },
      styles: { footer: { separator: true } },
    },
  };

  const textBackup = {
    type: "text",
    text: `"${name}" に参加しよう！\n${groupLink}`,
  };

  const liff = (window as any).liff;

  // LIFF SDKが無い（外部ブラウザなど）→ URL共有にフォールバック
  if (!liff) {
    window.open(
      "https://line.me/R/share?text=" + encodeURIComponent(textBackup.text),
      "_blank"
    );
    return;
  }

  // 初期化済み想定。未初期化の場合は呼び出し側のページで init 済み。
  try {
    const canShare =
      typeof liff.isApiAvailable === "function" &&
      liff.isApiAvailable("shareTargetPicker");

    if (canShare) {
      await liff.shareTargetPicker([flexInvite], { isMultiple: true });
      return;
    }

    // shareTargetPicker非対応 → URL共有へ
    await liff.openWindow({
      url: "https://line.me/R/share?text=" + encodeURIComponent(textBackup.text),
      external: true,
    });
  } catch {
    // 失敗時もURL共有へ
    await (window as any).liff?.openWindow({
      url: "https://line.me/R/share?text=" + encodeURIComponent(textBackup.text),
      external: true,
    });
  }
}
