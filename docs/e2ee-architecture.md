# DevPulse E2EE Chat — Architecture

> This document describes the **currently deployed** end-to-end encryption implementation in DevPulse.

---

## 1. Protocol Used

DevPulse uses the **Signal Protocol** — the same cryptography used by Signal, WhatsApp, and Google Messages.

It is composed of two layers:

| Layer | Protocol | Purpose |
|-------|----------|---------|
| Session setup | **X3DH** (Extended Triple Diffie-Hellman) | First-ever message between two users |
| Ongoing messages | **Double Ratchet** | Every message after that, with forward secrecy |

Library: `@privacyresearch/libsignal-protocol-typescript`

---

## 2. Key Types

| Key | Where It Lives | Who Can See It | Purpose |
|-----|---------------|----------------|---------|
| **Identity Key Pair (IK)** | Private → IndexedDB only. Public → backend DB | Server sees public only | Permanent identity, never rotates |
| **Signed PreKey (SPK)** | Private → IndexedDB. Public → backend DB | Server sees public only | Medium-term key, signed by IK |
| **One-Time PreKey (OPK)** | Private → IndexedDB. Public → backend DB | Server sees public, deletes after use | One-shot X3DH hardening, prevents replay |
| **Session State** | IndexedDB only | Nobody but this browser | Entire Double Ratchet chain key state |

> **The server never sees any private key. It cannot decrypt any message — ever.**

---

## 3. Full E2EE Flow

### 3.1 — Identity Setup (First Login or New Browser)

```
Browser                             Backend                         DB
  │                                    │                             │
  │  Load IndexedDB: identity key?     │                             │
  │  Load IndexedDB: signed prekey?    │                             │
  │                                    │                             │
  │  ── IF BOTH EXIST ───────────────────────────────────────────── │
  │     No-op. Return immediately.     │                             │
  │                                    │                             │
  │  ── IF MISSING ──────────────────────────────────────────────── │
  │     Generate identity key pair     │                             │
  │     Generate registration ID       │                             │
  │     Generate signed prekey         │                             │
  │     Generate 20 one-time prekeys   │                             │
  │     Store ALL private keys         │                             │
  │     in IndexedDB (never sent)      │                             │
  │                                    │                             │
  │  POST /chat/keys ──────────────────────────────────────────────►│
  │  {                                 │                             │
  │    identity_key  (public only)     │  users.identity_public_key  │
  │    signed_prekey (pub + signature) │  signed_prekeys table       │
  │    one_time_prekeys (pub x20)      │  one_time_prekeys table     │
  │  }                                 │                             │
```

---

### 3.2 — First Message to Someone (X3DH Key Exchange)

Alice wants to message Bob for the first time. Bob can be offline.

```
Alice's Browser                     Backend                  Bob's Browser
       │                               │                           │
       │  GET /chat/keys/bob           │                           │
       │ ─────────────────────────────►│                           │
       │                               │  Fetch Bob's public bundle│
       │                               │  Pop + DELETE one OPK     │
       │ ◄──────────────── {           │                           │
       │   identity_key,               │                           │
       │   registration_id,            │                           │
       │   signed_prekey,              │                           │
       │   one_time_prekey ← deleted   │                           │
       │ }                             │                           │
       │                               │                           │
       │  X3DH computation:            │                           │
       │  EK = generate ephemeral key  │                           │
       │  DH1 = DH(IK_Alice, SPK_Bob)  │                           │
       │  DH2 = DH(EK,        IK_Bob)  │                           │
       │  DH3 = DH(EK,        SPK_Bob) │                           │
       │  DH4 = DH(EK,        OPK_Bob) │  ← if OPK was available  │
       │  MasterSecret = KDF(DH1‖DH2‖DH3‖DH4)                    │
       │                               │                           │
       │  Session + Double Ratchet     │                           │
       │  initialized from MasterSecret│                           │
       │  Stored in IndexedDB          │                           │
```

> Bob performs the same X3DH with his private keys when he decrypts the first message — both arrive at the same `MasterSecret` with **zero interaction needed from Bob beforehand**.

