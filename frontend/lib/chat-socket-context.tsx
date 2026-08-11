"use client";

/**
 * ChatSocketProvider — MULTI-DEVICE version
 * ───────────────────
 * Owns ONE WebSocket connection for the entire app, opened once when the
 * user is authenticated and kept alive across route changes.
 *
 * MULTI-DEVICE CHANGE: the socket URL now includes this browser's Signal
 * Protocol device id (?device_id=N) so the backend can route per-device
 * ciphertexts to the correct connection (see connection_manager.py). The
 * device id comes from IndexedDB via signal-e2ee's ensureIdentitySetUp,
 * which must have already run (E2EEProvider does this) before this
 * connects — if it hasn't finished yet, we fall back to device_id=1 and
 * the socket will simply reconnect with the correct id once available.
 *
 * `sendMessage` now takes an array of per-recipient-device ciphertexts
 * (produced by encryptForUser in signal-e2ee.ts) instead of a single
 * content/msg_type pair — the server needs one ciphertext per device to
 * fan out correctly.
 *
 * NOTE ON DESKTOP NOTIFICATIONS: unchanged — see chat/page.tsx for why
 * notifications aren't triggered from this layer.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth-context";
import type { ChatMessageResponse } from "./api";

interface PresenceEvent {
  type: "presence";
  user_id: string;
  online: boolean;
}

interface ChatMessageEvent extends ChatMessageResponse {
  type: "chat_message";
  sender_device_id?: number;
}

interface ReactionUpdateEvent {
  type: "reaction_update";
  message_id: string;
  reactions: { user_id: string; emoji: string }[];
}

interface MessagesReadEvent {
  type: "messages_read";
  conversation_id: string;
  message_ids: string[];
  read_by: string;
}

interface SessionResetEvent {
  type: "session_reset";
  conversation_id: string;
  from_user_id: string;
}

type IncomingEvent = PresenceEvent | ChatMessageEvent | ReactionUpdateEvent | MessagesReadEvent | SessionResetEvent;

export interface OutgoingDeviceCiphertext {
  recipient_user_id: string;
  recipient_device_id: number;
  content: string;
  msg_type: number;
}

interface ChatSocketContextValue {
  isConnected: boolean;
  onlineUsers: Set<string>;
  /** ciphertexts: one entry per recipient device (including sender's own other devices).
   *  content: plaintext for group/non-E2EE messages (only used when ciphertexts is empty). */
  sendMessage: (
    conversationId: string,
    ciphertexts: OutgoingDeviceCiphertext[],
    imageUrl?: string | null,
    content?: string | null
  ) => void;
  sendReaction: (messageId: string, emoji: string) => void;
  onChatMessage: (handler: (msg: ChatMessageEvent) => void) => () => void;
  onReactionUpdate: (handler: (msg: ReactionUpdateEvent) => void) => () => void;
  onMessagesRead: (handler: (event: MessagesReadEvent) => void) => () => void;
  onSessionReset: (handler: (event: SessionResetEvent) => void) => () => void;
}

const ChatSocketContext = createContext<ChatSocketContextValue | null>(null);

const RECONNECT_DELAY_MS = 2000;

function dbNameForDeviceLookup(userId: string): string {
  return `devpulse_signal_store_${userId}`;
}

/** Reads this browser's registered device id straight out of IndexedDB
 *  (mirrors SignalProtocolStore.getLocalDeviceId, kept independent here to
 *  avoid a circular import between chat-socket-context and signal-e2ee). */
function getLocalDeviceId(userId: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbNameForDeviceLookup(userId), 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) {
          resolve(1);
          return;
        }
        const tx = db.transaction("kv", "readonly");
        const getReq = tx.objectStore("kv").get("localDeviceId");
        getReq.onsuccess = () => resolve(typeof getReq.result === "number" ? getReq.result : 1);
        getReq.onerror = () => resolve(1);
      };
      req.onerror = () => resolve(1);
    } catch {
      resolve(1);
    }
  });
}

