export default function TermsPage() {
  const OPERATOR = "佐々木雅也";
  const CONTACT = "s.masaya109@gmail.com";
  const APPNAME = "みんなで割り勘";
  const DATE = "2025年11月4日";

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <h1 className="text-2xl font-bold">利用規約</h1>
      <p>
        この利用規約（以下「本規約」）は、{APPNAME}
        （以下「本サービス」）の利用条件を定めるものです。利用者（以下「ユーザー」）は、本規約に同意のうえ利用するものとします。
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">1. 適用</h2>
        <p>本規約は、ユーザーと運営者との間の本サービスに関する一切の関係に適用されます。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">2. アカウント/ログイン</h2>
        <p>本サービスはLINE連携等を利用します。ログイン情報の管理はユーザーの責任で行ってください。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3. 禁止事項</h2>
        <ul className="list-disc pl-6">
          <li>法令または公序良俗に反する行為</li>
          <li>不正アクセス、システム妨害、リバースエンジニアリング</li>
          <li>虚偽の情報の登録、第三者になりすます行為</li>
          <li>本サービスの運営を妨げる行為</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">4. 料金</h2>
        <p>本サービス自体は無償で提供される場合がありますが、通信料等はユーザー負担です。有料機能がある場合は別途定めます。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">5. 免責</h2>
        <ul className="list-disc pl-6">
          <li>算出結果や為替レートの誤差、端末・通信環境・外部サービスの障害等により生じた損害について、運営者は責任を負いません。</li>
          <li>メンテナンス・不具合対応等のため、サービスを中断・停止する場合があります。</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">6. 知的財産権</h2>
        <p>本サービスに関する著作権等は運営者または正当な権利者に帰属します。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">7. データの取り扱い</h2>
        <p>データの保存・削除の可否、期間等はプライバシーポリシーに従います。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">8. 規約の変更</h2>
        <p>運営者は、本規約を変更できるものとし、変更後の規約は本サービス上での表示時に効力を生じます。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">9. 準拠法・裁判管轄</h2>
        <p>本規約は日本法に準拠し、紛争は運営者の所在地を管轄する裁判所を第一審の専属的合意管轄とします。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">10. 連絡先</h2>
        <p>運営者名：{OPERATOR} ／ 連絡先：{CONTACT}</p>
        <p>制定日：{DATE}</p>
      </section>
    </main>
  );
}
