"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";

export interface Member {
  id: string;
  name: string;
  isMe: boolean;
}

/** Lädt die Mitglieder der aktuellen Reise (einmal beim Mount). */
export function useMembers(): Member[] {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    api
      .get<{ members: Member[] }>("/api/v1/trip/members")
      .then((r) => setMembers(r.members))
      .catch(() => {});
  }, []);
  return members;
}
