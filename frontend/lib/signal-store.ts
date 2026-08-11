"use client";

/**
 * SignalProtocolStore
 * ─────────────────────
 * Implements the storage interface @privacyresearch/libsignal-protocol-typescript
 * requires: identity keys, pre-keys, signed pre-keys, and per-contact session
 * state (the Double Ratchet's evolving state lives here).
 *
 * Everything is stored in IndexedDB, scoped to this browser only — this is
 * the "single device" limitation mentioned elsewhere: session state and
 * private keys never leave this browser, so a new browser/device starts a
 * fresh identity with no access to prior sessions.
 *
 * NOTE: this community library's exact method names/signatures have some
 * version variance. If TypeScript complains about a mismatched signature,
 * check node_modules/@privacyresearch/libsignal-protocol-typescript's type
 * definitions and adjust method names here accordingly — the *shape* of
 * what needs storing (below) will be the same regardless.
 */

import type { Direction, KeyPairType, SignalProtocolAddress } from "@privacyresearch/libsignal-protocol-typescript";

const STORE_NAME = "kv";

// IMPORTANT: the database is scoped PER USER ID, not shared globally.
// Without this, logging into two different accounts in the same browser
// (e.g. two tabs) would silently overwrite one account's identity/session
// state with the other's, since IndexedDB is shared per-origin regardless
// of which account is "active" in a given tab. This was the root cause of
// "[Unable to decrypt message]" errors during multi-account testing.
function dbNameFor(userId: string): string {
  return `devpulse_signal_store_${userId}`;
}

function openDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbNameFor(userId), 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(userId: string, key: string): Promise<T | undefined> {
  const db = await openDb(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(userId: string, key: string, value: unknown): Promise<void> {
  const db = await openDb(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbRemove(userId: string, key: string): Promise<void> {
  const db = await openDb(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export class SignalProtocolStore {
  constructor(private userId: string) { }

  // ── This browser's device id ─────────────────────────────────────────
  // Persisted once, on first setup, and reused on every subsequent login
  // from this same browser. The backend assigns the number (see
  // ensureIdentitySetUp) — this just remembers it locally so the same
  // browser doesn't register as a "new device" every time someone logs in.

  async getLocalDeviceId(): Promise<number | undefined> {
    return idbGet<number>(this.userId, "localDeviceId");
  }

  async setLocalDeviceId(deviceId: number): Promise<void> {
    await idbSet(this.userId, "localDeviceId", deviceId);
  }

  // ── Identity ──────────────────────────────────────────────────────────

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    return idbGet<KeyPairType>(this.userId, "identityKey");
  }

  async setIdentityKeyPair(keyPair: KeyPairType): Promise<void> {
    await idbSet(this.userId, "identityKey", keyPair);
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return idbGet<number>(this.userId, "registrationId");
  }

  async setLocalRegistrationId(id: number): Promise<void> {
    await idbSet(this.userId, "registrationId", id);
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction
  ): Promise<boolean> {
    const trusted = await idbGet<ArrayBuffer>(this.userId, `identityKeyFor:${identifier}`);
    if (!trusted) return true; // trust on first use (TOFU) — standard for Signal Protocol
    return arrayBuffersEqual(trusted, identityKey);
  }

  async loadIdentityKey(identifier: string): Promise<ArrayBuffer | undefined> {
    return idbGet<ArrayBuffer>(this.userId, `identityKeyFor:${identifier}`);
  }

  async saveIdentity(identifier: string, identityKey: ArrayBuffer): Promise<boolean> {
    const existing = await this.loadIdentityKey(identifier);
    await idbSet(this.userId, `identityKeyFor:${identifier}`, identityKey);
    // Returns true if the identity key CHANGED (which a full implementation
    // would surface as a "safety number changed" warning to the user).
    return existing !== undefined && !arrayBuffersEqual(existing, identityKey);
  }

  // ── Pre-keys ──────────────────────────────────────────────────────────

  async loadPreKey(keyId: number): Promise<KeyPairType | undefined> {
    return idbGet<KeyPairType>(this.userId, `preKey:${keyId}`);
  }

  async storePreKey(keyId: number, keyPair: KeyPairType): Promise<void> {
    await idbSet(this.userId, `preKey:${keyId}`, keyPair);
  }

  async removePreKey(keyId: number): Promise<void> {
    await idbRemove(this.userId, `preKey:${keyId}`);
  }

  // ── Signed pre-keys ───────────────────────────────────────────────────

  async loadSignedPreKey(keyId: number): Promise<KeyPairType | undefined> {
    return idbGet<KeyPairType>(this.userId, `signedPreKey:${keyId}`);
  }

  async storeSignedPreKey(keyId: number, keyPair: KeyPairType): Promise<void> {
    await idbSet(this.userId, `signedPreKey:${keyId}`, keyPair);
  }

  async removeSignedPreKey(keyId: number): Promise<void> {
    await idbRemove(this.userId, `signedPreKey:${keyId}`);
  }

  // ── Sessions (the Double Ratchet state per contact) ──────────────────

  async loadSession(identifier: string): Promise<any | undefined> {
    return idbGet<any>(this.userId, `session:${identifier}`);
  }

  async storeSession(identifier: string, record: any): Promise<void> {
    await idbSet(this.userId, `session:${identifier}`, record);
  }

  async removeSession(identifier: string): Promise<void> {
    await idbRemove(this.userId, `session:${identifier}`);
  }

  async removeAllSessions(identifier: string): Promise<void> {
    // Our address scheme doesn't have multiple device sessions per user,
    // so this is equivalent to removeSession for this simplified project.
    await idbRemove(this.userId, `session:${identifier}`);
  }
}

function arrayBuffersEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  for (let i = 0; i < av.length; i++) {
    if (av[i] !== bv[i]) return false;
  }
  return true;
}