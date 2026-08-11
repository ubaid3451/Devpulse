"use client";

/**
 * Signal Protocol client-side logic — MULTI-DEVICE version.
 *
 * Key change from the single-device version: SignalProtocolAddress is now
 * (username, deviceId) for real, instead of a hardcoded deviceId=1. That
 * means:
 *
 * - This browser registers itself as one numbered "device" for the logged
 *   in user (assigned by the backend on first setup, persisted locally
 *   after that — see SignalProtocolStore.getLocalDeviceId).
 * - Encrypting a message to someone now means: look up ALL of their active
 *   devices, maintain a separate Double Ratchet session with EACH one, and
 *   produce one ciphertext per device. There is no single ciphertext a
 *   user's multiple devices could jointly decrypt — every device has its
 *   own independent session.
 * - You also encrypt a copy to your OWN other devices, so a message you
 *   send from your phone shows up in your laptop's chat too (Signal calls
 *   these "sync messages").
 * - Decrypting now addresses sessions by the SENDER's specific device id
 *   (included in the envelope), not just their username.
 */

import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from "@privacyresearch/libsignal-protocol-typescript";
import { SignalProtocolStore } from "./signal-store";
import { uploadKeyBundle, getKeyBundles, notifySessionReset } from "./api";

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

// The store is scoped per logged-in user id (see signal-store.ts).
let store: SignalProtocolStore | null = null;
let storeUserId: string | null = null;

function getStore(userId: string): SignalProtocolStore {
  if (!store || storeUserId !== userId) {
    store = new SignalProtocolStore(userId);
    storeUserId = userId;
  }
  return store;
}

// This browser's device id for the currently logged-in user, cached in
// memory after first load/registration so callers don't have to await
// IndexedDB on every encrypt/decrypt call.
const localDeviceIdCache = new Map<string, number>();

async function getLocalDeviceId(userId: string): Promise<number | undefined> {
  if (localDeviceIdCache.has(userId)) return localDeviceIdCache.get(userId);
  const s = getStore(userId);
  const id = await s.getLocalDeviceId();
  if (id !== undefined) localDeviceIdCache.set(userId, id);
  return id;
}

const pendingSetups = new Map<string, Promise<void>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sessionEstablishmentLocks = new Map<string, Promise<any>>();

function getSessionLockKey(myUserId: string, addressStr: string): string {
  return `${myUserId}:${addressStr}`;
}

