"use client";

import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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
  paidBy: string; // memberId
  participants: string[]; // memberId[]
  createdAt?: any;
};

export default function Page() {
  // 全体
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

  // 支払一覧
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // ① LINEのSDKをブラウザでだけ読み込む
  useEffect(() => {
    if (typeof window === "undefined") return;

    // すでに読み込み済みなら何もしない
    if ((window as any).liff) {
      initLiff((window as any).liff);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.async = true;
    script.onload = () => {
      const liff = (window as any).liff;
      if (liff) {
        initLiff(liff);
      }
    };
    document.body.appendChild(script);
  }, []);

  // LIFF初期化
  const initLiff = async (liff: any) => {
    try {
      await liff.init({
        liffId: process.env.NEXT_PUBLIC_LIFF_ID!, // Vercelの環境変数に入れておく
      });

      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }

      const profile = await liff.getProfile();
      // LINEの名前をメンバー入力にデフォルトで入れる
      setMemberName(profile.displayName || "");
    } catch (err) {
      console.warn("LIFF init error:", err);
    }
  };

  // ② グループ一覧をリアルタイムで取得
  useEffect(() => {
    const q = query(collection(db, "groups"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Group[] = [];
      snap.forEach((d) => {
        list.push({
          id: d.id,
          name: d.data().name,
        });
      });
      setGroups(list);
      // 最初に1件も選ばれてなかったら1件目を選ぶ
      if (!selectedGroupId && list.length > 0) {
        setSelectedGroupId(list[0].id);
      }
    });
    return () => unsub();
  }, [selectedGroupId]);

  // ③ 選択中グループのメンバー
  useEffect(() => {
    if (!selectedGroupId) return;
    const membersRef = collection(db, "groups", selectedGroupId, "members");
    const q = query(membersRef, orderBy("joinedAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Member[] = [];
      snap.forEach((d) => {
        list.push({
          id: d.id,
          name: d.data().name,
        });
      });
      setMembers(list);
      // 支払者の初期値
      if (list.length > 0 && !paidBy) {
        setPaidBy(list[0].id);
      }
      // 参加者の初期値（全員）
      if (list.length > 0 && selectedParticipants.length === 0) {
        setSelectedParticipants(list.map((m) => m.id));
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  // ④ 選択中グループの支払
  useEffect(() => {
    if (!selectedGroupId) return;
    const expensesRef = collection(db, "groups", selectedGroupId, "expenses");
    const q = query(expensesRef, orderBy("createdAt", "desc"));
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

  // グループ追加
  const handleAddGroup = async () => {
    if (!groupName.trim()) return;
    await addDoc(collection(db, "groups"), {
      name: groupName.trim(),
      createdAt: serverTimestamp(),
    });
    setGroupName("");
  };

  // メンバー追加
  const handleAddMember = async () => {
    if (!selectedGroupId) return;
    if (!memberName.trim()) return;
    await addDoc(collection(db, "groups", selectedGroupId, "members"), {
      name: memberName.trim(),
      joinedAt: serverTimestamp(),
    });
    setMemberName("");
  };

  // 支払い追加
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

  // 参加者チェックボックス
  const toggleParticipant = (memberId: string) => {
    setSelectedParticipants((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      } else {
        return [...prev, memberId];
      }
    });
  };

  // 表示用：id→名前
  const getMemberName = (id: string) => {
    const f = members.find((m) => m.id === id);
    return f ? f.name : "(不明)";
  };

  return (
    <div className="min-h-screen bg-[#ECEEF0] flex justify-center py-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-4 flex flex-col gap-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#0F172A]">
            割り勘だよ（LINE版）
          </h1>
          <span className="text-xs text-gray-400">
            {selectedGroupId ? "online" : "no group"}
          </span>
        </div>

        {/* グループ追加 */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            グループを追加
          </label>
          <div className="flex gap-2">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="例）11/3 大阪飲み会"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              onClick={handleAddGroup}
              className="bg-[#06C755] text-white text-sm px-4 py-2 rounded-lg hover:opacity-90"
            >
              追加
            </button>
          </div>
          {/* グループ一覧 */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500">グループ一覧</p>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={`w-full flex justify-between items-center rounded-lg px-3 py-2 text-sm ${
                  selectedGroupId === g.id
                    ? "bg-[#E9FFF1] text-[#0F172A]"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <span>{g.name}</span>
                <span className="text-[10px] text-gray-400">{g.id}</span>
              </button>
            ))}
            {groups.length === 0 && (
              <p className="text-xs text-gray-400">まだグループがありません</p>
            )}
          </div>
        </div>

        {/* メンバー追加 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            メンバーを追加（{groups.find((g) => g.id === selectedGroupId)?.name ?? "グループ未選択"}）
          </p>
          <div className="flex gap-2">
            <input
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="ささき / LINEの名前"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              onClick={handleAddMember}
              className="bg-[#06C755] text-white text-sm px-4 py-2 rounded-lg hover:opacity-90"
            >
              追加
            </button>
          </div>
          {members.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <span
                  key={m.id}
                  className="bg-gray-100 text-xs px-2 py-1 rounded-md"
                >
                  {m.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 支払い登録 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">支払いを登録</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例）ランチ / ホテル / タクシー"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={amount ? amount : ""}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="4000"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "JPY" | "USD")}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="JPY">JPY</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500 w-20">支払った人</span>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-500">割るメンバー</p>
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
            className="w-full bg-[#06C755] text-white text-sm py-2 rounded-lg hover:opacity-90"
          >
            登録する
          </button>
        </div>

        {/* 支払い一覧 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">このグループの支払い</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {expenses.map((ex) => (
              <div
                key={ex.id}
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{ex.title}</span>
                  <span>
                    {ex.amount.toLocaleString()} {ex.currency}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  支払：{getMemberName(ex.paidBy)} / 割る人：
                  {ex.participants.map((id) => getMemberName(id)).join("・")}
                </p>
              </div>
            ))}
            {expenses.length === 0 && (
              <p className="text-xs text-gray-400">まだ支払いがありません</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