---

### 3.3 — Sending a Message (Double Ratchet)

```
Alice's Browser              Backend (WebSocket)         Bob's Browser
       │                           │                           │
       │  plaintext = "Hello"      │                           │
       │                           │                           │
       │  SessionCipher.encrypt()  │                           │
       │  ↳ advances ratchet       │                           │
       │  ↳ old chain key deleted  │                           │
       │  ↳ produces ciphertext    │                           │
       │                           │                           │
       │  WS send: {         ─────►│                           │
       │    conversation_id,       │  Save Message to DB       │
       │    content (ciphertext),  │  Relay to Bob             │
       │    msg_type: 1            │ ─────────────────────────►│
       │  }                        │                           │
       │                           │                    receive WS event
       │                           │                    SessionCipher.decrypt()
       │                           │                    ↳ advances Bob's ratchet
       │                           │                    ↳ produces "Hello"
```

**`msg_type` values:**
- `3` = `PreKeyWhisperMessage` — first-ever message, contains ephemeral key inline
- `1` = `WhisperMessage` — all subsequent messages

The backend stores `msg_type` so the recipient knows which decryption method to call. It never interprets the ciphertext itself.

---

### 3.4 — Session Recovery (Bad MAC / Desync)

If decryption fails (sessions desynced after a browser clear, server restart, etc.):

```
Bob's Browser                     Backend                Alice's Browser
      │                               │                        │
      │  decrypt() → Bad MAC error    │                        │
      │  removeSession() from IDB     │                        │
      │                               │                        │
      │  POST /chat/{id}/session-reset│                        │
      │ ─────────────────────────────►│                        │
      │                               │  Send WS event:        │
      │                               │  { type:"session_reset"│
      │                               │    conversation_id }   │
      │                               │ ──────────────────────►│
      │                               │                        │
      │                               │                   removeSession() from IDB
      │                               │                        │
      │  Next message Alice sends:    │                        │
      │  X3DH again (PreKeyMsg) ◄─────────────────────────────│
      │  Fresh session established    │                        │
```

> Both sides reset together. Without this, only one side was resetting while the other kept encrypting with the invalid session — causing every subsequent message to also fail.

---

## 4. Storage Architecture

### Client-Side — IndexedDB (private keys, never leaves browser)

```
IndexedDB: devpulse_signal_store_{userId}
  kv store:
    "identityKey"               → {pubKey, privKey}
    "registrationId"            → number
    "signedPreKey:1"            → {pubKey, privKey}
    "preKey:1" ... "preKey:20"  → {pubKey, privKey}
    "session:{username}.1"      → Double Ratchet session record
    "identityKeyFor:{username}" → trusted remote public identity
```

> Clearing browser site data or switching browsers = **new identity, no access to old messages**. This is by design.

### Server-Side — PostgreSQL (public keys + ciphertext only)

```
users
  identity_public_key  TEXT   ← public only
  registration_id      INT

signed_prekeys
  user_id, key_id, public_key, signature

one_time_prekeys
  user_id, key_id, public_key
  ↳ row is DELETED after a single X3DH use

messages
  conversation_id, sender_id
  content   TEXT  ← base64 ciphertext (server cannot decrypt)
  msg_type  INT   ← 3 or 1, tells recipient which cipher method to call
```

---

## 5. Concurrency & Safety Mechanisms

| Mechanism | File | What It Prevents |
|-----------|------|-----------------|
| `pendingSetups` Map | `signal-e2ee.ts` | Two concurrent `ensureIdentitySetUp()` calls racing to upload two different identities |
| `sessionEstablishmentLocks` Map | `signal-e2ee.ts` | Concurrent first-messages building two conflicting X3DH sessions |
| Sequential history decrypt (`for...of`) | `chat/page.tsx` | `Promise.all` racing IndexedDB ratchet reads/writes, causing Bad MAC |
| `processedMessageIds` Set | `chat/page.tsx` | WebSocket reconnect replaying a message and decrypting it twice |
| `/session-reset` endpoint | Backend + frontend | Bilateral reset so both sender and recipient recover together |

