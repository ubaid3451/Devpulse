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
const ONE_TIME_PREKEY_BATCH_SIZE = 50;

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(base64: string): ArrayBuffer {
  const binary = atob(base64);
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

/**
 * Ensures this browser has a Signal Protocol identity set up for `userId`,
 * generating one (and uploading the public bundle) if this is the first
 * time. Safe to call on every login — it's a no-op after the first
 * successful run for that user.
 */
export async function ensureIdentitySetUp(userId: string): Promise<void> {
  const store = getStore(userId);
  const existing = await store.getIdentityKeyPair();
  if (existing) return; // already set up in this browser for this user

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
      key_id: i,
      public_key: bufToBase64(preKey.keyPair.pubKey),
    });
  }

  await uploadKeyBundle({
    identity_public_key: bufToBase64(identityKeyPair.pubKey),
    registration_id: registrationId,
    signed_prekey: {
      key_id: signedPreKeyId,
      public_key: bufToBase64(signedPreKey.keyPair.pubKey),
      signature: bufToBase64(signedPreKey.signature),
    },
    one_time_prekeys: oneTimePreKeys,
  });
}

function addressFor(username: string): SignalProtocolAddress {
  return new SignalProtocolAddress(username, DEVICE_ID);
}

/** Builds a session with `username` via X3DH if one doesn't already exist. */
async function ensureSessionWith(myUserId: string, username: string): Promise<void> {
  const store = getStore(myUserId);
  const address = addressFor(username);
  const existingSession = await store.loadSession(address.toString());
  if (existingSession) return;

  const bundle = await getKeyBundle(username);

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
  await ensureSessionWith(myUserId, username);

  const store = getStore(myUserId);
  const address = addressFor(username);
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