"use client";

import { useEffect } from "react";

import { syncStorageOwner } from "@/lib/userStorage";

/**
 * Bindet den nutzerbezogenen `localStorage` an die aktuelle Session und räumt ihn
 * auf, wenn zuvor jemand anderes an diesem Browser angemeldet war. Gegenstück zum
 * `/__owner`-Marker des Service-Worker-Datencaches. Rendert nichts.
 */
export function StorageOwnerGuard({ userId }: { userId: string }) {
  useEffect(() => {
    syncStorageOwner(userId);
  }, [userId]);

  return null;
}
