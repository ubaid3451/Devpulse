"use client";

/**
 * ChatSocketProvider
 * ───────────────────
 * Owns ONE WebSocket connection for the entire app, opened once when the
 * user is authenticated and kept alive across route changes (dashboard,
 * feed, chat, profile, etc). Components consume it via useChatSocket()
 * instead of creating their own `new WebSocket(...)`.
 *
 * Why this matters:
 * - Previously the socket lived inside chat/page.tsx, so navigating away
 *   from /chat closed the connection and lost real-time updates (e.g. new
 *   message notifications) until the user reopened the chat page.
 * - A single root-level socket means presence, new messages, and reactions
 *   keep flowing everywhere in the app, not just while /chat is mounted.
 *
 * NOTE: This context is deliberately "dumb" about content — it just relays
 * raw events off the wire. Desktop notifications live in chat/page.tsx
 * instead, because that's the only place where messages get decrypted and
 * where we know the real sender's display name. Triggering a notification
 * here would either show ciphertext or a generic "Someone" label.
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

// ── Event payload types coming from the server ──────────────────────────────

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

type IncomingEvent = PresenceEvent | ChatMessageEvent | ReactionUpdateEvent;

// ── Context shape ────────────────────────────────────────────────────────────

interface ChatSocketContextValue {
  isConnected: boolean;
  onlineUsers: Set<string>;
  /** Send a new chat message into a conversation. */
  sendMessage: (
    conversationId: string,
    content: string,
    imageUrl?: string | null,
    msgType?: number | null
  ) => void;
  /** Toggle/replace a reaction on a message. */
  sendReaction: (messageId: string, emoji: string) => void;
  /** Subscribe to incoming chat_message events. Returns an unsubscribe fn. */
  onChatMessage: (handler: (msg: ChatMessageResponse) => void) => () => void;
  /** Subscribe to incoming reaction_update events. Returns an unsubscribe fn. */
  onReactionUpdate: (handler: (msg: ReactionUpdateEvent) => void) => () => void;
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

  // Handler registries so multiple pages/components can subscribe independently
  const chatMessageHandlers = useRef(new Set<(msg: ChatMessageResponse) => void>());
  const reactionHandlers = useRef(new Set<(msg: ReactionUpdateEvent) => void>());

  const connect = useCallback(() => {
    if (!user) return;
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

    const wsUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, "ws") || "ws://localhost:8000";
    const socket = new WebSocket(`${wsUrl}/chat/ws`);

    socket.onopen = () => setIsConnected(true);

    socket.onclose = () => {
      setIsConnected(false);
      socketRef.current = null;
      // Auto-reconnect while the user is still logged in (e.g. after a network blip)
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

        // Just relay the raw event. Decryption + desktop notifications
        // happen downstream in chat/page.tsx, where we actually have the
        // keys and the sender's real name.
        chatMessageHandlers.current.forEach((h) => h(chatMsg));
      } else if (data.type === "reaction_update") {
        reactionHandlers.current.forEach((h) => h(data));
      }
    };

    socketRef.current = socket;
  }, [user]);

  useEffect(() => {
    shouldReconnectRef.current = true;

    if (user) {
      connect();
    } else {
      // Logged out — tear down the connection
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

  return (
    <ChatSocketContext.Provider
      value={{
        isConnected,
        onlineUsers,
        sendMessage,
        sendReaction,
        onChatMessage,
        onReactionUpdate,
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