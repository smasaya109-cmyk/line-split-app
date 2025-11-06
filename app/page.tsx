// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  where,
} from "firebase/firestore";
import { signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { inviteByLine } from "@/lib/invite";

type Group = { id: string; name: string };
type Member = { id: string; name: string; uid?: string };
type Expense = {
  id: string;
  title: string;
  amount: number;     // 画面上の単位（JPY=円, USD=ドル）
  currency: string;   // "JPY" | "USD" など
  paidBy: string;     // members/{id}
  participants: string[];
  createdAt?: any;
};
type SettlementLine = { from: string; to: string; amount: number; currency: string };

const ADD_FRIEND_URL = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL || "";

export default function Page() {
  const [activeTab, setActiveTab] =
    useState<"groups" | "members" | "add" | "list" | "settle">("groups");

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  const [members, setMembers] = useState<Member[]>([]);
  const [memberName, setMemberName] = useState("");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<"JPY" | "USD">("JPY");
  const [paidBy, setPaidBy] = useState<string>("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const [isFriend, setIsFriend] = useState<boolean | null>(null);
  const [isInvite, setIsInvite] = useState(false);

  // auth の uid を state 化
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u ? u.uid : null)), []);

  // 初期化（LIFF 強制ログイン → Firebase サインイン）
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const groupFromQuery = url.searchParams.get("group");
    const inviteFromQuery = url.searchParams.get("invite");
    if (groupFromQuery) setSelectedGroupId(groupFromQuery);
    if (inviteFromQuery === "1") setIsInvite(true);

    const start = async () => {
      const liff = (window as any).liff;
      if (!liff) return;

      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        await liff.ready;

        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        try {
          const fr = await liff.getFriendship();
          setIsFriend(!!fr?.friendFlag);
        } catch { setIsFriend(null); }

        try {
          const profile = await liff.getProfile();
          setMemberName(profile.displayName || "");
        } catch {}

        const idToken = await liff.getIDToken?.();
        if (!idToken) {
          alert("LINEログインに失敗しました。LIFF設定（NEXT_PUBLIC_LIFF_ID）を確認してください。");
          return;
        }
        try {
          const r = await fetch("/api/auth/line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
          const { customToken, error, detail } = await r.json();
          if (!r.ok || !customToken) throw new Error(error || JSON.stringify(detail));
          await signInWithCustomToken(auth, customToken);
        } catch (e) {
          console.error(e);
          alert("Firebaseサインインに失敗しました。/api/auth/line と環境変数を確認してください。");
        }
      } catch (e) {
        console.warn("LIFF init error", e);
      }
    };

    if ((window as any).liff) {
      start();
    } else {
      const s = document.createElement("script");
      s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      s.async = true;
      s.onload = start;
      document.body.appendChild(s);
    }
  }, []);

  // グループ一覧（visibleTo に自分の uid を含むもののみ）。インデックス未作成時フォールバック
  useEffect(() => {
    if (!uid) return;

    const base = query(collection(db, "groups"), where("visibleTo", "array-contains", uid));
    const withOrder = query(base, orderBy("createdAt", "desc"));

    const handleSnap = (snap: any) => {
      const list: Group[] = [];
      snap.forEach((d: any) => list.push({ id: d.id, name: (d.data() as any).name }));
      setGroups(list);
      if (!selectedGroupId && list.length > 0) setSelectedGroupId(list[0].id);
    };

    let unsub = onSnapshot(
      withOrder,
      handleSnap,
      (err) => {
        if (String((err as any)?.code).includes("failed-precondition")) {
          unsub?.();
          unsub = onSnapshot(base, handleSnap, (e) => console.error("groups subscribe error:", e));
        } else {
          console.error("groups subscribe error:", err);
        }
      }
    );

    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // メンバー一覧
  useEffect(() => {
    if (!selectedGroupId) return;
    const qy = query(
      collection(db, "groups", selectedGroupId, "members"),
      orderBy("joinedAt", "asc")
    );
    const unsub = onSnapshot(qy, (snap) => {
      const list: Member[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({ id: d.id, name: data.name, uid: data.uid });
      });
      setMembers(list);
      if (list.length > 0 && !paidBy) setPaidBy(list[0].id);
      if (list.length > 0 && selectedParticipants.length === 0) {
        setSelectedParticipants(list.map((m) => m.id));
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  // 支払い一覧
  useEffect(() => {
    if (!selectedGroupId) return;
    const qy = query(
      collection(db, "groups", selectedGroupId, "expenses"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(qy, (snap) => {
      const list: Expense[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({
          id: d.id,
          title: data.title,
          amount: data.amount,
          currency: data.currency,
          paidBy: data.paidBy,
          participants: data.participants || [],
          createdAt: data.createdAt,
        });
      });
      setExpenses(list);
    });
    return () => unsub();
  }, [selectedGroupId]);

  const myUid = uid;
  const isJoined =
    !!myUid && members.some((m) => m.id === myUid || m.uid === myUid);

  // === グループ作成 ===
  const handleAddGroup = async () => {
    if (!groupName.trim()) return;
    if (!auth.currentUser) {
      alert("未サインインです。LINEログイン設定を確認してください。");
      return;
    }
    try {
      await addDoc(collection(db, "groups"), {
        name: groupName.trim(),
        ownerId: auth.currentUser.uid,
        visibleTo: [auth.currentUser.uid],
        createdAt: serverTimestamp(),
      });
      setGroupName("");
    } catch (e: any) {
      console.error(e);
      alert(`グループ作成に失敗: ${e?.code || ""} ${e?.message || e}`);
    }
  };

  const handleSaveGroupName = async (groupId: string) => {
    if (!editingGroupName.trim()) {
      setEditingGroupId(null);
      return;
    }
    await updateDoc(doc(db, "groups", groupId), { name: editingGroupName.trim() });
    setEditingGroupId(null);
    setEditingGroupName("");
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("このグループを削除しますか？メンバー・支払いも消えます。")) return;
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

  // メンバー手動追加
  const handleAddMember = async () => {
    if (!selectedGroupId) return;
    if (!memberName.trim()) return;
    await addDoc(collection(db, "groups", selectedGroupId, "members"), {
      name: memberName.trim(),
      joinedAt: serverTimestamp(),
    });
    setMemberName("");
  };

  // 支払い追加/更新
  const handleAddExpense = async () => {
    if (!selectedGroupId) return;
    if (!title.trim()) return;
    if (!amount || amount <= 0) return;
    if (!paidBy) return;
    if (selectedParticipants.length === 0) return;

    if (editingExpenseId) {
      await updateDoc(doc(db, "groups", selectedGroupId, "expenses", editingExpenseId), {
        title: title.trim(),
        amount: Number(amount),
        currency,
        paidBy,
        participants: selectedParticipants,
      });
      setEditingExpenseId(null);
    } else {
      await addDoc(collection(db, "groups", selectedGroupId, "expenses"), {
        title: title.trim(),
        amount: Number(amount),
        currency,
        paidBy,
        participants: selectedParticipants,
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
    setCurrency(ex.currency as "JPY" | "USD");
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

  // ====== ★ 精算（整数の最小通貨単位で厳密計算） ======
  const settlementsByCurrency = calcSettlementsStrict(members, expenses);

  // 共有（LINE / WebShare / クリップボード）
  const shareSettlement = async () => {
    const linesText: string[] = [];
    for (const [cur, lines] of Object.entries(settlementsByCurrency)) {
      if (!lines || lines.length === 0) continue;
      linesText.push(`【通貨: ${cur}】`);
      for (const l of lines) {
        linesText.push(
          `${getMemberName(l.from)} → ${getMemberName(l.to)} : ${formatCurrency(cur, l.amount)}`
        );
      }
    }
    const text = linesText.length
      ? `精算結果\n${linesText.join("\n")}`
      : "精算は不要です";

    const liff = (globalThis as any).liff;
    if (liff?.isApiAvailable?.("shareTargetPicker")) {
      try { await liff.shareTargetPicker([{ type: "text", text }]); return; } catch {}
    }
    if (navigator.share) {
      try { await navigator.share({ title: "精算結果", text }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); alert("精算内容をコピーしました"); }
    catch { alert(text); }
  };

  const handleAddFriendClick = () => {
    const url = ADD_FRIEND_URL || "https://lin.ee/xxxxx";
    const liff = (window as any).liff;
    if (liff?.openWindow) liff.openWindow({ url, external: true });
    else window.open(url, "_blank");
  };

  const handleJoinGroup = async () => {
    if (!auth.currentUser || !selectedGroupId) return;
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch("/api/groups/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ groupId: selectedGroupId, displayName: memberName }),
      });
    } catch (e) {
      console.warn("join group failed", e);
    }
  };

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

              <p className="text-xs text-gray-500">グループ一覧</p>
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
                              setEditingGroupId(g.id);
                              setEditingGroupName(g.name);
                            }}
                            className="text-xs text-gray-400"
                          >
                            ✏
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(g.id)}
                            className="text-xs text-red-400"
                          >
                            削除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {groups.length === 0 && (
                  <p className="text-xs text-gray-400">まだグループがありません</p>
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
                <button
                  onClick={handleInviteByLine}
                  className="text-[11px] bg-[#06C755]/10 text-[#06C755] px-3 py-1 rounded-lg"
                >
                  LINEで招待
                </button>
              </div>

              {/* 招待受諾ボタン（invite=1 かつ未参加時のみ） */}
              {isInvite && !!selectedGroupId && !!myUid && !isJoined && (
                <div className="p-3 rounded-lg bg-white border">
                  <p className="text-xs text-gray-600 mb-2">
                    このグループにまだ参加していません。参加しますか？
                  </p>
                  <button
                    onClick={handleJoinGroup}
                    className="text-sm w-full bg-[#06C755] text-white py-2 rounded-lg"
                  >
                    このグループに参加する
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="ささき / LINEの名前"
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
                    {myUid && (m.id === myUid || m.uid === myUid) && (
                      <span className="ml-1 text-[10px] text-[#06C755]">(あなた)</span>
                    )}
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

              <div className="space-y-1 bg白 rounded-lg p-3">
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
                          {formatCurrency(ex.currency, ex.amount)}
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
                  {(!lines || lines.length === 0) ? (
                    <p className="text-xs text-gray-400">精算は不要です</p>
                  ) : (
                    lines.map((line, i) => (
                      <div key={i} className="text-sm flex justify-between gap-2">
                        <span>
                          {getMemberName(line.from)} → {getMemberName(line.to)}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(cur, line.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ))}

              {/* アクション：共有 & 友だち追加 */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={shareSettlement}
                  className="text-[12px] px-3 py-2 rounded-lg bg-[#06C755] text-white"
                >
                  精算内容を共有
                </button>
                {isFriend === false && (
                  <button
                    onClick={handleAddFriendClick}
                    className="text-[12px] px-3 py-2 rounded-lg border border-[#06C755] text-[#06C755] bg-white"
                    title="公式LINEを友だち追加すると招待や共有がスムーズになります"
                  >
                    公式LINEを友だち追加
                  </button>
                )}
              </div>
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

/** 表示用フォーマッタ（JPYは小数なし、USD等は小数2桁） */
function formatCurrency(cur: string, amount: number) {
  const digits = cur === "JPY" ? 0 : 2;
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${cur}`;
}

/** ★ 精算の厳密計算（整数の最小通貨単位で計算） */
function calcSettlementsStrict(
  members: Member[],
  expenses: Expense[]
): Record<string, SettlementLine[]> {
  if (members.length === 0 || expenses.length === 0) return {};

  const balances: Record<string, Record<string, number>> = {}; // cur -> memberId -> balance in minor unit
  const prec = (cur: string) => (cur === "JPY" ? 0 : 2);
  const factor = (cur: string) => Math.pow(10, prec(cur));

  for (const ex of expenses) {
    const cur = ex.currency;
    const f = factor(cur);
    if (!balances[cur]) balances[cur] = {};
    for (const m of members) if (balances[cur][m.id] === undefined) balances[cur][m.id] = 0;

    const amtMinor = Math.round(Number(ex.amount) * f);

    // 支払った人は＋
    balances[cur][ex.paidBy] += amtMinor;

    // 参加者に均等割（余りは先頭から1ずつ配る）
    const n = ex.participants.length;
    if (n > 0) {
      const share = Math.floor(amtMinor / n);
      let rest = amtMinor - share * n;
      for (const pid of ex.participants) {
        const plus = rest > 0 ? 1 : 0;
        balances[cur][pid] -= (share + plus);
        if (rest > 0) rest--;
      }
    }
  }

  const result: Record<string, SettlementLine[]> = {};
  for (const [cur, bal] of Object.entries(balances)) {
    const f = factor(cur);
    const creditors: { id: string; amt: number }[] = [];
    const debtors: { id: string; amt: number }[] = [];

    for (const [mid, v] of Object.entries(bal)) {
      if (v > 0) creditors.push({ id: mid, amt: v });
      else if (v < 0) debtors.push({ id: mid, amt: -v });
    }

    // 値がない場合は空配列
    if (creditors.length === 0 || debtors.length === 0) {
      result[cur] = [];
      continue;
    }

    // 大きい順にすると回数が減りやすい
    creditors.sort((a, b) => b.amt - a.amt);
    debtors.sort((a, b) => b.amt - a.amt);

    const lines: SettlementLine[] = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const c = creditors[ci];
      const d = debtors[di];
      const payMinor = Math.min(c.amt, d.amt); // 最小単位整数で厳密
      const pay = payMinor / f;

      lines.push({ from: d.id, to: c.id, amount: pay, currency: cur });

      c.amt -= payMinor;
      d.amt -= payMinor;
      if (c.amt === 0) ci++;
      if (d.amt === 0) di++;
    }
    result[cur] = lines;
  }
  return result;
}
