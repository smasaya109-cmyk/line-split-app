export default function EnvDebugPage() {
  const keys = [
    "NEXT_PUBLIC_LIFF_ID",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
  ] as const;

  const rows = keys.map((k) => ({
    key: k,
    ok: !!process.env[k as keyof NodeJS.ProcessEnv],
  }));

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-lg font-semibold mb-4">Env Debug (Production)</h1>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="flex justify-between border p-2 rounded">
            <span className="font-mono">{r.key}</span>
            <span className={r.ok ? "text-green-600" : "text-red-600"}>
              {r.ok ? "OK" : "MISSING"}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500 mt-4">
        値そのものは表示していません。定義されているかの可視化のみです。
      </p>
    </main>
  );
}
