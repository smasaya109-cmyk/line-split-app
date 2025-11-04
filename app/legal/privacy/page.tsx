export default function PrivacyPage() {
  const SITE = "https://line-split.vercel.app";
  const OPERATOR = "佐々木雅也";
  const CONTACT = "s.masaya109@gmail.com";
  const APPNAME = "みんなで割り勘";
  const DATE = "2025年11月4日";

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
      <p>
        本プライバシーポリシーは、{APPNAME}
        （以下「本サービス」）における利用者の情報の取扱い方針を定めるものです。
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">1. 事業者情報</h2>
        <ul className="list-disc pl-6">
          <li>運営者名：{OPERATOR}</li>
          <li>連絡先：{CONTACT}</li>
          <li>サイトURL：{SITE}</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">2. 取得する情報</h2>
        <ul className="list-disc pl-6">
          <li>LINEプロフィールの表示名等（LINEログイン/LIFF経由で許可された範囲）</li>
          <li>グループ情報、メンバー名、支払記録（タイトル、金額、通貨、支払者・対象者、作成日時等）</li>
          <li>端末・ブラウザ等の技術情報（アクセスログ、Cookie等）</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3. 利用目的</h2>
        <ul className="list-disc pl-6">
          <li>割り勘機能の提供、履歴の保存・表示、招待リンクの発行</li>
          <li>不正利用の防止、品質改善、問い合わせ対応</li>
          <li>法令遵守およびトラブル時の調査</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">4. 第三者提供</h2>
        <p>本人の同意または法令に基づく場合を除き、第三者提供は行いません。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">5. 業務委託</h2>
        <p>本サービスは Firebase / Google Cloud / Vercel 等のクラウド事業者を利用します。各事業者は当方の委託先として、データの保管・処理を行います。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">6. 保管期間</h2>
        <p>退会・削除の申出があるまで、または運用上必要な期間保管します。長期未使用データは削除する場合があります。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">7. 利用者の権利</h2>
        <p>ご本人からの開示・訂正・削除・利用停止等のご請求に対応します。{CONTACT} までご連絡ください。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">8. 安全管理</h2>
        <p>アクセス制御、通信の暗号化、ログ監査等、合理的な安全管理措置を講じます。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">9. 未成年者の利用</h2>
        <p>未成年の利用には保護者の同意が必要です。保護者の方は利用状況をご確認ください。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">10. ポリシーの改定</h2>
        <p>内容を改定する場合があります。重要な変更は本サービス上で告知します。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">11. お問い合わせ</h2>
        <p>{CONTACT}</p>
        <p>制定日：{DATE}</p>
      </section>
    </main>
  );
}
