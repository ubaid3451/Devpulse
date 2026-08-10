"use client";

/**
 * Signal Protocol client-side logic:
 * - First-run: generate identity key, registration id, signed pre-key, and
 *   a batch of one-time pre-keys; upload the public bundle to the backend.
 * - Sending a first message to someone: fetch their PreKeyBundle (X3DH),
 *   build a session via SessionBuilder.
 * - Sending/receiving: SessionCipher handles the Double Ratchet automatically
 *   once a session exists — every call advances the ratchet state, which
 *   SignalProtocolStore persists to IndexedDB.
 */

import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from "@privacyresearch/libsignal-protocol-typescript";
import { SignalProtocolStore } from "./signal-store";
import { uploadKeyBundle, getKeyBundle, notifySessionReset } from "./api";

const DEVICE_ID = 1; // single-device scope for this project
const ONE_TIME_PREKEY_BATCH_SIZE = 20;

// ── Structured logging ────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  conversationId?: string;
  username?: string;
  details?: Record<string, any>;
}

function logEntry(level: LogLevel, event: string, details: LogEntry["details"] = {}): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  };
  // In production, replace with your logging service (e.g., sentry, datadog, custom endpoint)
  const prefix = `[Signal:${level.toUpperCase()}]`;
  switch (level) {
    case "debug":
      console.debug(prefix, event, details);
      break;
    case "info":
      console.info(prefix, event, details);
      break;
    case "warn":
      console.warn(prefix, event, details);
      break;
    case "error":
      console.error(prefix, event, details);
      break;
  }
}

