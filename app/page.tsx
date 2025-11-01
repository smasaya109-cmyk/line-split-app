"use client";

import { useEffect, useState } from "react";
import liff from "@line/liff";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

// 為替レート（本番ではFirestoreに持たせてもOK）
const FX_RATES: Record<string, number> = {
  JPY: 1,
  USD: 150,
  EUR: 160,
  THB: 4.2,
  KRW: 0.11,
};

type Group = { id: string; name: string };
type Member = { id: string; name: string };
type Expense = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  paidBy: string;
  participants?: string[];
  createdAt?: any;
  fxRate?: number;
};

export default function Home() {
  // タブ
  const [view, setView] = useState<"groups" | "expense" | "settle">("groups");

  // Firestore系
  const [groups, setGroups] = useState<Group[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  // 入力
  const [groupName, setGroupName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  // ローディング・エラー
  const [loadingAll, setLoadingAll] = useState(true);
  const [loadingLiff, setLoadingLiff] = useState(true);
  const [liffError, setLiffError] = useState<string | null>(null);
  const [liffIdOnClient, setLiffIdOnClient] = useState<string | null>(null);
  const [isInClient, setIsInClient] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // 支払いフォーム
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expCurrency, setExpCurrency] = useState("JPY");
  const [expPayerId, setExpPayerId] = useState<string | null>(null);
  const [expTargets, setExpTargets] = useState<string[]>([]);
  const [showKeypad, setShowKeypad] = useState(false);

  // 編集中の支払い
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const isAbort = (e: unknown) =>
    typeof e === "object" &&
    e !== null &&
    // @ts-ignore
    (e.name === "AbortError" || e.code === "aborted");

  // ───────── Firestore load ─────────
  const loadAllGroups = async () => {
    try {
      const snap = await getDocs(collection(db, "groups"));
      const arr: Group[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      setGroups(arr);
      if (!selectedGroup && arr.length > 0) {
        setSelectedGroup(arr[0]);
      }
      setLoadingAll(false);
      return arr;
    } catch (e) {
      if (!isAbort(e)) console.error(e);
      setLoadingAll(false);
      return [];
    }
  };

  const loadMembers = async (groupId: string) => {
    try {
      const snap = await getDocs(collection(db, "groups", groupId, "members"));
      const list: Member[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({ id: d.id, name: data.name ?? d.id });
      });
      setMembers(list);

      // 支払者初期値
      if (lineUserId && list.find((m) => m.id === lineUserId)) {
        setExpPayerId(lineUserId);
      } else if (list.length > 0) {
        setExpPayerId(list[0].id);
      }
      // 参加者初期値は全員
      setExpTargets(list.map((m) => m.id));
    } catch (e) {
      if (!isAbort(e)) console.error(e);
      setMembers([]);
    }
  };

  const loadExpenses = async (groupId: string) => {
    try {
      const q = query(
        collection(db, "groups", groupId, "expenses"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list: Expense[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setExpenses(list);
    } catch (e) {
      if (!isAbort(e)) console.error(e);
      setExpenses([]);
    }
  };

  // ───────── 初回 ─────────
  useEffect(() => {
    loadAllGroups();
  }, []);

  // ───────── LIFF初期化 ─────────
  useEffect(() => {
    const run = async () => {
      if (typeof window === "undefined") return;
      setIsInClient(true);

      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || null;
      setLiffIdOnClient(liffId);

      // Vercelでenvがないとき
      if (!liffId) {
        setLiffError(
          "NEXT_PUBLIC_LIFF_ID が本番で空です。VercelのEnvironment Variablesに同じ名前で入れて再デプロイしてください。"
        );
        setLoadingLiff(false);
        return;
      }

      // LIFF init
      try {
        await liff.init({ liffId });
      } catch (err: any) {
        console.error("LIFF init error", err);
        setLiffError(
          "LIFFの初期化に失敗しました。LINEアプリから正しいURLで開いているか、LIFFのエンドポイントが同じかを確認してください。"
        );
        setLoadingLiff(false);
        return;
      }

      // 未ログインならログインへ
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }

      // プロフィール取得
      try {
        const profile = await liff.getProfile();
        const uid = profile.userId;
        setLineUserId(uid);
        setMemberName(profile.displayName ?? "");

        // 自分が入ってるグループだけ抽出
        const all = await loadAllGroups();
        const mine: Group[] = [];
        for (const g of all) {
          try {
            const memSnap = await getDocs(
              collection(db, "groups", g.id, "members")
            );
            const hasMe = memSnap.docs.find((m) => m.id === uid);
            if (hasMe) mine.push(g);
          } catch (e) {
            if (!isAbort(e)) console.error(e);
          }
        }
        setMyGroups(mine);
      } catch (err: any) {
        console.error("LIFF profile error", err);
        setLiffError("プロフィール取得に失敗しました: " + String(err?.message || err));
      } finally {
        setLoadingLiff(false);
      }
    };

    run();
  }, []);

  // ───────── グループ選択時 ─────────
  useEffect(() => {
    if (selectedGroup) {
      loadMembers(selectedGroup.id);
      loadExpenses(selectedGroup.id);
    }
  }, [selectedGroup]);

  // ───────── 追加・更新系 ─────────
  const handleAddGroup = async () => {
    if (!groupName.trim()) return;
    const ref = await addDoc(collection(db, "groups"), {
      name: groupName.trim(),
      createdAt: serverTimestamp(),
    });
    setGroupName("");
    const all = await loadAllGroups();
    setSelectedGroup({ id: ref.id, name: groupName.trim() });

    // LINEで開いてるときは自分をメンバーに入れる
    if (lineUserId) {
      await setDoc(doc(db, "groups", ref.id, "members", lineUserId), {
        name: memberName || "LINEユーザー",
        userId: lineUserId,
        joinedAt: serverTimestamp(),
      });
      loadMembers(ref.id);

      // 自分のグループ一覧作り直し
      const mine: Group[] = [];
      for (const g of all) {
        try {
          const memSnap = await getDocs(
            collection(db, "groups", g.id, "members")
          );
          const hasMe = memSnap.docs.find((m) => m.id === lineUserId);
          if (hasMe) mine.push(g);
        } catch (e) {
          if (!isAbort(e)) console.error(e);
        }
      }
      setMyGroups(mine);
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroup) return;
    if (!memberName.trim()) return;

    const memberDocId = lineUserId ?? memberName.trim();
    await setDoc(
      doc(db, "groups", selectedGroup.id, "members", memberDocId),
      {
        name: memberName.trim(),
        userId: lineUserId ?? null,
        joinedAt: serverTimestamp(),
      }
    );
    await loadMembers(selectedGroup.id);
    alert(`「${selectedGroup.name}」に「${memberName}」を追加しました`);
  };

  const handleAddExpense = async () => {
    if (!selectedGroup) return;
    if (!expTitle.trim()) return;
    const price = Number(expAmount);
    if (Number.isNaN(price) || price <= 0) return;

    // 参加者が空なら全員
    const targets =
      expTargets.length > 0 ? expTargets : members.map((m) => m.id);

    if (editingExpense) {
      // 更新
      await updateDoc(
        doc(db, "groups", selectedGroup.id, "expenses", editingExpense.id),
        {
          title: expTitle.trim(),
          amount: price,
          currency: expCurrency,
          paidBy: expPayerId || lineUserId || "unknown",
          participants: targets,
        }
      );
      setEditingExpense(null);
    } else {
      // 新規
      await addDoc(collection(db, "groups", selectedGroup.id, "expenses"), {
        title: expTitle.trim(),
        amount: price,
        currency: expCurrency,
        paidBy: expPayerId || lineUserId || "unknown",
        participants: targets,
        createdAt: serverTimestamp(),
        fxRate: FX_RATES[expCurrency] ?? 1,
      });
    }

    setExpTitle("");
    setExpAmount("");
    await loadExpenses(selectedGroup.id);
    setView("settle");
  };

  const handleEditExpense = (ex: Expense) => {
    setEditingExpense(ex);
    setView("expense");
    setExpTitle(ex.title);
    setExpAmount(String(ex.amount));
    setExpCurrency(ex.currency);
    setExpPayerId(ex.paidBy);
    setExpTargets(ex.participants ?? members.map((m) => m.id));
  };

  const handleDeleteExpense = async (ex: Expense) => {
    if (!selectedGroup) return;
    if (!confirm("この支払いを削除しますか？")) return;
    await deleteDoc(doc(db, "groups", selectedGroup.id, "expenses", ex.id));
    await loadExpenses(selectedGroup.id);
  };

  const toggleTarget = (id: string) => {
    setExpTargets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const selectAllTargets = () => {
    setExpTargets(members.map((m) => m.id));
  };

  // ───────── 清算（多通貨→JPY）─────────
  const calcSettlement = () => {
    if (!selectedGroup || !members.length || !expenses.length) return null;

    const paidMap: Record<string, number> = {};
    const owedMap: Record<string, number> = {};
    members.forEach((m) => {
      paidMap[m.id] = 0;
      owedMap[m.id] = 0;
    });

    expenses.forEach((e) => {
      const rate = e.fxRate ?? FX_RATES[e.currency] ?? 1;
      const base = e.amount * rate; // JPY換算

      const targets =
        e.participants && e.participants.length > 0
          ? e.participants
          : members.map((m) => m.id);

      const perHead = base / targets.length;

      // 支払った人
      if (!paidMap[e.paidBy]) paidMap[e.paidBy] = 0;
      paidMap[e.paidBy] += base;

      // 参加者に割り振り
      targets.forEach((tid) => {
        if (!owedMap[tid]) owedMap[tid] = 0;
        owedMap[tid] += perHead;
      });
    });

    const rows = members.map((m) => {
      const paid = Math.round(paidMap[m.id] ?? 0);
      const owed = Math.round(owedMap[m.id] ?? 0);
      const diff = paid - owed;
      return { id: m.id, name: m.name, paid, owed, diff };
    });

    const receivers = rows
      .filter((r) => r.diff > 0)
      .map((r) => ({ ...r }));
    const payers = rows
      .filter((r) => r.diff < 0)
      .map((r) => ({ ...r, diff: Math.abs(r.diff) }));

    const transfers: { from: string; to: string; amount: number }[] = [];
    let i = 0;
    let j = 0;
    while (i < payers.length && j < receivers.length) {
      const payer = payers[i];
      const receiver = receivers[j];
      const amount = Math.min(payer.diff, receiver.diff);
      transfers.push({
        from: payer.name,
        to: receiver.name,
        amount: Math.round(amount),
      });
      payer.diff -= amount;
      receiver.diff -= amount;
      if (payer.diff === 0) i++;
      if (receiver.diff === 0) j++;
    }

    return { rows, transfers };
  };

  const settlement = calcSettlement();

  // ───────── テンキー ─────────
  const keypadButtons = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "←"];
  const onKeypadPress = (key: string) => {
    if (key === "←") {
      setExpAmount((prev) => prev.slice(0, -1));
    } else {
      setExpAmount((prev) => (prev === "0" ? key : prev + key));
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f5f7",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont",
      }}
    >
      {/* デバッグ表示（原因切り分け用） */}
      <div style={{ background: "#ffedb8", padding: 8, fontSize: 12 }}>
        <div>
          env LIFF ID: <strong>{liffIdOnClient ?? "(undefined)"}</strong>
        </div>
        <div>client?: {isInClient ? "yes" : "no"}</div>
        <div>lineUserId: {lineUserId ?? "(not logged in)"}</div>
        {liffError && <div style={{ color: "red" }}>{liffError}</div>}
        <div>
          URL: {typeof window !== "undefined" ? window.location.href : "(ssr)"}
        </div>
      </div>

      {/* ヘッダー */}
      <header
        style={{
          background: "#06c755",
          color: "#fff",
          padding: "14px 16px 10px",
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.9 }}>LINE割り勘</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {selectedGroup ? selectedGroup.name : "グループを選択"}
        </div>
        {liffError && (
          <div style={{ fontSize: 11, marginTop: 4, color: "#ffe" }}>
            {liffError}
          </div>
        )}
      </header>

      {/* コンテンツ */}
      <main style={{ padding: 14, maxWidth: 540, margin: "0 auto" }}>
        {/* タブ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 6,
            marginBottom: 12,
          }}
        >
          <button
            onClick={() => setView("groups")}
            style={{
              padding: "8px 0",
              border: "none",
              borderRadius: 999,
              background: view === "groups" ? "#06c755" : "#fff",
              color: view === "groups" ? "#fff" : "#333",
              fontWeight: 600,
            }}
          >
            グループ
          </button>
          <button
            onClick={() => setView("expense")}
            style={{
              padding: "8px 0",
              border: "none",
              borderRadius: 999,
              background: view === "expense" ? "#06c755" : "#fff",
              color: view === "expense" ? "#fff" : "#333",
              fontWeight: 600,
            }}
          >
            支払い
          </button>
          <button
            onClick={() => setView("settle")}
            style={{
              padding: "8px 0",
              border: "none",
              borderRadius: 999,
              background: view === "settle" ? "#06c755" : "#fff",
              color: view === "settle" ? "#fff" : "#333",
              fontWeight: 600,
            }}
          >
            清算
          </button>
        </div>

        {/* VIEW: グループ */}
        {view === "groups" && (
          <>
            {/* グループ追加 */}
            <section
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <h2 style={{ fontSize: 14, marginBottom: 6 }}>グループを追加</h2>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="例）11/3大阪飲み会"
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  marginBottom: 8,
                }}
              />
              <button
                onClick={handleAddGroup}
                style={{
                  width: "100%",
                  padding: 8,
                  background: "#06c755",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                追加
              </button>
            </section>

            {/* グループ一覧 */}
            <section
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: 12,
              }}
            >
              <h2 style={{ fontSize: 14, marginBottom: 6 }}>あなたのグループ</h2>
              {(lineUserId ? myGroups : groups).length === 0 && (
                <p style={{ fontSize: 12 }}>まだありません</p>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(lineUserId ? myGroups : groups).map((g) => (
                  <li
                    key={g.id}
                    onClick={() => {
                      setSelectedGroup(g);
                      setView("expense");
                    }}
                    style={{
                      padding: "8px 10px",
                      marginBottom: 6,
                      borderRadius: 8,
                      background:
                        selectedGroup?.id === g.id ? "#e6fff2" : "#f6f6f6",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{g.name}</span>
                    <span style={{ fontSize: 11, color: "#999" }}>開く ›</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* メンバー追加 */}
            {selectedGroup && (
              <section
                style={{
                  background: "#fff",
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 12,
                }}
              >
                <h2 style={{ fontSize: 14, marginBottom: 6 }}>
                  {selectedGroup.name} のメンバー
                </h2>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="例）ささき"
                    style={{
                      flex: 1,
                      padding: 8,
                      border: "1px solid #ddd",
                      borderRadius: 6,
                    }}
                  />
                  <button
                    onClick={handleAddMember}
                    style={{
                      background: "#0a84ff",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "8px 12px",
                      fontWeight: 600,
                    }}
                  >
                    追加
                  </button>
                </div>
                {members.length === 0 ? (
                  <p style={{ fontSize: 12 }}>まだいません。</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {members.map((m) => (
                      <li key={m.id} style={{ fontSize: 13, padding: "2px 0" }}>
                        {m.name}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}

        {/* VIEW: 支払い */}
        {view === "expense" && (
          <>
            {/* 入力フォーム */}
            <section
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <h2 style={{ fontSize: 14, marginBottom: 6 }}>
                {editingExpense ? "支払いを編集" : "支払いを記録する"}
              </h2>
              {selectedGroup ? (
                <>
                  <input
                    value={expTitle}
                    onChange={(e) => setExpTitle(e.target.value)}
                    placeholder="例）韓国でタクシー"
                    style={{
                      width: "100%",
                      padding: 8,
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      marginBottom: 6,
                    }}
                  />
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      onFocus={() => setShowKeypad(true)}
                      placeholder="金額"
                      inputMode="numeric"
                      style={{
                        flex: 1,
                        padding: 8,
                        border: "1px solid #ddd",
                        borderRadius: 6,
                      }}
                    />
                    <select
                      value={expCurrency}
                      onChange={(e) => setExpCurrency(e.target.value)}
                      style={{
                        width: 110,
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #ddd",
                      }}
                    >
                      <option value="JPY">JPY</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="THB">THB</option>
                      <option value="KRW">KRW</option>
                    </select>
                  </div>

                  {/* 支払った人 */}
                  <label style={{ fontSize: 13, fontWeight: 600 }}>
                    支払った人
                  </label>
                  <select
                    value={expPayerId ?? ""}
                    onChange={(e) => setExpPayerId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 6,
                      border: "1px solid #ddd",
                      marginBottom: 8,
                      marginTop: 4,
                    }}
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  {/* 参加者 */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <label style={{ fontSize: 13, fontWeight: 600 }}>
                      この支払いに参加した人
                    </label>
                    <button
                      onClick={selectAllTargets}
                      type="button"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#0a84ff",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      全員
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {members.map((m) => (
                      <label
                        key={m.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          background: expTargets.includes(m.id)
                            ? "#e6fff2"
                            : "#f2f2f2",
                          padding: "4px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={expTargets.includes(m.id)}
                          onChange={() => toggleTarget(m.id)}
                        />
                        {m.name}
                      </label>
                    ))}
                  </div>

                  <button
                    onClick={handleAddExpense}
                    style={{
                      width: "100%",
                      marginTop: 12,
                      padding: 9,
                      background: "#06c755",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      fontWeight: 600,
                    }}
                  >
                    {editingExpense ? "更新する" : "追加する"}
                  </button>
                  {editingExpense && (
                    <button
                      onClick={() => {
                        setEditingExpense(null);
                        setExpTitle("");
                        setExpAmount("");
                      }}
                      style={{
                        width: "100%",
                        marginTop: 6,
                        padding: 8,
                        background: "#eee",
                        border: "none",
                        borderRadius: 6,
                      }}
                    >
                      キャンセル
                    </button>
                  )}
                </>
              ) : (
                <p>先にグループを選んでください。</p>
              )}
            </section>

            {/* テンキー */}
            {showKeypad && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 6,
                  }}
                >
                  {keypadButtons.map((k) => (
                    <button
                      key={k}
                      onClick={() => onKeypadPress(k)}
                      style={{
                        padding: "10px 0",
                        background: "#f2f2f2",
                        border: "none",
                        borderRadius: 6,
                        fontSize: 16,
                        fontWeight: 600,
                      }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowKeypad(false)}
                  style={{
                    width: "100%",
                    marginTop: 6,
                    padding: 6,
                    border: "none",
                    background: "#ddd",
                    borderRadius: 6,
                  }}
                >
                  とじる
                </button>
              </div>
            )}

            {/* 履歴（編集・削除） */}
            <section
              style={{ background: "#fff", borderRadius: 10, padding: 12 }}
            >
              <h2 style={{ fontSize: 14, marginBottom: 6 }}>最近の支払い</h2>
              {expenses.length === 0 ? (
                <p style={{ fontSize: 12 }}>まだありません。</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {expenses.map((ex) => (
                    <li
                      key={ex.id}
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid #eee",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{ex.title}</div>
                        <div style={{ fontSize: 12, color: "#555" }}>
                          {ex.amount.toLocaleString()} {ex.currency} /{" "}
                          {members.find((m) => m.id === ex.paidBy)?.name ||
                            ex.paidBy}
                        </div>
                        {ex.participants && (
                          <div style={{ fontSize: 11, color: "#555" }}>
                            対象:{" "}
                            {ex.participants
                              .map(
                                (pid) =>
                                  members.find((m) => m.id === pid)?.name ?? pid
                              )
                              .join(", ")}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          onClick={() => handleEditExpense(ex)}
                          style={{
                            background: "#e6fff2",
                            border: "none",
                            borderRadius: 6,
                            padding: "4px 8px",
                            fontSize: 11,
                          }}
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(ex)}
                          style={{
                            background: "#ffe6e6",
                            border: "none",
                            borderRadius: 6,
                            padding: "4px 8px",
                            fontSize: 11,
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {/* VIEW: 清算 */}
        {view === "settle" && (
          <section
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 12,
              marginBottom: 70,
            }}
          >
            <h2 style={{ fontSize: 14, marginBottom: 6 }}>
              清算（JPY換算で表示）
            </h2>
            {!settlement ? (
              <p style={{ fontSize: 12 }}>
                メンバーと支払いを入れると表示されます。
              </p>
            ) : (
              <>
                <h3 style={{ fontSize: 13, marginBottom: 4 }}>
                  各人の差額（+は受取・-は支払）
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {settlement.rows.map((r) => (
                    <li key={r.id} style={{ marginBottom: 4 }}>
                      {r.name}：支払 {r.paid.toLocaleString()} 円 / 本来{" "}
                      {r.owed.toLocaleString()} 円 →
                      {r.diff > 0 ? (
                        <span style={{ color: "green" }}>
                          {" "}
                          {r.diff.toLocaleString()} 円 受け取る
                        </span>
                      ) : r.diff < 0 ? (
                        <span style={{ color: "red" }}>
                          {" "}
                          {(-r.diff).toLocaleString()} 円 払う
                        </span>
                      ) : (
                        " ±0"
                      )}
                    </li>
                  ))}
                </ul>

                <h3 style={{ fontSize: 13, marginTop: 10, marginBottom: 4 }}>
                  支払い指示（この通りに送る）
                </h3>
                {settlement.transfers.length === 0 ? (
                  <p style={{ fontSize: 12 }}>すでにバランスが取れています。</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {settlement.transfers.map((t, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {t.from} → {t.to}：{t.amount.toLocaleString()} 円
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
