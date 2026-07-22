"use client";

/**
 * E2EEProvider (Signal Protocol)
 * ─────────────────────────────────
 * - On login, ensures this browser has a Signal Protocol identity (generates
 *   one + uploads the public bundle on first run, no-ops after that).
 * - Exposes encrypt/decrypt helpers keyed by the other participant's
 *   username — sessions and the Double Ratchet state are managed internally
 *   by signal-e2ee.ts / SignalProtocolStore.
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import { ensureIdentitySetUp, encryptForUser, decryptFromUser, SignalEnvelope } from "./signal-e2ee";

interface E2EEContextValue {
  isReady: boolean;
  encryptFor: (otherUsername: string, plaintext: string) => Promise<SignalEnvelope>;
  decryptFrom: (otherUsername: string, envelope: SignalEnvelope) => Promise<string>;
}

const E2EEContext = createContext<E2EEContextValue | null>(null);

export function E2EEProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsReady(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await ensureIdentitySetUp(user.id);
        if (!cancelled) setIsReady(true);
      } catch (err) {
        console.error("Signal Protocol setup failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const encryptFor = async (otherUsername: string, plaintext: string) => {
    if (!user) throw new Error("Not logged in");
    return encryptForUser(user.id, otherUsername, plaintext);
  };

  const decryptFrom = async (otherUsername: string, envelope: SignalEnvelope) => {
    if (!user) throw new Error("Not logged in");
    return decryptFromUser(user.id, otherUsername, envelope);
  };

  return (
    <E2EEContext.Provider value={{ isReady, encryptFor, decryptFrom }}>
      {children}
    </E2EEContext.Provider>
  );
}

export function useE2EE(): E2EEContextValue {
  const ctx = useContext(E2EEContext);
  if (!ctx) throw new Error("useE2EE must be used within <E2EEProvider>");
  return ctx;
}