function bufToBase64(buf: ArrayBuffer | ArrayBufferView | undefined): string {
  if (!buf) return "";
  let bytes: Uint8Array;
  if (ArrayBuffer.isView(buf)) {
    bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } else {
    bytes = new Uint8Array(buf);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(base64: string): ArrayBuffer {
  if (!base64) return new ArrayBuffer(0);
  let normalized = base64.replace(/-/g, "+").replace(/_/g, "/").trim();
  while (normalized.length % 4 !== 0) {
    normalized += "=";
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// The store is scoped per logged-in user id (see signal-store.ts) — this
// avoids two different accounts in the same browser silently sharing/
// overwriting each other's Signal Protocol identity and session state.
let store: SignalProtocolStore | null = null;
let storeUserId: string | null = null;

function getStore(userId: string): SignalProtocolStore {
  if (!store || storeUserId !== userId) {
    store = new SignalProtocolStore(userId);
    storeUserId = userId;
  }
  return store;
}

// Tracks in-flight setup calls per user so concurrent invocations (e.g. the
// auth effect firing twice in React StrictMode, or multiple tabs/components
// reacting to the same login) await the same promise instead of racing to
// generate/upload two different identities for the same user.
const pendingSetups = new Map<string, Promise<void>>();

// Per-conversation mutex for session establishment to prevent concurrent
// X3DH handshakes from corrupting the initial session state.
const sessionEstablishmentLocks = new Map<string, Promise<void>>();

function getSessionLockKey(myUserId: string, username: string): string {
  return `${myUserId}:${username}`;
}

async function withSessionLock<T>(
  myUserId: string,
  username: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = getSessionLockKey(myUserId, username);
  const existingLock = sessionEstablishmentLocks.get(lockKey);
  if (existingLock) {
    await existingLock;
  }
  const lockPromise = fn().finally(() => {
    sessionEstablishmentLocks.delete(lockKey);
  });
  sessionEstablishmentLocks.set(lockKey, lockPromise);
  return lockPromise;
}

/**
 * Ensures this browser has a Signal Protocol identity set up for `userId`,
 * generating one (and uploading the public bundle) if this is the first
 * time. Safe to call on every login — it's a no-op after the first
 * successful run for that user. Safe to call concurrently for the same
 * user — only one initialization will actually run; other callers await
 * the same in-flight promise.
 */
export async function ensureIdentitySetUp(userId: string): Promise<void> {
  const existingCall = pendingSetups.get(userId);
  if (existingCall) return existingCall;

  const setupPromise = doEnsureIdentitySetUp(userId).finally(() => {
    pendingSetups.delete(userId);
  });
  pendingSetups.set(userId, setupPromise);
  return setupPromise;
}

async function doEnsureIdentitySetUp(userId: string): Promise<void> {
  const store = getStore(userId);

  logEntry("info", "identity_setup_started", { userId });

  let identityKeyPair = await store.getIdentityKeyPair();
  let registrationId = await store.getLocalRegistrationId();

  const isNewIdentity = !identityKeyPair || !registrationId;

  if (isNewIdentity) {
    logEntry("info", "identity_generating_new", { userId });
    identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    registrationId = KeyHelper.generateRegistrationId();

    await store.setIdentityKeyPair(identityKeyPair);
    await store.setLocalRegistrationId(registrationId);
    logEntry("info", "identity_stored", { userId });
  } else {
    // BUG FIX: Only skip key upload if signed prekey already stored locally.
    // Previously, this block fell through and re-generated+uploaded signed prekeys
    // on EVERY login, invalidating all existing sessions for every peer.
    const existingSignedPreKey = await store.loadSignedPreKey(1);
    if (existingSignedPreKey) {
      logEntry("info", "identity_already_exists_skipping_upload", { userId });
      return;
    }
    logEntry("info", "identity_exists_but_prekeys_missing_reuploading", { userId });
  }

  const signedPreKeyId = 1;
  const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);
  await store.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

  const oneTimePreKeys = [];
  for (let i = 1; i <= ONE_TIME_PREKEY_BATCH_SIZE; i++) {
    const preKey = await KeyHelper.generatePreKey(i);
    await store.storePreKey(i, preKey.keyPair);
    oneTimePreKeys.push({
      keyId: i,
      publicKey: bufToBase64(preKey.keyPair.pubKey),
    });
  }

  await uploadKeyBundle({
    identity_key: bufToBase64(identityKeyPair.pubKey),
    signed_prekey: {
      keyId: signedPreKeyId,
      publicKey: bufToBase64(signedPreKey.keyPair.pubKey),
      signature: bufToBase64(signedPreKey.signature),
    },
    one_time_prekeys: oneTimePreKeys,
  });
  logEntry("info", "identity_key_bundle_uploaded", { userId, oneTimePreKeyCount: oneTimePreKeys.length });
}

function addressFor(username: string): SignalProtocolAddress {
  return new SignalProtocolAddress(username, DEVICE_ID);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetching a recipient's key bundle can race a backend that just finished
// uploading it (e.g. the recipient's very first login) or a DB replica that
// hasn't caught up yet. Retry a few times with backoff before giving up.
const KEY_BUNDLE_FETCH_RETRIES = 4;
const KEY_BUNDLE_RETRY_BASE_DELAY_MS = 300;

async function getKeyBundleWithRetry(username: string) {
  let lastError: any;

  for (let attempt = 0; attempt <= KEY_BUNDLE_FETCH_RETRIES; attempt++) {
    try {
      return await getKeyBundle(username);
    } catch (err: any) {
      lastError = err;
      // Do not retry if the backend indicates key bundle was not found (404)
      if (err?.status === 404 || err?.message?.includes("not found")) {
        break;
      }
      if (attempt === KEY_BUNDLE_FETCH_RETRIES) break;
      const delay = KEY_BUNDLE_RETRY_BASE_DELAY_MS * 2 ** attempt;
      logEntry("warn", "key_bundle_fetch_retry", { username, attempt: attempt + 1, maxAttempts: KEY_BUNDLE_FETCH_RETRIES + 1, delay, error: String(err) });
      await sleep(delay);
    }
  }

  throw lastError;
}

/** Builds a session with `username` via X3DH if one doesn't already exist. */
async function ensureSessionWith(myUserId: string, username: string, forceRefresh = false): Promise<void> {
  const store = getStore(myUserId);
  const address = addressFor(username);
  const addressStr = address.toString();

  logEntry("debug", "ensure_session_started", { myUserId, username, forceRefresh });

  // Use per-conversation mutex to prevent concurrent session establishment
  await withSessionLock(myUserId, username, async () => {
    // Re-check after acquiring lock in case another caller already created the session
    if (!forceRefresh) {
      const existingSession = await store.loadSession(addressStr);
      if (existingSession) {
        logEntry("debug", "session_already_exists", { myUserId, username });
        return;
      }
    } else {
      logEntry("info", "session_force_refresh", { myUserId, username });
      await store.removeSession(addressStr);
    }

    logEntry("info", "session_building_x3dh", { myUserId, username });

    const bundle = await getKeyBundleWithRetry(username);

    const preKeyBundle: any = {
      identityKey: base64ToBuf(bundle.identity_key),
      registrationId: bundle.registration_id,
      signedPreKey: {
        keyId: bundle.signed_prekey.key_id,
        publicKey: base64ToBuf(bundle.signed_prekey.public_key),
        signature: base64ToBuf(bundle.signed_prekey.signature),
      },
    };
    if (bundle.one_time_prekey) {
      preKeyBundle.preKey = {
        keyId: bundle.one_time_prekey.key_id,
        publicKey: base64ToBuf(bundle.one_time_prekey.public_key),
      };
    }

    const sessionBuilder = new SessionBuilder(store as any, address);
    await sessionBuilder.processPreKey(preKeyBundle);

    logEntry("info", "session_created", { myUserId, username });
  });
}

export interface SignalEnvelope {
  content: string; // base64 ciphertext body
  msg_type: number; // 3 = PreKeyWhisperMessage (first msg), 1 = WhisperMessage (subsequent)
}

/** Encrypts plaintext to send to `username`, establishing a session first if needed. */
export async function encryptForUser(myUserId: string, username: string, plaintext: string): Promise<SignalEnvelope> {
  const store = getStore(myUserId);
  const address = addressFor(username);

  // BUG FIX: Do NOT wrap this in withSessionLock — ensureSessionWith already
  // acquires the per-conversation lock internally. Nesting two withSessionLock
  // calls for the same key creates a deadlock: the outer lock's fn() awaits
  // ensureSessionWith(), which in turn tries to await the outer lock's promise
  // before creating its own — neither can ever resolve.
  const doEncrypt = async (): Promise<SignalEnvelope> => {
    await ensureSessionWith(myUserId, username);
    const cipher = new SessionCipher(store as any, address);
    const encoded = new TextEncoder().encode(plaintext).buffer;
    const ciphertext = await cipher.encrypt(encoded);

    logEntry("debug", "encrypt", { username, msgType: ciphertext.type });

    return {
      content: bufToBase64(
        typeof ciphertext.body === "string"
          ? Uint8Array.from(ciphertext.body, (c) => c.charCodeAt(0)).buffer
          : ciphertext.body
      ),
      msg_type: ciphertext.type,
    };
  };

  try {
    return await doEncrypt();
  } catch (err: any) {
    // If the existing session is stale/corrupt (e.g. invalid signature from old key),
    // delete local session state, force re-fetching latest bundle, and retry once.
    logEntry("warn", "encrypt_failed_retrying", { username, error: err?.message });
    await store.removeSession(address.toString());
    await ensureSessionWith(myUserId, username, true);

    const cipher = new SessionCipher(store as any, address);
    const encoded = new TextEncoder().encode(plaintext).buffer;
    const ciphertext = await cipher.encrypt(encoded);

    return {
      content: bufToBase64(
        typeof ciphertext.body === "string"
          ? Uint8Array.from(ciphertext.body, (c) => c.charCodeAt(0)).buffer
          : ciphertext.body
      ),
      msg_type: ciphertext.type,
    };
  }
}

/** Decrypts a message from/to `username`. Handles both the first (PreKey) message and subsequent ones. */
export async function decryptFromUser(
  myUserId: string,
  username: string,
  envelope: SignalEnvelope,
  conversationId?: string
): Promise<string> {
  const store = getStore(myUserId);
  const address = addressFor(username);

  try {
    const cipher = new SessionCipher(store as any, address);

    const bodyBuf = base64ToBuf(envelope.content);
    const bodyBinaryString = Array.from(new Uint8Array(bodyBuf), (b) => String.fromCharCode(b)).join("");

    let plaintextBuf: ArrayBuffer;
    if (envelope.msg_type === 3) {
      plaintextBuf = await cipher.decryptPreKeyWhisperMessage(bodyBinaryString, "binary");
    } else {
      plaintextBuf = await cipher.decryptWhisperMessage(bodyBinaryString, "binary");
    }

    logEntry("debug", "decrypt", { username, msgType: envelope.msg_type });
    return new TextDecoder().decode(plaintextBuf);
  } catch (err: any) {
    // If decryption fails (e.g., Bad MAC due to desynced session or cleared site storage),
    // purge the stale local session so that the NEXT new message automatically re-establishes
    // a clean fresh X3DH session.
    logEntry("warn", "decrypt_failed_purging_session", { username, error: err?.message, msgType: envelope.msg_type });
    await store.removeSession(address.toString());
    // Notify the other party to also reset their session so both sides re-establish
    if (conversationId) {
      notifySessionReset(conversationId).catch((e) => logEntry("error", "session_reset_notify_failed", { conversationId, error: e?.message }));
    }
    return "[Unable to decrypt message]";
  }
}

/** Forces a session reset with `username` by removing the local session state.
 *  The next encryptForUser call will trigger a fresh X3DH handshake. */
export async function forceSessionReset(myUserId: string, username: string): Promise<void> {
  const store = getStore(myUserId);
  const address = addressFor(username);
  logEntry("info", "force_session_reset", { myUserId, username });
  await store.removeSession(address.toString());
}