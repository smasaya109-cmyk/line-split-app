"use client";

import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// 型
type Group = {
  id: string;
  name: string;
};

type Member = {
  id: string;
  name: string;
};

type Expense = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  paidBy: string;
  participants: string[];
};

export default function Page() {
  // UIタブ
  const [activeTab, setActiveTab] = useState<
    "groups" | "members" | "add" | "list"
  >("groups");

  // グループ関連
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // メンバー
  const [members, setMembers] = useState<Member[]>([]);
  const [memberName, setMemberName] = useState("");

  // 支払い
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<"JPY" | "USD">("JPY");
  const [paidBy, setPaidBy] = useState<string>("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);

  // 一覧
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // LIFFをCDNから読む（Vercelで落ちないやつ）
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).liff) {
      initLiff((window as any).liff);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.async = true;
    s.onload = () => {
      const liff = (window as any).liff;
      if (liff) initLiff(liff);
    };
    document.body.appendChild(s);
  }, []);

  const initLiff = async (liff: any) => {
    try {
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      const profile = await liff.getProfile();
      setMemberName(profile.displayName || "");
    } catch (e) {
      console.warn("LIFF init error", e);
    }
  };

  // グループ一覧
  useEffect(() => {
    const q = query(collection(db, "groups"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Group[] = [];
      snap.forEach((d) => list.push({ id: d.id, name: d.data().name }));
      setGroups(list);
      if (!selectedGroupId && list.length > 0) {
        setSelectedGroupId(list[0].id);
      }
    });
    return () => unsub();
  }, [selectedGroupId]);

  // メンバー一覧
  useEffect(() => {
    if (!selectedGroupId) return;
    const q = query(
      collection(db, "groups", selectedGroupId, "members"),
      orderBy("joinedAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: Member[] = [];
      snap.forEach((d) => list.push({ id: d.id, name: d.data().name }));
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
        });
      });
      setExpenses(list);
    });
    return () => unsub();
  }, [selectedGroupId]);

  // ---- アクション ----
  const handleAddGroup = async () => {
    if (!groupName.trim()) return;
    await addDoc(collection(db, "groups"), {
      name: groupName.trim(),
      createdAt: serverTimestamp(),
    });
    setGroupName("");
  };

  const handleAddMember = async () => {
    if (!selectedGroupId || !memberName.trim()) return;
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

    await addDoc(collection(db, "groups", selectedGroupId, "expenses"), {
      title: title.trim(),
      amount: Number(amount),
      currency,
      paidBy,
      participants: selectedParticipants,
      createdAt: serverTimestamp(),
    });

    setTitle("");
    setAmount(0);
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getMemberName = (id: string) => {
    const f = members.find((m) => m.id === id);
    return f ? f.name : "(不明)";
  };

  // ---- ここからUI ----
  return (
    <div className="min-h-screen bg-[#ECEEF0] flex justify-center">
      <div className="relative w-full max-w-md bg-white min-h-screen flex flex-col">
        {/* 上部ヘッダー */}
        <div className="h-14 flex items-center justify-between px-4 border-b">
          <div>
            <p className="text-sm font-semibold">割り勘だよ</p>
            <p className="text-[10px] text-gray-400">
              {selectedGroupId
                ? groups.find((g) => g.id === selectedGroupId)?.name
                : "グループを選んでください"}
            </p>
          </div>
          <div className="text-[10px] text-gray-400">
            {selectedGroupId ? "● online" : "offline"}
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto pb-20 px-4 pt-4 bg-[#F5F7F8]">
          {/* タブごとの中身 */}
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
                  <button
                    key={g.id}
                    onClick={() => {
                      setSelectedGroupId(g.id);
                      setActiveTab("members");
                    }}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-3 text-sm ${
                      selectedGroupId === g.id
                        ? "bg-[#E9FFF1] text-[#0F172A]"
                        : "bg-white text-gray-700"
                    }`}
                  >
                    <span>{g.name}</span>
                    <span className="text-[10px] text-gray-400">{g.id}</span>
                  </button>
                ))}
                {groups.length === 0 && (
                  <p className="text-xs text-gray-400">
                    まだグループがありません
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "members" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                対象グループ：
                {groups.find((g) => g.id === selectedGroupId)?.name ??
                  "未選択"}
              </p>
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
                  <span
                    key={m.id}
                    className="bg-white border text-xs px-3 py-1 rounded-full"
                  >
                    {m.name}
                  </span>
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-gray-400">
                    このグループにはまだメンバーがいません
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "add" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">支払いを登録</p>
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
                  onChange={(e) =>
                    setCurrency(e.target.value as "JPY" | "USD")
                  }
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
                    <p className="text-xs text-gray-400">
                      先にメンバーを追加してください
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleAddExpense}
                className="w-full bg-[#06C755] text-white py-2 rounded-lg text-sm"
              >
                登録する
              </button>
            </div>
          )}

          {activeTab === "list" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">支払い一覧</p>
              <div className="space-y-2">
                {expenses.map((ex) => (
                  <div
                    key={ex.id}
                    className="bg-white rounded-lg p-3 border flex flex-col gap-1"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{ex.title}</span>
                      <span>
                        {ex.amount.toLocaleString()} {ex.currency}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      支払: {getMemberName(ex.paidBy)}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      割る人:{" "}
                      {ex.participants
                        .map((id) => getMemberName(id))
                        .join("・")}
                    </p>
                  </div>
                ))}
                {expenses.length === 0 && (
                  <p className="text-xs text-gray-400">
                    まだ支払いが登録されていません
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 下タブ（固定） */}
        <div className="h-14 bg-white border-t flex">
          <TabItem
            label="グループ"
            active={activeTab === "groups"}
            onClick={() => setActiveTab("groups")}
          />
          <TabItem
            label="メンバー"
            active={activeTab === "members"}
            onClick={() => setActiveTab("members")}
          />
          <TabItem
            label="追加"
            active={activeTab === "add"}
            onClick={() => setActiveTab("add")}
          />
          <TabItem
            label="履歴"
            active={activeTab === "list"}
            onClick={() => setActiveTab("list")}
          />
        </div>
      </div>
    </div>
  );
}

// 下タブ用の小コンポーネント
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

  