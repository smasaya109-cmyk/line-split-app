"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function Home() {
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "groups"));
      const arr: any[] = [];
      snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
      setGroups(arr);
    };
    load();
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Firestoreテスト</h1>
      {groups.length === 0 && <p>まだ何もありません</p>}
      <ul>
        {groups.map((g) => (
          <li key={g.id}>{g.name}</li>
        ))}
      </ul>
    </main>
  );
}
