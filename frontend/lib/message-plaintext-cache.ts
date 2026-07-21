"use client";

/**
 * Caches decrypted plaintext for messages, keyed by message id — for BOTH
 * directions:
 *
 * - Messages you SENT: can never be decrypted again after sending (Signal
 *   Protocol's ratchet moves forward on encrypt), so we cache the plaintext
 *   at send time.
 * - Messages you RECEIVED: the message key used to decrypt a given message
 *   is deleted immediately after first use (this is what gives Signal
 *   Protocol its forward secrecy — a compromised key later can't decrypt
 *   past messages). This means re-opening a chat or reloading the page and
 *   attempting to decrypt the same historical ciphertext AGAIN will fail,
 *   because that one-time key is already gone. So received messages must
 *   also be cached the first time they're successfully decrypted.
 *
 * Scoped per user (localStorage), single-device only — matches the rest of
 * this project's E2EE scope.
 */

function storageKey(userId: string): string {
  return `devpulse_msg_plaintext_cache_${userId}`;
}

function readCache(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(userId: string, cache: Record<string, string>): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(cache));
  } catch {
    // ignore quota errors — worst case, some older messages become unreadable
  }
}

export function cacheMessagePlaintext(userId: string, messageId: string, plaintext: string): void {
  const cache = readCache(userId);
  cache[messageId] = plaintext;
  writeCache(userId, cache);
}

export function getCachedMessagePlaintext(userId: string, messageId: string): string | undefined {
  return readCache(userId)[messageId];
}