---

## 6. Pros

| Benefit | Explanation |
|---------|-------------|
| **Proven cryptography** | Signal Protocol is formally verified (ProVerif). Not custom crypto. Used by billions. |
| **True E2EE** | Server stores ciphertext it cannot read. Private keys never transmitted. |
| **Forward secrecy** | Each message key is derived fresh and deleted after use. Past messages safe even if keys leak. |
| **Break-in recovery** | Double Ratchet "heals" after compromise — future messages get fresh keys automatically. |
| **Zero UX burden** | Keys are generated, stored, and rotated automatically. Users do nothing. |
| **OPK replay protection** | One-time prekeys consumed server-side on first contact — X3DH cannot be replayed. |
| **Per-user IndexedDB scope** | Multiple accounts in same browser don't overwrite each other's sessions. |
| **Bilateral recovery** | Session reset propagates to both sides — not just the failing party. |

---

## 7. Cons / Limitations

| Limitation | Impact |
|------------|--------|
| **Browser-locked** | Private keys live only in IndexedDB. New browser or cleared storage = new identity, old messages unreadable. |
| **No key backup** | No way to restore sessions after clearing storage. Clear data = lose everything. |
| **Community library** | Not Signal's official `libsignal` (C/Rust). The TS port may lag in edge-case bug fixes. |
| **TOFU only** | No safety number / QR verification. Users can't confirm identity — vulnerable to server-side MITM substitution. |
| **Sender identity exposed** | `sender_id` stored in plaintext in the DB. Server knows who messaged whom and when. |
| **No Sealed Sender** | Signal hides sender identity from the server even for metadata. Not implemented here. |
| **OPK exhaustion** | After 20 sessions without re-login, new sessions use SPK only. Still secure but slightly weaker. |
| **Group chats are plaintext** | Only 1-on-1 DMs are E2EE encrypted. Group conversations are not. |

---

## 8. Is This the Standard Approach?

**Yes — the cryptographic core is exactly the Signal standard.**

X3DH + Double Ratchet is the industry reference for E2EE messaging. The same protocol is used by:

- Signal (reference implementation)
- WhatsApp (2 billion users)
- Google Messages (RCS E2EE)
- Facebook Messenger (secret conversations)
- Wire, Skype private conversations

### DevPulse vs. Signal Production

| Feature | DevPulse | Signal |
|---------|----------|--------|
| X3DH session setup | ✅ | ✅ |
| Double Ratchet (forward secrecy) | ✅ | ✅ |
| One-time prekeys | ✅ | ✅ |
| Bilateral session reset | ✅ | ✅ |
| Per-user key scope | ✅ | ✅ |
| **Sealed Sender** | ❌ | ✅ Server can't see sender |
| **Safety Numbers / Verification** | ❌ | ✅ |
| **Encrypted key backup** | ❌ | ✅ |
| **OPK auto-replenishment** | ❌ (re-login only) | ✅ Background |
| **Group E2EE (Sender Keys)** | ❌ | ✅ |

### The Three Most Important Gaps

**1. Sealed Sender** — Without it, the server knows the social graph: who messages whom, how often, at what times. The server cannot read content, but it can read metadata. Signal's Sealed Sender hides even the sender's identity from the relay server.

**2. Safety Numbers** — Without identity verification, a compromised server could swap Bob's public key with an attacker's, and Alice would silently encrypt to the attacker. TOFU (Trust On First Use) means the first contact is trusted forever with no way to confirm it wasn't already intercepted.

**3. Group E2EE** — Signal uses the Sender Key protocol for groups: each member distributes a Sender Key once, then encrypts each message once — not once per member. DevPulse group chats are currently plaintext.

---

## 9. Verdict

> DevPulse uses the correct, battle-tested E2EE protocol for 1-on-1 chats. The cryptography is sound. The gaps (no sealed sender, no key backup, no group E2EE) are **missing features, not broken protocol** — they are the natural next implementation steps for a production-grade system.
