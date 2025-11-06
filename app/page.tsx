"use client";

import { useEffect, useMemo, useState } from "react";
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
  getDoc,
  where,
  setDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { inviteByLine } from "@/lib/invite";

/** ===================== 型 ===================== */
type Group = {
  id: string;
  name: string;
  ownerId?: string | null;
  memberUids?: string[];
  createdAt?: any;
};
type Member = {
  id: string; // ドキュメントID（= uid の場合もあり）
  name: string;
  uid?: string; // ある場合はLINEのuserId
};
type Expense = {
  id: string;
  title: string;
  amount: number;
  currency: "JPY" | "USD";
  paidBy: string; // member doc id
  participants: string[]; // member doc ids
  createdAt?: any;
};
type SettlementLine = { from: string; to: string; amount: number; currency: string };

/** ================================================= */

export default function Page() {
  // ログインユーザー（LIFF）
  const [myUid, setMyUid] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>("");

  // タブ
  const [activeTab, setActiveTab] = useState<"groups" | "members" | "add" | "list" | "settle">(
    "groups"
  );

  // グループ
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

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

  /** ================ LIFF 初期化（userId / displayName、?group） ================ */
  useEffect(() => {
    if (typeof window === "undefined") return;

    // ?group=xxx を拾っておく
    const url = new URL(window.location.href);
    const gid = url.searchParams.get("group");
    if (gid) setSelectedGroupId(gid);

    const start = async () => {
      const w = window as any;
      const ensureLiff = async () => {
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
        const liff = w.liff;
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        await liff.ready;
        return liff;
      };

      try {
        const liff = await ensureLiff();
        if (!liff.isLoggedIn?.()) {
          // LINE外ブラウザで開いたケースも考慮し、強制ログインはしない
          // （必要ならここで liff.login() へ）
        } else {
          const profile = await liff.getProfile();
          if (profile?.userId) setMyUid(profile.userId);
          if (profile?.displayName) {
            setMyName(profile.displayName);
            setMemberName((prev: string) => prev || profile.displayName);
          }
        }
      } catch (e) {
        console.warn("LIFF init error", e);
      }
    };

    start();
  }, []);

  /** ================ グループ一覧（自分が作成 or 参加のものだけ） ================ */
  useEffect(() => {
    if (!myUid) {
      setGroups([]);
      return;
    }

    const col = collection(db, "groups");

    // 自分がownerのグループ
    const qOwner = query(col, where("ownerId", "==", myUid));

    // 自分がメンバーのグループ（memberUids に含まれている）
    const qMember = query(col, where("memberUids", "array-contains", myUid));

    // 2つの購読をマージして重複排除
    const cache = new Map<string, Group>();

    const applySnapshot = (snap: any) => {
      snap.forEach((d: any) => {
        const data = d.data();
        cache.set(d.id, {
          id: d.id,
          name: data.name,
          ownerId: data.ownerId ?? null,
          memberUids: data.memberUids ?? [],
          createdAt: data.createdAt,
        });
      });
      // createdAt desc で整列
      const list = Array.from(cache.values()).sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setGroups(list);

      // まだ選択が無ければ先頭を選ぶ
      if (!selectedGroupId && list.length > 0) {
        setSelectedGroupId(list[0].id);
      }
    };

    const unsub1 = onSnapshot(qOwner, applySnapshot);
    const unsub2 = onSnapshot(qMember, applySnapshot);

    return () => {
      unsub1();
      unsub2();
    };
  }, [myUid, selectedGroupId]);

  /** ================ メンバー一覧（選択グループ） ================ */
  useEffect(() => {
    if (!selectedGroupId) {
      setMembers([]);
      return;
    }
    const q = query(
      collection(db, "groups", selectedGroupId, "members"),
      orderBy("joinedAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
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

  /** ================ 支払い一覧（選択グループ） ================ */
  useEffect(() => {
    if (!selectedGroupId) {
      setExpenses([]);
      return;
    }
    const q = query(
      collection(db, "groups", selectedGroupId, "expenses"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
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

  /** ================ Group 操作 ================ */
  const handleAddGroup = async () => {
    if (!groupName.trim()) return;
    // 作成者のみ閲覧できるよう ownerId を付与。自分をmemberUidsにも入れる
    const ref = await addDoc(collection(db, "groups"), {
      name: groupName.trim(),
      ownerId: myUid ?? null,
      memberUids: myUid ? [myUid] : [],
      createdAt: serverTimestamp(),
    });
    setGroupName("");

    // オーナーを members に登録（docId = myUid で上書き）
    if (myUid) {
      await setDoc(doc(db, "groups", ref.id, "members", myUid), {
        name: myName || "あなた",
        uid: myUid,
        joinedAt: serverTimestamp(),
      });
    }
  };

  /** グループに自分を参加（招待リンクから来た人向け） */
  const handleJoinSelf = async () => {
    if (!selectedGroupId || !myUid) return;
    // すでに入っていれば何もしない
    const mref = doc(db, "groups", selectedGroupId, "members", myUid);
    const m = await getDoc(mref);
    if (!m.exists()) {
      await setDoc(mref, {
        name: myName || "あなた",
        uid: myUid,
        joinedAt: serverTimestamp(),
      });
    }
    await updateDoc(doc(db, "groups", selectedGroupId), {
      memberUids: arrayUnion(myUid),
    });
    alert("このグループに参加しました！");
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

  /** ================ Members 操作 ================ */
  const handleAddMember = async () => {
    if (!selectedGroupId) return;
    if (!memberName.trim()) return;

    // 名前だけのメンバー（uidなし）
    await addDoc(collection(db, "groups", selectedGroupId, "members"), {
      name: memberName.trim(),
      joinedAt: serverTimestamp(),
    });
    setMemberName("");
  };

  /** メンバー削除（uidが付いていれば group.memberUids からも外す） */
  const handleDeleteMember = async (member: Member) => {
    if (!selectedGroupId) return;
    if (!confirm(`メンバー「${member.name}」を削除しますか？`)) return;
    await deleteDoc(doc(db, "groups", selectedGroupId, "members", member.id));

    // member.uid があれば memberUids からも除外
    const uidToRemove = member.uid ?? (member.id.startsWith("U") ? member.id : null);
    if (uidToRemove) {
      try {
        await updateDoc(doc(db, "groups", selectedGroupId), {
          memberUids: arrayRemove(uidToRemove),
        });
      } catch {}
    }
  };

  /** ================ Expense 操作 ================ */
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

  /** ================ UI ヘルパ ================ */
  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name ?? "(不明)";

  const currentGroup: Group | undefined = useMemo(
    () => groups.find((g) => g.id === selectedGroupId),
    [groups, selectedGroupId]
  );
  const amJoined = useMemo(() => {
    if (!myUid) return false;
    // group.memberUids に含まれている or members に自分のuid/docIdがある
    if (currentGroup?.memberUids?.includes(myUid)) return true;
    if (members.some((m) => m.uid === myUid || m.id === myUid)) return true;
    return false;
  }, [currentGroup, members, myUid]);

  // 精算
  const settlementsByCurrency = calcSettlements(members, expenses);

  /** ================ 招待 ================ */
  const handleInviteByLine = async () => {
    if (!selectedGroupId) return;
    const name = currentGroup?.name ?? "割り勘グループ";
    await inviteByLine(selectedGroupId, name);
  };

  /** =========================== JSX =========================== */
  return (
    <div className="min-h-screen bg-[#ECEEF0] flex justify-center">
      <div className="relative w-full max-w-md bg-white min-h-screen flex flex-col">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b">
          <div>
            <p className="text-sm font-semibold">割り勘だよ</p>
            <p className="text-[10px] text-gray-400">
              {currentGroup ? currentGroup.name : "グループを選んでください"}
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

              <p className="text-xs text-gray-500">あなたのグループ</p>
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
                    <button
                      className="flex-1 text-left"
                      onClick={() => {
                        setSelectedGroupId(g.id);
                        setActiveTab("members");
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span>{g.name}</span>
                        {g.ownerId === myUid && (
                          <span className="text-[10px] text-white bg-[#06C755] px-2 py-[2px] rounded-full">
                            オーナー
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400">{g.id}</div>
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteGroup(g.id)}
                        className="text-xs text-red-400"
                        title="グループ削除"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
                {groups.length === 0 && (
                  <p className="text-xs text-gray-400">
                    まだグループがありません（※自分が作成 or 参加しているものだけ表示されます）
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Members */}
          {activeTab === "members" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  対象グループ：{currentGroup?.name ?? "未選択"}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleInviteByLine}
                    className="text-[11px] bg-[#06C755]/10 text-[#06C755] px-3 py-1 rounded-lg"
                  >
                    LINEで招待
                  </button>
                </div>
              </div>

              {/* 参加ボタン（自分が未参加のときだけ表示） */}
              {!amJoined && myUid && (
                <div className="bg-white border rounded-lg p-3">
                  <p className="text-xs mb-2 text-gray-700">
                    このグループに参加するには、あなた（{myName || "あなた"}）をメンバーに追加してください。
                  </p>
                  <button
                    onClick={handleJoinSelf}
                    className="text-sm bg-[#06C755] text-white px-3 py-2 rounded-lg"
                  >
                    自分を参加させる
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="メンバー名（LINE名でもOK）"
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
                  <span
                    key={m.id}
                    className="bg-white border text-xs px-2 py-1 rounded-full flex items-center gap-2"
                  >
                    {m.name}
                    <button
                      onClick={() => handleDeleteMember(m)}
                      className="text-[11px] text-red-500 hover:underline"
                      title="このメンバーを削除"
                    >
                      ×
                    </button>
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
                        onChange={() => {
                          setSelectedParticipants((prev) =>
                            prev.includes(m.id)
                              ? prev.filter((x) => x !== m.id)
                              : [...prev, m.id]
                          );
                        }}
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

/** タブ */
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

/** 精算ロジック（通貨別） */
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
    let ci = 0,
      di = 0;
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


