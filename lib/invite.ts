// lib/invite.ts
// LINEのカード（Flex Message）で招待を送るユーティリティ
// 使い方: inviteByLine(groupId, groupName, memberCount)

const HERO =
  process.env.NEXT_PUBLIC_INVITE_HERO_URL ||
  "https://static.line-scdn.net/line_lp/img/meta/og-image.png";

export async function inviteByLine(
  groupId: string,
  groupName: string,
  memberCount?: number
) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/?group=${encodeURIComponent(groupId)}&invite=1`;

  // Flex Message（カード）
  const title = groupName || "割り勘グループ";
  const altText = `「${title}」割り勘グループに参加しよう`;
  const flex: any = {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: HERO,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: "割り勘グループに招待",
            weight: "bold",
            size: "sm",
            color: "#06C755",
          },
          {
            type: "text",
            text: title,
            weight: "bold",
            size: "lg",
            wrap: true,
          },
          ...(memberCount !== undefined
            ? [
                {
                  type: "box",
                  layout: "baseline",
                  spacing: "sm",
                  contents: [
                    { type: "text", text: "メンバー", size: "sm", color: "#8c8c8c", flex: 2 },
                    { type: "text", text: `${memberCount} 人`, size: "sm", color: "#111111", flex: 5 },
                  ],
                },
              ]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#06C755",
            height: "sm",
            action: { type: "uri", label: "参加する", uri: url },
          },
          {
            type: "button",
            style: "link",
            height: "sm",
            action: { type: "uri", label: "詳細を見る", uri: url },
          },
          { type: "spacer", size: "sm" },
        ],
        flex: 0,
      },
    },
  };

  const liff = (globalThis as any).liff;

  // Share Target Picker が使える環境なら、カードで共有
  if (liff?.isApiAvailable?.("shareTargetPicker")) {
    try {
      await liff.shareTargetPicker([flex]);
      return;
    } catch {
      // ユーザーキャンセルなど → フォールバックへ
    }
  }

  // Web Share API フォールバック（カード不可環境）
  const text = `${altText}\n${url}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "割り勘に参加", text, url });
      return;
    } catch {
      // キャンセル時などはフォールバック
    }
  }

  // 最終フォールバック：URLをコピー
  try {
    await navigator.clipboard.writeText(url);
    alert(`招待リンクをコピーしました:\n${url}`);
  } catch {
    alert(`このURLを共有してください:\n${url}`);
  }
}