async function withSessionLock<T>(myUserId: string, addressStr: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = getSessionLockKey(myUserId, addressStr);
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
 * Ensures this browser has a Signal Protocol identity + device registration
 * set up for `userId`. Safe to call on every login. On the FIRST call ever
 * for this browser+user, this also registers a new numbered device with the
 * backend and remembers the assigned device id locally; subsequent calls
 * reuse that same device id and just refresh prekeys if needed.
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
  let localDeviceId = await store.getLocalDeviceId();

  const isNewIdentity = !identityKeyPair || !registrationId;

  if (isNewIdentity) {
    logEntry("info", "identity_generating_new", { userId });
    identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    registrationId = KeyHelper.generateRegistrationId();

    await store.setIdentityKeyPair(identityKeyPair);
    await store.setLocalRegistrationId(registrationId);
    logEntry("info", "identity_stored", { userId });
  } else if (localDeviceId !== undefined) {
    // Already fully set up on this browser (identity + registered device id
    // + prekeys uploaded at least once). Only skip if signed prekey exists.
    const existingSignedPreKey = await store.loadSignedPreKey(1);
    if (existingSignedPreKey) {
      logEntry("info", "identity_already_exists_skipping_upload", { userId, localDeviceId });
      localDeviceIdCache.set(userId, localDeviceId);
      return;
    }
  }

  const signedPreKeyId = 1;
  const keyPair = identityKeyPair!;
  const signedPreKey = await KeyHelper.generateSignedPreKey(keyPair, signedPreKeyId);
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

  const deviceName = typeof navigator !== "undefined" ? guessDeviceName() : undefined;

  const result = await uploadKeyBundle({
    device_id: localDeviceId ?? null,
    device_name: deviceName,
    identity_key: bufToBase64(keyPair.pubKey),
    registration_id: registrationId,
    signed_prekey: {
      keyId: signedPreKeyId,
      publicKey: bufToBase64(signedPreKey.keyPair.pubKey),
      signature: bufToBase64(signedPreKey.signature),
    },
    one_time_prekeys: oneTimePreKeys,
  });

  // Backend assigns/confirms this browser's device id — persist it so
  // future logins from this browser reuse the same device instead of
  // registering a new one every time.
  if (result?.device_id !== undefined) {
    await store.setLocalDeviceId(result.device_id);
    localDeviceIdCache.set(userId, result.device_id);
  }

  logEntry("info", "identity_key_bundle_uploaded", {
    userId,
    deviceId: result?.device_id,
    oneTimePreKeyCount: oneTimePreKeys.length,
  });
}

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function addressFor(username: string, deviceId: number): SignalProtocolAddress {
  return new SignalProtocolAddress(username, deviceId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const KEY_BUNDLE_FETCH_RETRIES = 4;
const KEY_BUNDLE_RETRY_BASE_DELAY_MS = 300;

interface RemoteDeviceBundle {
  device_id: number;
  identity_key: string;
  registration_id: number;
  signed_prekey: { key_id: number; public_key: string; signature: string };
  one_time_prekey: { key_id: number; public_key: string } | null;
}

/** Fetches every active device bundle for `username` (retries on transient errors). */
async function getDeviceBundlesWithRetry(username: string): Promise<RemoteDeviceBundle[]> {
  let lastError: any;

  for (let attempt = 0; attempt <= KEY_BUNDLE_FETCH_RETRIES; attempt++) {
    try {
      const res = await getKeyBundles(username);
      return res.devices as RemoteDeviceBundle[];
    } catch (err: any) {
      lastError = err;
      if (err?.status === 404 || err?.message?.includes("not found")) {
        break;
      }
      if (attempt === KEY_BUNDLE_FETCH_RETRIES) break;
      const delay = KEY_BUNDLE_RETRY_BASE_DELAY_MS * 2 ** attempt;
      logEntry("warn", "key_bundle_fetch_retry", { username, attempt: attempt + 1, delay, error: String(err) });
      await sleep(delay);
    }
  }

  throw lastError;
}

/** Builds a session with `username`'s specific device if one doesn't already exist. */
async function ensureSessionWithDevice(
  myUserId: string,
  username: string,
  bundle: RemoteDeviceBundle,
  forceRefresh = false
): Promise<void> {
  const store = getStore(myUserId);
  const address = addressFor(username, bundle.device_id);
  const addressStr = address.toString();

  await withSessionLock(myUserId, addressStr, async () => {
    if (!forceRefresh) {
      const existingSession = await store.loadSession(addressStr);
      if (existingSession) {
        logEntry("debug", "session_already_exists", { myUserId, username, deviceId: bundle.device_id });
        return;
      }
    } else {
      logEntry("info", "session_force_refresh", { myUserId, username, deviceId: bundle.device_id });
      await store.removeSession(addressStr);
    }

    logEntry("info", "session_building_x3dh", { myUserId, username, deviceId: bundle.device_id });

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

    logEntry("info", "session_created", { myUserId, username, deviceId: bundle.device_id });
  });
}

export interface SignalEnvelope {
  content: string; // base64 ciphertext body
  msg_type: number; // 3 = PreKeyWhisperMessage (first msg to this device), 1 = WhisperMessage (subsequent)
}

/** One encrypted copy targeted at a specific recipient device. */
export interface DeviceCiphertext extends SignalEnvelope {
  recipient_user_id: string;
  recipient_device_id: number;
}

async function encryptToDevice(
  myUserId: string,
  username: string,
  plaintext: string,
  bundle: RemoteDeviceBundle
): Promise<SignalEnvelope> {
  const store = getStore(myUserId);
  const address = addressFor(username, bundle.device_id);

  const doEncrypt = async (): Promise<SignalEnvelope> => {
    await ensureSessionWithDevice(myUserId, username, bundle);
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
  };

  try {
    return await doEncrypt();
  } catch (err: any) {
    logEntry("warn", "encrypt_failed_retrying", { username, deviceId: bundle.device_id, error: err?.message });
    await store.removeSession(address.toString());
    await ensureSessionWithDevice(myUserId, username, bundle, true);

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

/**
 * Encrypts `plaintext` for EVERY active device of `username`, AND for every
 * one of the sender's OWN other devices (so the message shows up across all
 * of the sender's logged-in browsers too — Signal Protocol "sync" copies).
 *
 * Returns one DeviceCiphertext per recipient device. The caller sends the
 * whole array to the backend, which stores/fans out one ciphertext row per
 * device (see chat_events.handle_chat_message_event).
 */
export async function encryptForUser(
  myUserId: string,
  myUsername: string,
  username: string,
  plaintext: string
): Promise<DeviceCiphertext[]> {
  const myLocalDeviceId = await getLocalDeviceId(myUserId);

  const [theirBundles, myBundles] = await Promise.all([
    getDeviceBundlesWithRetry(username),
    // Don't bother fetching your own bundles if you're messaging yourself —
    // theirBundles already covers that case.
    username === myUsername ? Promise.resolve<RemoteDeviceBundle[]>([]) : getDeviceBundlesWithRetry(myUsername).catch(() => []),
  ]);

  const results: DeviceCiphertext[] = [];

  for (const bundle of theirBundles) {
    const envelope = await encryptToDevice(myUserId, username, plaintext, bundle);
    results.push({ ...envelope, recipient_user_id: username, recipient_device_id: bundle.device_id });
  }

  // Sync copies to my other devices (skip the device I'm sending FROM).
  for (const bundle of myBundles) {
    if (bundle.device_id === myLocalDeviceId) continue;
    const envelope = await encryptToDevice(myUserId, myUsername, plaintext, bundle);
    results.push({ ...envelope, recipient_user_id: myUserId, recipient_device_id: bundle.device_id });
  }

  return results;
}

/** Decrypts a message from `username`'s device `senderDeviceId`. */
export async function decryptFromUser(
  myUserId: string,
  username: string,
  senderDeviceId: number,
  envelope: SignalEnvelope,
  conversationId?: string
): Promise<string> {
  const store = getStore(myUserId);
  const address = addressFor(username, senderDeviceId);

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

    logEntry("debug", "decrypt", { username, senderDeviceId, msgType: envelope.msg_type });
    return new TextDecoder().decode(plaintextBuf);
  } catch (err: any) {
    logEntry("warn", "decrypt_failed_purging_session", { username, senderDeviceId, error: err?.message, msgType: envelope.msg_type });
    await store.removeSession(address.toString());
    if (conversationId) {
      notifySessionReset(conversationId).catch((e) => logEntry("error", "session_reset_notify_failed", { conversationId, error: e?.message }));
    }
    return "[Unable to decrypt message]";
  }
}

/** Forces a session reset with a specific device of `username`. */
export async function forceSessionReset(myUserId: string, username: string, deviceId: number): Promise<void> {
  const store = getStore(myUserId);
  const address = addressFor(username, deviceId);
  logEntry("info", "force_session_reset", { myUserId, username, deviceId });
  await store.removeSession(address.toString());
}

/** Forces a session reset with ALL of `username`'s currently known devices. */
export async function forceSessionResetAllDevices(myUserId: string, username: string): Promise<void> {
  try {
    const bundles = await getDeviceBundlesWithRetry(username);
    await Promise.all(bundles.map((b) => forceSessionReset(myUserId, username, b.device_id)));
  } catch (err) {
    logEntry("warn", "force_session_reset_all_failed", { username, error: String(err) });
  }
}
