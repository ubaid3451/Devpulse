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
import { uploadKeyBundle, getKeyBundle } from "./api";

const DEVICE_ID = 1; // single-device scope for this project
const ONE_TIME_PREKEY_BATCH_SIZE = 20;

function bufToBase64(buf: ArrayBuffer | undefined): string {
  const bytes = new Uint8Array(buf!);
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

  // Always generate a fresh identity keypair and signed prekey so signature verification
  // is 100% valid and overwrites any corrupted legacy DB records.
  const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
  const registrationId = KeyHelper.generateRegistrationId();

  await store.setIdentityKeyPair(identityKeyPair);
  await store.setLocalRegistrationId(registrationId);

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
  let lastError: unknown;

  for (let attempt = 0; attempt <= KEY_BUNDLE_FETCH_RETRIES; attempt++) {
    try {
      return await getKeyBundle(username);
    } catch (err) {
      lastError = err;
      if (attempt === KEY_BUNDLE_FETCH_RETRIES) break;
      const delay = KEY_BUNDLE_RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `⚠️ Fetching key bundle for "${username}" failed (attempt ${attempt + 1}/${
          KEY_BUNDLE_FETCH_RETRIES + 1
        }), retrying in ${delay}ms...`,
        err
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/** Builds a session with `username` via X3DH if one doesn't already exist. */
async function ensureSessionWith(myUserId: string, username: string, forceRefresh = false): Promise<void> {
  const store = getStore(myUserId);
  const address = addressFor(username);

  if (forceRefresh) {
    await store.removeSession(address.toString());
  } else {
    const existingSession = await store.loadSession(address.toString());
    if (existingSession) return;
  }

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
}

export interface SignalEnvelope {
  content: string; // base64 ciphertext body
  msg_type: number; // 3 = PreKeyWhisperMessage (first msg), 1 = WhisperMessage (subsequent)
}

/** Encrypts plaintext to send to `username`, establishing a session first if needed. */
export async function encryptForUser(myUserId: string, username: string, plaintext: string): Promise<SignalEnvelope> {
  const store = getStore(myUserId);
  const address = addressFor(username);

  try {
    await ensureSessionWith(myUserId, username);
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
  } catch (err: any) {
    // If the existing session is stale/corrupt (e.g. invalid signature from old key),
    // delete local session state, force re-fetching latest bundle, and retry once.
    console.warn(`Signal encryption failed for ${username}, resetting session & retrying...`, err);
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
export async function decryptFromUser(myUserId: string, username: string, envelope: SignalEnvelope): Promise<string> {
  const store = getStore(myUserId);
  const address = addressFor(username);
  const cipher = new SessionCipher(store as any, address);

  const bodyBuf = base64ToBuf(envelope.content);
  const bodyBinaryString = Array.from(new Uint8Array(bodyBuf), (b) => String.fromCharCode(b)).join("");

  let plaintextBuf: ArrayBuffer;
  if (envelope.msg_type === 3) {
    plaintextBuf = await cipher.decryptPreKeyWhisperMessage(bodyBinaryString, "binary");
  } else {
    plaintextBuf = await cipher.decryptWhisperMessage(bodyBinaryString, "binary");
  }

  return new TextDecoder().decode(plaintextBuf);
}