export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);

  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const chatMessageHandlers = useRef(new Set<(msg: ChatMessageEvent) => void>());
  const reactionHandlers = useRef(new Set<(msg: ReactionUpdateEvent) => void>());
  const messagesReadHandlers = useRef(new Set<(event: MessagesReadEvent) => void>());
  const sessionResetHandlers = useRef(new Set<(event: SessionResetEvent) => void>());

  const connect = useCallback(async () => {
    if (!user) return;
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

    const baseApi =
      process.env.NEXT_PUBLIC_WS_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, "ws") ||
      process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/^http/, "ws") ||
      "wss://13.126.205.138.nip.io";
    const wsUrl = baseApi.replace(/\/$/, "");
    const token = localStorage.getItem("devpulse_access_token") || "";
    const deviceId = await getLocalDeviceId(user.id);

    const params = new URLSearchParams();
    if (token) params.set("token", token);
    params.set("device_id", String(deviceId));

    const socket = new WebSocket(`${wsUrl}/chat/ws?${params.toString()}`);

    socket.onopen = () => setIsConnected(true);

    socket.onclose = () => {
      setIsConnected(false);
      socketRef.current = null;
      if (shouldReconnectRef.current && user) {
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onmessage = (event: MessageEvent) => {
      let data: IncomingEvent;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "presence") {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          if (data.online) next.add(data.user_id);
          else next.delete(data.user_id);
          return next;
        });
      } else if (data.type === "chat_message") {
        const { type, ...msg } = data;
        // Just relay it — decryption + desktop notifications happen
        // downstream in chat/page.tsx where the E2EE session state lives.
        // msg.sender_device_id tells the decrypt layer WHICH of the
        // sender's devices' sessions to use.
        chatMessageHandlers.current.forEach((h) => h(data as ChatMessageEvent));
      } else if (data.type === "reaction_update") {
        reactionHandlers.current.forEach((h) => h(data));
      } else if (data.type === "messages_read") {
        messagesReadHandlers.current.forEach((h) => h(data));
      } else if (data.type === "session_reset") {
        sessionResetHandlers.current.forEach((h) => h(data));
      }
    };

    socketRef.current = socket;
  }, [user]);

  useEffect(() => {
    shouldReconnectRef.current = true;

    if (user) {
      connect();
    } else {
      shouldReconnectRef.current = false;
      socketRef.current?.close();
      socketRef.current = null;
      setIsConnected(false);
      setOnlineUsers(new Set());
    }

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const sendMessage = useCallback(
    (conversationId: string, ciphertexts: OutgoingDeviceCiphertext[], imageUrl?: string | null, content?: string | null) => {
      socketRef.current?.send(
        JSON.stringify({
          conversation_id: conversationId,
          ciphertexts,
          // content is only used by the backend legacy path (when ciphertexts is empty)
          // e.g. group chats, image-only messages, or non-E2EE conversations.
          content: content ?? null,
          image_url: imageUrl ?? null,
        })
      );
    },
    []
  );

  const sendReaction = useCallback((messageId: string, emoji: string) => {
    socketRef.current?.send(
      JSON.stringify({ type: "reaction", message_id: messageId, emoji })
    );
  }, []);

  const onChatMessage = useCallback((handler: (msg: ChatMessageEvent) => void) => {
    chatMessageHandlers.current.add(handler);
    return () => {
      chatMessageHandlers.current.delete(handler);
    };
  }, []);

  const onReactionUpdate = useCallback((handler: (msg: ReactionUpdateEvent) => void) => {
    reactionHandlers.current.add(handler);
    return () => {
      reactionHandlers.current.delete(handler);
    };
  }, []);

  const onMessagesRead = useCallback((handler: (event: MessagesReadEvent) => void) => {
    messagesReadHandlers.current.add(handler);
    return () => {
      messagesReadHandlers.current.delete(handler);
    };
  }, []);

  const onSessionReset = useCallback((handler: (event: SessionResetEvent) => void) => {
    sessionResetHandlers.current.add(handler);
    return () => {
      sessionResetHandlers.current.delete(handler);
    };
  }, []);

  return (
    <ChatSocketContext.Provider
      value={{
        isConnected,
        onlineUsers,
        sendMessage,
        sendReaction,
        onChatMessage,
        onReactionUpdate,
        onMessagesRead,
        onSessionReset,
      }}
    >
      {children}
    </ChatSocketContext.Provider>
  );
}

export function useChatSocket(): ChatSocketContextValue {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) {
    throw new Error("useChatSocket must be used within <ChatSocketProvider>");
  }
  return ctx;
}
