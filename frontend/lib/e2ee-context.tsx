"use client";

/**
 * E2EEProvider (Signal Protocol) — MULTI-DEVICE version
 * ─────────────────────────────────
 * - On login, ensures this browser has a Signal Protocol identity + a
 *   registered device id (generates + uploads on first run for THIS
 *   browser, no-ops after that — a different browser/device for the same
 *   user gets its own separate identity+device).
 * - encryptFor now returns an ARRAY of per-device ciphertexts: one for
 *   every active device of the recipient, plus one for each of the
 *   sender's OWN other devices (so the message also appears there).
 * - decryptFrom needs the sender's device id (carried on the incoming
 *   socket/history payload as `sender_device_id`) to pick the right
 *   Double Ratchet session — different devices of the same person are
 *   cryptographically distinct senders.
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import {
  ensureIdentitySetUp,
  encryptForUser,
  decryptFromUser,
  forceSessionReset,
  forceSessionResetAllDevices,
  DeviceCiphertext,
  SignalEnvelope,
} from "./signal-e2ee";

interface E2EEContextValue {
  isReady: boolean;
  encryptFor: (otherUsername: string, plaintext: string) => Promise<DeviceCiphertext[]>;
  decryptFrom: (
    otherUsername: string,
    senderDeviceId: number,
    envelope: SignalEnvelope,
    conversationId?: string
  ) => Promise<string>;
  forceSessionReset: (otherUsername: string, deviceId: number) => Promise<void>;
  forceSessionResetAllDevices: (otherUsername: string) => Promise<void>;
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
    return encryptForUser(user.id, user.username, otherUsername, plaintext);
  };

  const decryptFrom = async (
    otherUsername: string,
    senderDeviceId: number,
    envelope: SignalEnvelope,
    conversationId?: string
  ) => {
    if (!user) throw new Error("Not logged in");
    return decryptFromUser(user.id, otherUsername, senderDeviceId, envelope, conversationId);
  };

  const handleForceSessionReset = async (otherUsername: string, deviceId: number) => {
    if (!user) throw new Error("Not logged in");
    return forceSessionReset(user.id, otherUsername, deviceId);
  };

  const handleForceSessionResetAllDevices = async (otherUsername: string) => {
    if (!user) throw new Error("Not logged in");
    return forceSessionResetAllDevices(user.id, otherUsername);
  };

  return (
    <E2EEContext.Provider
      value={{
        isReady,
        encryptFor,
        decryptFrom,
        forceSessionReset: handleForceSessionReset,
        forceSessionResetAllDevices: handleForceSessionResetAllDevices,
      }}
    >
      {children}
    </E2EEContext.Provider>
  );
}

export function useE2EE(): E2EEContextValue {
  const ctx = useContext(E2EEContext);
  if (!ctx) throw new Error("useE2EE must be used within <E2EEProvider>");
  return ctx;
}
