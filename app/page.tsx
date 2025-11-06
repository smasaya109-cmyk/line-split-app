// app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { signInWithCustomToken, onAuthStateChanged } from "firebase/auth";

// ====== 型 ======
type Group = { id: string; name: string; ownerUid: string; memberUids?: string[]; createdAt?: any };
type Member = { id: string; name: string; uid?: string; joinedAt?: any };
type Expense = {
  id: string;
  title: string;
  amount: number;
  currency: "JPY" | "USD";
  paidBy: string; // members subcollection の document id（uidベース推奨）
  participants: string[]; // 同上
  createdAt?: any;
};
type SettlementLine = { from: string; to: string; amount: number; currency: string };

// ====== 画面状態 ======
export default function Page() {
  // タブ
  const [activeTab, setActiveTab] = useState<"groups" | "members" | "add" | "list" | "settle">(
    "groups"
  );

  // サインイン情報
  const [uid, setUid] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");

  // グループ
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  // メンバー
  const [members, setMembers] = useState<Member[]>([]);
  const [memberName, setMemberName] = useState("");

  // 支払い
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<"JPY" | "USD">("JPY");
  const [paidBy, setPaidBy] = useState<string>("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // ====== 認証（LIFF → Firebase Custom Token） ======
  useEffect(() => {
    const start = async () => {
      if (typeof window === "undefined") return;

      // 1) LIFF SDK用意
      const ensureLiff = async () => {
        const w = window as any;
        if (!w.liff) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
            s.async = true;
            s.onload = () => res();
            s.onerror = () => rej(new Error("LIFF SDK load failed"));
            document.body.appendChild(s);
          });
        }
        return w.liff;
      };

      // 2) 初期化
      const liff = await ensureLiff();
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! }).catch(() => {});
      await liff?.ready;

      // 3) LINEログイン
      if (!liff.isLoggedIn?.()) {
        liff.login?.({ redirectUri: window.location.href });
        return;
      }

      // 4) 表示名
      try {
        const profile = await liff.getProfile();
        setDisplayName(profile?.displayName || "");
        // メンバー追加用のデフォルトを自分の名前に
        setMemberName(profile?.displayName || "");
      } catch {}

      // 5) Firebaseへサインイン（カスタムトークン）
      try {
        const idToken = liff.getIDToken?.();
        if (!idToken) {
          // 念のためリトライ
          liff.login?.({ redirectUri: window.location.href });
          return;
        }

        const res = await fetch("/api/firebaseCustomToken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "token issue");

        await signInWithCustomToken(auth, data.token);
      } catch (e) {
        console.warn("Firebase custom auth failed", e);
      }
    };

    start();
  }, []);

  // Firebaseサインイン状態を監視
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
    });
    return () => unsub();
  }, []);

  // ====== 招待リンクでの自動参加 ======
  useEffect(() => {
    const joinIfInvited = async () => {
      if (!uid) return;
      if (!selectedGroupId) return;
      if (typeof window === "undefined") return;

      const url = new URL(window.location.href);
      const inviteFlag = url.searchParams.get("invite");
      if (!inviteFlag) return;

      // groups/{id} に自分の uid を追加、members サブコレクションにも登録
      const gref = doc(db, "groups", selectedGroupId);
      const gdoc = await getDoc(gref);
      if (!gdoc.exists()) return;

      const gdata = gdoc.data() as Group;

      // 既に参加済みならスキップ
      const list = gdata.memberUids || [];
      if (list.includes(uid)) return;

      await updateDoc(gref, { memberUids: arrayUnion(uid) });

      // members/{uid} を name: displayName で作成（なければ）
      const mref = doc(db, "groups", selectedGroupId, "members", uid);
      const md = await getDoc(mref);
      if (!md.exists()) {
        await setDoc(mref, {
          name: displayName || "ユーザー",
          uid,
          joinedAt: serverTimestamp(),
        });
      }
      alert("グループに参加しました！");
    };

    joinIfInvited();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, selectedGroupId]);

  // URLの group パラメータで選択
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const groupFromQuery = url.searchParams.get("group");
    if (groupFromQuery) setSelectedGroupId(groupFromQuery);
  }, []);

  // ====== グループ一覧（自分がowner or memberのものだけ） ======
  useEffect(() => {
    if (!uid) return;

    const col = collection(db, "groups");

    // 自分が owner のグループ
    const qOwner = query(col, where("ownerUid", "==", uid));
    const unsubOwner = onSnapshot(qOwner, (snap) => {
      const owned: Group[] = [];
      snap.forEach((d) =>
        owned.push({ id: d.id, ...(d.data() as any) })
      );
      mergeGroups(owned);
    });

    // 自分が memberUids に含まれるグループ
    const qMember = query(col, where("memberUids", "array-contains", uid));
    const unsubMember = onSnapshot(qMember, (snap) => {
      const joined: Group[] = [];
      snap.forEach((d) =>
        joined.push({ id: d.id, ...(d.data() as any) })
      );
      mergeGroups(joined);
    });

    // メモリにマージ（重複除去）
    const mergeGroups = (incoming: Group[]) => {
      setGroups((prev) => {
        const map = new Map<string, Group>();
        [...prev, ...incoming].forEach((g) => map.set(g.id, g));
        const arr = Array.from(map.values());
        // 新しい順に（createdAtが無い場合は末尾）
        arr.sort((a, b) => {
          const ta = (a.createdAt?.toMillis?.() ?? 0);
          const tb = (b.createdAt?.toMillis?.() ?? 0);
          return tb - ta;
        });
        // 初回選択
        if (!selectedGroupId && arr.length > 0) setSelectedGroupId(arr[0].id);
        return arr;
      });
    };

    return () => {
      unsubOwner();
      unsubMember();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // ====== メンバー一覧 ======
  useEffect(() => {
    if (!selectedGroupId) return;
    const q = query(collection(db, "groups", selectedGroupId, "members"), orderBy("joinedAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Member[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setMembers(list);
      if (list.length > 0 && !paidBy) setPaidBy(list[0].id);
      if (list.length > 0 && selectedParticipants.length === 0) {
        setSelectedParticipants(list.map((m) => m.id));
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  // ====== 支払い一覧 ======
  useEffect(() => {
    if (!selectedGroupId) return;
    const q = query(collection(db, "groups", selectedGroupId, "expenses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Expense[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setExpenses(list);
    });
    return () => unsub();
  }, [selectedGroupId]);

  // ====== 操作 ======
  const handleAddGroup = async () => {
    if (!uid) {
      alert("LINEでログインしてください");
      return;
    }
    if (!groupName.trim()) return;

    const gref = await addDoc(collection(db, "groups"), {
      name: groupName.trim(),
      ownerUid: uid,
      memberUids: [uid], // 自分をメンバーに含める
      createdAt: serverTimestamp(),
    });
    // members/{uid} に自分を入れる
    await setDoc(doc(db, "groups", gref.id, "members", uid), {
      name: displayName || "ユーザー",
      uid,
      joinedAt: serverTimestamp(),
    });

    setGroupName("");
    setSelectedGroupId(gref.id);
    setActiveTab("members");
  };

  const handleSaveGroupName = async (groupId: string) => {
    if (!editingGroupName.trim()) {
      setEditingGroupId(null);
      return;
    }
    // ルール側で owner のみ許可
    await updateDoc(doc(db, "groups", groupId), { name: editingGroupName.trim() });
    setEditingGroupId(null);
    setEditingGroupName("");
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("このグループを削除しますか？メンバー・支払いも消えます。")) return;

    // サブコレクション削除
    const membersSnap = await getDocs(collection(db, "groups", groupId, "members"));
    for (const m of membersSnap.docs) await deleteDoc(m.ref);
    const expensesSnap = await getDocs(collection(db, "groups", groupId, "expenses"));
    for (const e of expensesSnap.docs) await deleteDoc(e.ref);

    await deleteDoc(doc(db, "groups", groupId));

    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setMembers([]);
      setExpenses([]);
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroupId) return;
    if (!memberName.trim()) return;

    // ここで追加するのは「表示名」のみ。
    // 実際のアクセス権は「招待リンクで参加」時に memberUids に uid を追加。
    await addDoc(collection(db, "groups", selectedGroupId, "members"), {
      name: memberName.trim(),
      joinedAt: serverTimestamp(),
    });
    setMemberName("");
  };

  const handleAddExpense = async () => {
    if (!selectedGroupId) return;
    if (!title.trim()) return;
    if (!amount || amount <= 0) return;
    if (!paidBy) return;
    if (selectedParticipants.length === 0) return;

    const base = {
      title: title.trim(),
      amount: Number(amount),
      currency,
      paidBy,
      participants: selectedParticipants,
    };

    if (editingExpenseId) {
      await updateDoc(doc(db, "groups", selectedGroupId, "expenses", editingExpenseId), base);
      setEditingExpenseId(null);
    } else {
      await addDoc(collection(db, "groups", selectedGroupId, "expenses"), {
        ...base,
        createdAt: serverTimestamp(),
      });
    }
    setTitle("");
    setAmount(0);
  };

  const handleEditExpense = (ex: Expense) => {
    setEditingExpenseId(ex.id);
    setTitle(ex.title);
    setAmount(ex.amount);
    setCurrency(ex.currency);
    setPaidBy(ex.paidBy);
    setSelectedParticipants(ex.participants);
    setActiveTab("add");
  };

  const handleDeleteExpense = async (ex: Expense) => {
    if (!selectedGroupId) return;
    if (!confirm("この支払いを削除しますか？")) return;
    await deleteDoc(doc(db, "groups", selectedGroupId, "expenses", ex.id));
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name ?? "(不明)";

  // ====== 精算計算 ======
  const settlementsByCurrency = useMemo(() => calcSettlements(members, expenses), [members, expenses]);

  // ====== UI ======
  return (
    <div className="min-h-screen bg-[#ECEEF0] flex justify-center">
      <div className="relative w-full max-w-md bg-white min-h-screen flex flex-col">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b">
          <div>
            <p className="text-sm font-semibold">割り勘だよ</p>
            <p className="text-[10px] text-gray-400">
              {selectedGroupId
                ? groups.find((g) => g.id === selectedGroupId)?.name
                : "グループを選んでください"}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto pb-20 px-4 pt-4 bg-[#F5F7F8]">
          {/* 認証未済の案内 */}
          {!uid && (
            <div className="mb-3 text-xs text-yellow-700 bg-yellow-50 border border-yellow-100 rounded px-3 py-2">
              LINEでログインするとグループが表示されます。
            </div>
          )}

          {/* Groups */}
          {activeTab === "groups" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">グループを追加</p>
              <div className="flex gap-2">
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="例）11/3 大阪飲み会"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                />
                <button
                  onClick={handleAddGroup}
                  className="bg-[#06C755] text-white px-4 py-2 rounded-lg text-sm"
                >
                  追加
                </button>
              </div>

              <p className="text-xs text-gray-500">あなたに関係あるグループ</p>
              <div className="space-y-2">
                {groups.map((g) => (
                  <div
                    key={g.id}
                    className={`w-full rounded-xl px-3 py-3 text-sm flex items-center justify-between gap-2 ${
                      selectedGroupId === g.id
                        ? "bg-[#E9FFF1] text-[#0F172A]"
                        : "bg-white text-gray-700"
                    }`}
                  >
                    {editingGroupId === g.id ? (
                      <>
                        <input
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          className="flex-1 border rounded px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => handleSaveGroupName(g.id)}
                          className="text-xs bg-[#06C755] text-white px-2 py-1 rounded"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => {
                            setEditingGroupId(null);
                            setEditingGroupName("");
                          }}
                          className="text-xs text-gray-400"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="flex-1 text-left"
                          onClick={() => {
                            setSelectedGroupId(g.id);
                            setActiveTab("members");
                          }}
                        >
                          <div>{g.name}</div>
                          <div className="text-[10px] text-gray-400">{g.id}</div>
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (g.ownerUid !== uid) {
                                alert("グループ名の変更は作成者のみ可能です。");
                                return;
                              }
                              setEditingGroupId(g.id);
                              setEditingGroupName(g.name);
                            }}
                            className="text-xs text-gray-400"
                          >
                            ✏
                          </button>
                          {g.ownerUid === uid && (
                            <button
                              onClick={() => handleDeleteGroup(g.id)}
                              className="text-xs text-red-400"
                            >
                              削除
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {groups.length === 0 && (
                  <p className="text-xs text-gray-400">まだ表示できるグループがありません</p>
                )}
              </div>
            </div>
          )}

          {/* Members */}
          {activeTab === "members" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  対象グループ：
                  {groups.find((g) => g.id === selectedGroupId)?.name ?? "未選択"}
                </p>
                {/* 招待ボタン（以前の inviteByLine を使っている場合はそのまま呼び出し） */}
                <button
                  onClick={async () => {
                    const g = groups.find((x) => x.id === selectedGroupId);
                    if (!g) return;
                    const { inviteByLine } = await import("@/lib/invite");
                    await inviteByLine(g.id, g.name);
                  }}
                  className="text-[11px] bg-[#06C755]/10 text-[#06C755] px-3 py-1 rounded-lg"
                >
                  LINEで招待
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="メンバー名（表示用）"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                />
                <button
                  onClick={handleAddMember}
                  className="bg-[#06C755] text-white px-4 py-2 rounded-lg text-sm"
                >
                  追加
                </button>
              </div>

              <p className="text-xs text-gray-500">メンバー一覧</p>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <span key={m.id} className="bg-white border text-xs px-3 py-1 rounded-full">
                    {m.name}
                  </span>
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-gray-400">このグループにはまだメンバーがいません</p>
                )}
              </div>
            </div>
          )}

          {/* Add expense */}
          {activeTab === "add" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                {editingExpenseId ? "支払いを編集" : "支払いを登録"}
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ランチ / タクシー / ホテル"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount ? amount : ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="4000"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "JPY" | "USD")}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="JPY">JPY</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              <div className="space-y-1 bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">支払った人</p>
                <select
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">割るメンバー</p>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedParticipants.includes(m.id)}
                        onChange={() => toggleParticipant(m.id)}
                      />
                      {m.name}
                    </label>
                  ))}
                  {members.length === 0 && (
                    <p className="text-xs text-gray-400">先にメンバーを追加してください</p>
                  )}
                </div>
              </div>

              <button
                onClick={handleAddExpense}
                className="w-full bg-[#06C755] text-white py-2 rounded-lg text-sm"
              >
                {editingExpenseId ? "更新する" : "登録する"}
              </button>
              {editingExpenseId && (
                <button
                  onClick={() => {
                    setEditingExpenseId(null);
                    setTitle("");
                    setAmount(0);
                  }}
                  className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg text-sm"
                >
                  編集をやめる
                </button>
              )}
            </div>
          )}

          {/* List */}
          {activeTab === "list" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">支払い一覧</p>
              <div className="space-y-2">
                {expenses.map((ex) => (
                  <div
                    key={ex.id}
                    className="bg-white rounded-lg p-3 border flex justify-between gap-2"
                  >
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{ex.title}</span>
                        <span className="text-sm">
                          {ex.amount.toLocaleString()} {ex.currency}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400">支払: {getMemberName(ex.paidBy)}</p>
                      <p className="text-[11px] text-gray-400">
                        割る人: {ex.participants.map((id) => getMemberName(id)).join("・")}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleEditExpense(ex)}
                        className="text-[11px] bg-[#E9FFF1] text-[#06C755] px-2 py-1 rounded"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDeleteExpense(ex)}
                        className="text-[11px] bg-red-50 text-red-500 px-2 py-1 rounded"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
                {expenses.length === 0 && (
                  <p className="text-xs text-gray-400">まだ支払いが登録されていません</p>
                )}
              </div>
            </div>
          )}

          {/* Settle */}
          {activeTab === "settle" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">精算（誰が誰にいくら払うか）</p>
              {Object.keys(settlementsByCurrency).length === 0 && (
                <p className="text-xs text-gray-400">支払いデータが少ないので計算できません</p>
              )}
              {Object.entries(settlementsByCurrency).map(([cur, lines]) => (
                <div key={cur} className="bg-white rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">通貨: {cur}</p>
                  {lines.length === 0 ? (
                    <p className="text-xs text-gray-400">精算は不要です</p>
                  ) : (
                    lines.map((line, i) => (
                      <div key={i} className="text-sm flex justify-between gap-2">
                        <span>
                          {getMemberName(line.from)} → {getMemberName(line.to)}
                        </span>
                        <span className="font-medium">
                          {line.amount.toLocaleString()} {line.currency}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="h-14 bg-white border-t flex">
          <TabItem label="グループ" active={activeTab === "groups"} onClick={() => setActiveTab("groups")} />
          <TabItem label="メンバー" active={activeTab === "members"} onClick={() => setActiveTab("members")} />
          <TabItem label="追加" active={activeTab === "add"} onClick={() => setActiveTab("add")} />
          <TabItem label="履歴" active={activeTab === "list"} onClick={() => setActiveTab("list")} />
          <TabItem label="精算" active={activeTab === "settle"} onClick={() => setActiveTab("settle")} />
        </div>
      </div>
    </div>
  );
}

function TabItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-xs flex items-center justify-center ${
        active ? "text-[#06C755] font-semibold" : "text-gray-400"
      }`}
    >
      {label}
    </button>
  );
}

// ====== 精算 ======
function calcSettlements(members: Member[], expenses: Expense[]): Record<string, SettlementLine[]> {
  if (members.length === 0 || expenses.length === 0) return {};
  const balances: Record<string, Record<string, number>> = {};

  for (const ex of expenses) {
    const cur = ex.currency;
    if (!balances[cur]) balances[cur] = {};
    for (const m of members) if (balances[cur][m.id] === undefined) balances[cur][m.id] = 0;

    balances[cur][ex.paidBy] += ex.amount;

    const share = ex.amount / ex.participants.length;
    for (const pid of ex.participants) balances[cur][pid] -= share;
  }

  const result: Record<string, SettlementLine[]> = {};
  for (const [cur, bal] of Object.entries(balances)) {
    const creditors: { id: string; amt: number }[] = [];
    const debtors: { id: string; amt: number }[] = [];

    for (const [mid, vRaw] of Object.entries(bal)) {
      const v = Math.round(vRaw * 100) / 100;
      if (v > 0.01) creditors.push({ id: mid, amt: v });
      else if (v < -0.01) debtors.push({ id: mid, amt: -v });
    }

    const lines: SettlementLine[] = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const c = creditors[ci];
      const d = debtors[di];
      const pay = Math.min(c.amt, d.amt);

      lines.push({ from: d.id, to: c.id, amount: Math.round(pay), currency: cur });

      c.amt -= pay;
      d.amt -= pay;

      if (c.amt < 0.01) ci++;
      if (d.amt < 0.01) di++;
    }
    result[cur] = lines;
  }
  return result;
}


