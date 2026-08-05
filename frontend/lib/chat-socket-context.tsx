"use client";

/**
 * ChatSocketProvider
 * ───────────────────
 * Owns ONE WebSocket connection for the entire app, opened once when the
 * user is authenticated and kept alive across route changes.
 *
 * NOTE ON DESKTOP NOTIFICATIONS: this context deliberately does NOT trigger
 * desktop notifications, even though it's tempting to do so right here where
 * every message arrives. The reason: for E2EE conversations, `chatMsg.content`
 * at this layer is still base64 CIPHERTEXT — this context has no access to
 * the Signal Protocol session state needed to decrypt it (that lives in
 * chat/page.tsx via useE2EE()). Notifying from here would show raw
 * gibberish instead of the actual message. Desktop notifications are
 * triggered from chat/page.tsx's onChatMessage subscriber instead, AFTER
 * decryption has produced real plaintext.
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

type IncomingEvent = PresenceEvent | ChatMessageEvent | ReactionUpdateEvent | MessagesReadEvent;

interface ChatSocketContextValue {
  isConnected: boolean;
  onlineUsers: Set<string>;
  sendMessage: (
    conversationId: string,
    content: string,
    imageUrl?: string | null,
    msgType?: number | null
  ) => void;
  sendReaction: (messageId: string, emoji: string) => void;
  onChatMessage: (handler: (msg: ChatMessageResponse) => void) => () => void;
  onReactionUpdate: (handler: (msg: ReactionUpdateEvent) => void) => () => void;
  onMessagesRead: (handler: (event: MessagesReadEvent) => void) => () => void;
}

const ChatSocketContext = createContext<ChatSocketContextValue | null>(null);

const RECONNECT_DELAY_MS = 2000;

export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);

  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const chatMessageHandlers = useRef(new Set<(msg: ChatMessageResponse) => void>());
  const reactionHandlers = useRef(new Set<(msg: ReactionUpdateEvent) => void>());
  const messagesReadHandlers = useRef(new Set<(event: MessagesReadEvent) => void>());

  const connect = useCallback(() => {
    if (!user) return;
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

    const baseApi =
      process.env.NEXT_PUBLIC_WS_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, "ws") ||
      process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/^http/, "ws") ||
      "wss://secrets-setting-stamp-five.trycloudflare.com";
    const wsUrl = baseApi.replace(/\/$/, "");
    const token = localStorage.getItem("devpulse_access_token") || "";
    const socket = new WebSocket(`${wsUrl}/chat/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`);

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
        const chatMsg = msg as ChatMessageResponse;
        // Just relay it — decryption + desktop notifications happen
        // downstream in chat/page.tsx where the E2EE session state lives.
        chatMessageHandlers.current.forEach((h) => h(chatMsg));
      } else if (data.type === "reaction_update") {
        reactionHandlers.current.forEach((h) => h(data));
      } else if (data.type === "messages_read") {
        messagesReadHandlers.current.forEach((h) => h(data));
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
    (conversationId: string, content: string, imageUrl?: string | null, msgType?: number | null) => {
      socketRef.current?.send(
        JSON.stringify({
          conversation_id: conversationId,
          content,
          image_url: imageUrl ?? null,
          msg_type: msgType ?? null,
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

  const onChatMessage = useCallback((handler: (msg: ChatMessageResponse) => void) => {
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