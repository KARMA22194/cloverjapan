"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";

export interface Member {
  id: string;
  name: string;
  isMe: boolean;
}

// Kleiner Session-Cache: Mitglieder ändern sich selten. Wird über alle Komponenten
// geteilt (kein erneuter Fetch bei jedem Mount) und dedupliziert gleichzeitige Aufrufe.
const TTL_MS = 60_000;
let cache: Member[] | null = null;
let cacheAt = 0;
let inflight: Promise<Member[]> | null = null;

function fetchMembers(): Promise<Member[]> {
  if (inflight) return inflight;
  if (cache && Date.now() - cacheAt < TTL_MS) return Promise.resolve(cache);
  inflight = api
    .get<{ members: Member[] }>("/api/v1/trip/members")
    .then((r) => {
      cache = r.members;
      cacheAt = Date.now();
      return r.members;
    })
    .catch(() => cache ?? [])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Mitglieder der aktuellen Reise (kurzer geteilter Cache, Fetch beim Mount). */
export function useMembers(): Member[] {
  const [members, setMembers] = useState<Member[]>(cache ?? []);
  useEffect(() => {
    let cancelled = false;
    fetchMembers().then((m) => {
      if (!cancelled) setMembers(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return members;
}
