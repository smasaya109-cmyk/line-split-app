'use client';

import { useEffect, useState } from 'react';
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
  setDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { inviteByLine } from '@/lib/invite';

/** ====== 招待カードのデフォルト画像（HTTPS） ====== */
const HERO_IMAGE_URL =
  'https://static.line-scdn.net/line_lp/img/meta/og-image.png';

/** ====== 友だち追加：LINE公式アカウントID（@無し） ====== */
const OA_ID = process.env.NEXT_PUBLIC_LINE_ACCOUNT_ID || ''; // 例: 'youraccountid'

type Group = { id: string; name: string };
type Member = { id: string; name: string };
type Expense = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  paidBy: string;
  participants: string[];
  createdAt?: any;
};
type SettlementLine = { from: string; to: string; amount: number; currency: string };

export default function Page() {
  // タブ
  const [activeTab, setActiveTab] = useState<'groups' | 'members' | 'add' | 'list' | 'settle'>(
    'groups'
  );

  // 認証済み uid（匿名でも可）
  const [uid, setUid] = useState<string | null>(null);

  // グループ
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  // メンバー
  const [members, setMembers] = useState<Member[]>([]);
  const [memberName, setMemberName] = useState('');

  // 支払い
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<'JPY' | 'USD'>('JPY');
  const [paidBy, setPaidBy] = useState<string>('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // 認証監視
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
    });
    return () => unsub();
  }, []);

  // ?group= を拾う
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const groupFromQuery = url.searchParams.get('group');
    if (groupFromQuery) setSelectedGroupId(groupFromQuery);
  }, []);

  // グループ一覧（自分が属するものだけ）
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'groups'),
      where('memberUids', 'array-contains', uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: Group[] = [];
      snap.forEach((d) => list.push({ id: d.id, name: d.data().name }));
      setGroups(list);
      if (!selectedGroupId && list.length > 0) setSelectedGroupId(list[0].id);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, selectedGroupId]);

  // メンバー一覧
  useEffect(() => {
    if (!selectedGroupId) return;
    const q = query(
      collection(db, 'groups', selectedGroupId, 'members'),
      orderBy('joinedAt', 'asc')
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
      collection(db, 'groups', selectedGroupId, 'expenses'),
      orderBy('createdAt', 'desc')
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

  // グループ作成（ownerUid と memberUids を保存。members/{uid} も同時作成）
  const handleAddGroup = async () => {
    if (!uid) {
      alert('ログイン待機中です。数秒後に再度お試しください。');
      return;
    }
    if (!groupName.trim()) return;

    const ref = await addDoc(collection(db, 'groups'), {
      name: groupName.trim(),
      createdAt: serverTimestamp(),
      ownerUid: uid,
      memberUids: [uid],
    });

    await setDoc(
      doc(db, 'groups', ref.id, 'members', uid),
      {
        name: memberName || 'あなた',
        joinedAt: serverTimestamp(),
        uid,
      },
      { merge: true }
    );

    setGroupName('');
    setSelectedGroupId(ref.id);
    setActiveTab('members');
  };

  const handleSaveGroupName = async (groupId: string) => {
    if (!editingGroupName.trim()) {
      setEditingGroupId(null);
      return;
    }
    await updateDoc(doc(db, 'groups', groupId), { name: editingGroupName.trim() });
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('このグループを削除しますか？メンバー・支払いも消えます。')) return;
    const membersSnap = await getDocs(collection(db, 'groups', groupId, 'members'));
    for (const m of membersSnap.docs) await deleteDoc(m.ref);
    const expensesSnap = await getDocs(collection(db, 'groups', groupId, 'expenses'));
    for (const e of expensesSnap.docs) await deleteDoc(e.ref);
    await deleteDoc(doc(db, 'groups', groupId));
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setMembers([]);
      setExpenses([]);
    }
  };

  // メンバー追加
  const handleAddMember = async () => {
    if (!selectedGroupId) return;
    if (!memberName.trim()) return;

    await addDoc(collection(db, 'groups', selectedGroupId, 'members'), {
      name: memberName.trim(),
      joinedAt: serverTimestamp(),
    });
    setMemberName('');
  };

  // 支払い追加/更新
  const handleAddExpense = async () => {
    if (!selectedGroupId) return;
    if (!title.trim()) return;
    if (!amount || amount <= 0) return;
    if (!paidBy) return;
    if (selectedParticipants.length === 0) return;

    if (editingExpenseId) {
      await updateDoc(doc(db, 'groups', selectedGroupId, 'expenses', editingExpenseId), {
        title: title.trim(),
        amount: Number(amount),
        currency,
        paidBy,
        participants: selectedParticipants,
      });
      setEditingExpenseId(null);
    } else {
      await addDoc(collection(db, 'groups', selectedGroupId, 'expenses'), {
        title: title.trim(),
        amount: Number(amount),
        currency,
        paidBy,
        participants: selectedParticipants,
        createdAt: serverTimestamp(),
      });
    }
    setTitle('');
    setAmount(0);
  };

  const handleEditExpense = (ex: Expense) => {
    setEditingExpenseId(ex.id);
    setTitle(ex.title);
    setAmount(ex.amount);
    setCurrency(ex.currency as 'JPY' | 'USD');
    setPaidBy(ex.paidBy);
    setSelectedParticipants(ex.participants);
    setActiveTab('add');
  };

  const handleDeleteExpense = async (ex: Expense) => {
    if (!selectedGroupId) return;
    if (!confirm('この支払いを削除しますか？')) return;
    await deleteDoc(doc(db, 'groups', selectedGroupId, 'expenses', ex.id));
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getMemberName = (id: string) =>
    members.find((m) => m.id === id)?.name ?? '(不明)';

  // 精算
  const settlementsByCurrency = calcSettlements(members, expenses);

  // LINE 招待（lib/invite.ts 経由）
  const handleInvite = async () => {
    if (!selectedGroupId) return;
    const name = groups.find((g) => g.id === selectedGroupId)?.name ?? '割り勘グループ';

    // 画像は /public/card.png を最優先（なければデフォルト）
    const heroImageUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/card.png`
        : 'https://line-split.vercel.app/card.png';

    await inviteByLine(selectedGroupId!, name, heroImageUrl || HERO_IMAGE_URL);
  }; // ← 閉じカッコを忘れない！

  // 友だち追加
  const handleAddFriend = () => {
    if (!OA_ID) {
      alert('NEXT_PUBLIC_LINE_ACCOUNT_ID が未設定です。');
      return;
    }
    const url = `https://line.me/R/ti/p/@${OA_ID}`;
    if (typeof window !== 'undefined') {
      const liff = (window as any).liff;
      if (liff?.isInClient?.()) {
        liff.openWindow({ url, external: false });
      } else {
        window.open(url, '_blank');
      }
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
                : 'グループを選んでください'}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto pb-20 px-4 pt-4 bg-[#F5F7F8]">
          {/* Groups */}
          {activeTab === 'groups' && (
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
                        ? 'bg-[#E9FFF1] text-[#0F172A]'
                        : 'bg-white text-gray-700'
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
                            setEditingGroupName('');
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
                            setActiveTab('members');
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
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  対象グループ：
                  {groups.find((g) => g.id === selectedGroupId)?.name ?? '未選択'}
                </p>
                <button
                  onClick={handleInvite}
                  className="text-[11px] bg-[#06C755]/10 text-[#06C755] px-3 py-1 rounded-lg"
                >
                  LINEで招待
                </button>
              </div>

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
                  </span>
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-gray-400">このグループにはまだメンバーがいません</p>
                )}
              </div>
            </div>
          )}

          {/* Add expense */}
          {activeTab === 'add' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                {editingExpenseId ? '支払いを編集' : '支払いを登録'}
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
                  value={amount ? amount : ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="4000"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'JPY' | 'USD')}
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
                {editingExpenseId ? '更新する' : '登録する'}
              </button>
              {editingExpenseId && (
                <button
                  onClick={() => {
                    setEditingExpenseId(null);
                    setTitle('');
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
          {activeTab === 'list' && (
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
                        割る人: {ex.participants.map((id) => getMemberName(id)).join('・')}
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
          {activeTab === 'settle' && (
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

              {/* 友だち追加（小さく表示） */}
              <div className="pt-2">
                <button
                  onClick={handleAddFriend}
                  className="mx-auto block text-[11px] px-3 py-1 rounded-md bg-[#06C755]/10 text-[#06C755]"
                >
                  公式アカウントを友だち追加
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="h-14 bg-white border-t flex">
          <TabItem label="グループ" active={activeTab === 'groups'} onClick={() => setActiveTab('groups')} />
          <TabItem label="メンバー" active={activeTab === 'members'} onClick={() => setActiveTab('members')} />
          <TabItem label="追加" active={activeTab === 'add'} onClick={() => setActiveTab('add')} />
          <TabItem label="履歴" active={activeTab === 'list'} onClick={() => setActiveTab('list')} />
          <TabItem label="精算" active={activeTab === 'settle'} onClick={() => setActiveTab('settle')} />
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
        active ? 'text-[#06C755] font-semibold' : 'text-gray-400'
      }`}
    >
      {label}
    </button>
  );
}

// 精算
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


