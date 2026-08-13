"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChatSocket } from "@/lib/chat-socket-context";
import { useE2EE } from "@/lib/e2ee-context";
import { cacheMessagePlaintext, getCachedMessagePlaintext } from "@/lib/message-plaintext-cache";
import { requestNotificationPermission, showDesktopNotification, isTabHidden } from "@/lib/notifications";
import AppLayout from "@/components/AppLayout";
import CreateGroupModal from "@/components/CreateGroupModal";
import EmojiPicker, { Theme } from "emoji-picker-react";
import {
  getConversations,
  ConversationResponse,
  getChatHistory,
  ChatMessageResponse,
  searchUsers,
  AuthorResponse,
  uploadChatImage,
  startDirectConversation,
  hideConversation,
  markConversationRead,
} from "@/lib/api";

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUsername = searchParams.get("user"); // optional: ?user=someusername
  const { user: currentUser } = useAuth();
  const { onlineUsers, sendMessage, sendReaction, onChatMessage, onReactionUpdate, onMessagesRead, onSessionReset } =
    useChatSocket();
  const { isReady: e2eeReady, myDeviceId, encryptFor, decryptFrom, forceSessionResetAllDevices } = useE2EE();

  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
  const [inputText, setInputText] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AuthorResponse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolvingConversation, setIsResolvingConversation] = useState(false);

  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const confirmDelete = async (conversationId: string) => {
    setDeletingId(conversationId);
    try {
      await hideConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.conversation_id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
    } catch (err) {
      console.error("Failed to delete conversation", err);
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingSentPlaintexts = useRef<string[]>([]);
  const conversationsRef = useRef<ConversationResponse[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  // This browser's Signal Protocol device id — from E2EE context, set once
  // ensureIdentitySetUp finishes. Used to tag REST calls so the backend
  // returns THIS device's ciphertext rows rather than another device's.
  const myDeviceIdRef = useRef<number>(1);
  useEffect(() => { myDeviceIdRef.current = myDeviceId; }, [myDeviceId]);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);

  const [decryptedPreviews, setDecryptedPreviews] = useState<Record<string, string>>({});

  // Track processed message IDs to prevent double-decryption on WebSocket reconnect/replay
  const processedMessageIds = useRef<Set<string>>(new Set());

  const refreshConversations = () => {
    getConversations(myDeviceIdRef.current)
      .then(async (convos: ConversationResponse[]) => {
        setConversations(convos);

        if (!currentUser || !e2eeReady) return;

        const previews: Record<string, string> = {};
        await Promise.all(
          convos.map(async (convo: ConversationResponse) => {
            if (convo.is_group || !convo.last_message_id) return;

            const cached = getCachedMessagePlaintext(currentUser.id, convo.last_message_id);
            if (cached !== undefined) {
              previews[convo.conversation_id] = cached;
              return;
            }

            if (!convo.last_message_encrypted) return;

            const otherUsername = convo.participants[0]?.username;
            if (!otherUsername || !convo.last_message || convo.last_message_msg_type == null) return;

            // Own message we don't have a cached plaintext for = sent from
            // another device — can't decrypt it here.
            const lastMessageSenderId = convo.last_message_sender_id;
            if (lastMessageSenderId === currentUser.id) {
              previews[convo.conversation_id] = convo.last_message || "[Sent message]";
              return;
            }

            try {
              const senderDeviceId: number = convo.last_message_sender_device_id ?? 1;
              const plaintext = await decryptFrom(
                otherUsername,
                senderDeviceId,
                { content: convo.last_message, msg_type: Number(convo.last_message_msg_type) },
                convo.conversation_id
              );
              cacheMessagePlaintext(currentUser.id, convo.last_message_id, plaintext);
              previews[convo.conversation_id] = plaintext;
            } catch (err) {
              console.error("Failed to decrypt preview for", convo.conversation_id, err);
            }
          })
        );
        setDecryptedPreviews((prev) => ({ ...prev, ...previews }));
      })
      .catch((err) => console.error("Failed to load conversations", err));
  };

  useEffect(() => {
    refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e2eeReady]);

  useEffect(() => {
    if (!initialUsername) return;
    setIsResolvingConversation(true);
    startDirectConversation(initialUsername)
      .then((res) => {
        setActiveConversationId(res.conversation_id);
        refreshConversations();
      })
      .catch((err) => {
        console.error("Failed to start conversation", err);
        const existing = conversations.find(
          (c) => !c.is_group && c.participants.some((p) => p.username === initialUsername)
        );
        if (existing) {
          setActiveConversationId(existing.conversation_id);
        } else if (err?.status === 403) {
          alert("You can't message this user.");
          router.replace("/chat");
        }
      })
      .finally(() => setIsResolvingConversation(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUsername]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    const convo = conversations.find((c) => c.conversation_id === activeConversationId);
    const otherUsername = !convo?.is_group ? convo?.participants[0]?.username : undefined;

    getChatHistory(activeConversationId, 50, undefined, myDeviceIdRef.current)
      .then(async (history) => {
        if (!e2eeReady) {
          setMessages(history);
          return;
        }
        // BUG FIX: Decrypt history SEQUENTIALLY, not concurrently via Promise.all.
        // The Double Ratchet is stateful — each decrypt advances the ratchet and
        // writes new state to IndexedDB. Concurrent decrypts race each other on those
        // reads/writes, advancing the ratchet out-of-order and causing Bad MAC on
        // every message that doesn't win the race.
        const decrypted: typeof history = [];
        for (const msg of history) {
          const cached = currentUser ? getCachedMessagePlaintext(currentUser.id, msg.id) : undefined;
          if (cached !== undefined) {
            decrypted.push({ ...msg, content: cached });
            continue;
          }

          if (msg.sender_id === currentUser?.id) {
            decrypted.push({ ...msg, content: msg.content || "Photo" });
            continue;
          }

          if (!msg.msg_type) {
            decrypted.push(msg);
            continue;
          }

          // For history we need the sender's username — in a 1-on-1 it's
          // always the other participant; in a group it's whoever sent it.
          const senderUsername = convo?.is_group
            ? convo.participants.find((p) => p.id === msg.sender_id)?.username ?? otherUsername
            : otherUsername;
          if (!senderUsername) {
            decrypted.push(msg);
            continue;
          }

          try {
            const senderDeviceId: number = (msg as any).sender_device_id ?? 1;
            const plaintext = await decryptFrom(
              senderUsername,
              senderDeviceId,
              { content: msg.content || "", msg_type: Number(msg.msg_type) },
              activeConversationId
            );
            if (currentUser) cacheMessagePlaintext(currentUser.id, msg.id, plaintext);
            decrypted.push({ ...msg, content: plaintext });
          } catch (err) {
            console.error("Failed to decrypt message", msg.id, err);
            decrypted.push({ ...msg, content: "[Unable to decrypt message]" });
          }
        }
        setMessages(decrypted);
      })
      .catch((err) => console.error("Failed to load history", err));
  }, [activeConversationId, conversations, e2eeReady, decryptFrom, currentUser]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(() => {
      searchUsers(searchQuery)
        .then(setSearchResults)
        .catch((err) => console.error("Failed to search users", err))
        .finally(() => setIsSearching(false));
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeConversationId) return;
    markConversationRead(activeConversationId)
      .then(() => {
        setConversations((prev) =>
          prev.map((c) =>
            c.conversation_id === activeConversationId ? { ...c, unread_count: 0 } : c
          )
        );
      })
      .catch((err) => console.error("Failed to mark conversation read", err));
  }, [activeConversationId, messages.length]);

  useEffect(() => {
    const unsub = onMessagesRead((event) => {
      if (event.conversation_id !== activeConversationIdRef.current) return;
      setMessages((prev) =>
        prev.map((m) =>
          event.message_ids.includes(m.id) ? { ...m, is_read: true } : m
        )
      );
    });
    return unsub;
  }, [onMessagesRead]);

  useEffect(() => {
    const unsubMessage = onChatMessage(async (msg) => {
      // Deduplication: skip if we've already processed this message ID
      // This prevents double-decryption on WebSocket reconnect/replay which
      // would advance the Double Ratchet twice on recipient but only once on sender
      if (processedMessageIds.current.has(msg.id)) {
        console.debug("[Signal:DEBUG] duplicate_message_skipped", { messageId: msg.id });
        return;
      }
      processedMessageIds.current.add(msg.id);

      const isOwnMessage = msg.sender_id === currentUser?.id;
      let plaintextContent = msg.content;
      let toAppend = msg;

      const msgConvo = conversationsRef.current.find((c) => c.conversation_id === msg.conversation_id);
      const otherUsername = msgConvo && !msgConvo.is_group ? msgConvo.participants[0]?.username : undefined;

      if (isOwnMessage) {
        const pending = pendingSentPlaintexts.current.shift();
        if (pending && currentUser) {
          cacheMessagePlaintext(currentUser.id, msg.id, pending);
          plaintextContent = pending;
        } else if (currentUser) {
          plaintextContent = getCachedMessagePlaintext(currentUser.id, msg.id) ?? msg.content;
        }
        toAppend = { ...msg, content: plaintextContent };
      } else if (msg.msg_type && e2eeReady && otherUsername) {
        try {
          const senderDeviceId: number = (msg as any).sender_device_id ?? 1;
          const plaintext = await decryptFrom(otherUsername, senderDeviceId, { content: msg.content || "", msg_type: Number(msg.msg_type) }, msg.conversation_id);
          if (currentUser) cacheMessagePlaintext(currentUser.id, msg.id, plaintext);
          plaintextContent = plaintext;
          toAppend = { ...msg, content: plaintext };
        } catch (err) {
          console.error("[Signal:ERROR] incoming_message_decrypt_failed", { messageId: msg.id, error: String(err) });
          plaintextContent = "[Unable to decrypt message]";
          toAppend = { ...msg, content: plaintextContent };
        }
      } else {
        toAppend = msg;
      }

      if (msg.conversation_id === activeConversationIdRef.current) {
        setMessages((prev) => [...prev, toAppend]);
      }

      if (!isOwnMessage && isTabHidden()) {
        const senderName =
          msgConvo?.is_group
            ? msgConvo.participants.find((p) => p.id === msg.sender_id)?.full_name
              || msgConvo.participants.find((p) => p.id === msg.sender_id)?.username
              || "Someone"
            : msgConvo?.participants[0]?.full_name || msgConvo?.participants[0]?.username || "Someone";

        showDesktopNotification({
          title: `New message from ${senderName}`,
          body: (msg.image_url && !plaintextContent ? "Sent an attachment" : plaintextContent) || "",
          tag: `chat-conv-${msg.conversation_id}`,
          onClick: () => {
            router.push(`/chat?id=${msg.conversation_id}`);
          },
        });
      }

      refreshConversations();
    });

    const unsubReaction = onReactionUpdate((update) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === update.message_id ? { ...m, reactions: update.reactions } : m))
      );
    });

    return () => {
      unsubMessage();
      unsubReaction();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChatMessage, onReactionUpdate, e2eeReady, decryptFrom, currentUser?.id]);

  // BUG FIX: Subscribe to session_reset events from the other party.
  // When the other side's decryption fails (Bad MAC), they send a session_reset
  // notification via the backend. We receive it here and purge OUR session too
  // so that the next encrypt call triggers a fresh X3DH handshake — both sides
  // re-establish together instead of only one side resetting.
  useEffect(() => {
    const unsub = onSessionReset((event) => {
      const convo = conversationsRef.current.find((c) => c.conversation_id === event.conversation_id);
      const otherUsername = convo && !convo.is_group ? convo.participants[0]?.username : undefined;
      if (!otherUsername) return;
      console.info("[Signal:INFO] session_reset_received_from_peer", { conversationId: event.conversation_id, otherUsername });
      forceSessionResetAllDevices(otherUsername).catch((err) =>
        console.error("[Signal:ERROR] session_reset_local_purge_failed", { otherUsername, error: String(err) })
      );
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSessionReset, forceSessionResetAllDevices]);

  const selectSearchResultUser = async (user: AuthorResponse) => {
    setSearchQuery("");
    try {
      const res = await startDirectConversation(user.username);
      setActiveConversationId(res.conversation_id);
      refreshConversations();
    } catch (err: any) {
      console.error("Failed to start conversation", err);
      const existing = conversations.find(
        (c) => !c.is_group && c.participants.some((p) => p.username === user.username)
      );
      if (existing) {
        setActiveConversationId(existing.conversation_id);
      } else if (err?.status === 403) {
        alert("You can't message this user.");
      }
    }
  };

  const sendChatMessage = async () => {
    if ((!inputText.trim() && !attachedImage) || !activeConversationId || isUploading) return;

    setIsUploading(true);
    let imageUrl: string | null = null;
    try {
      if (attachedImage) {
        const res = await uploadChatImage(attachedImage);
        imageUrl = res.image_url;
      }

      const convo = conversations.find((c) => c.conversation_id === activeConversationId);
      const otherUsername = !convo?.is_group ? convo?.participants[0]?.username : undefined;

      const plaintext = inputText.trim();

      if (otherUsername && e2eeReady && plaintext) {
        try {
          // encryptFor returns one DeviceCiphertext per active device of the
          // recipient + one per each of our own other devices (sync copies).
          const ciphertexts = await encryptFor(otherUsername, plaintext);
          if (!ciphertexts || ciphertexts.length === 0) {
            console.warn("[Signal:WARN] no_recipient_devices", { otherUsername });
            alert(`Couldn't send message: @${otherUsername} has not set up E2EE keys on the server yet. Ask them to log in to enable E2EE.`);
            return;
          }
          pendingSentPlaintexts.current.push(plaintext);
          sendMessage(activeConversationId, ciphertexts, imageUrl);
        } catch (encryptErr) {
          console.warn("[Signal:WARN] encrypt_failed", { otherUsername, error: String(encryptErr) });
          // Don't silently send plaintext — surface the error so the user
          // knows the message wasn't sent rather than being sent unencrypted.
          alert("Couldn't send message securely. Please try again.");
          return;
        }
      } else if (otherUsername && imageUrl) {
        // Image-only message in 1-on-1 direct chat
        sendMessage(activeConversationId, [], imageUrl);
      } else if (!otherUsername) {
        // Group chat — not E2EE yet, falls back to unencrypted server-side.
        sendMessage(activeConversationId, [], imageUrl, plaintext || null);
      }

      setInputText("");
      setAttachedImage(null);
      setShowEmojiPicker(false);
    } catch (err) {
      console.error("[Signal:ERROR] send_message_failed", { error: String(err) });
    } finally {
      setIsUploading(false);
    }
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    sendReaction(messageId, emoji);
    setActiveReactionMsgId(null);
  };

  const insertTextAtCursor = (prefix: string, suffix: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = inputText;

    const selectedText = text.substring(start, end) || "text";
    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);

    setInputText(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const activeConversation = conversations.find((c) => c.conversation_id === activeConversationId);
  const activeOtherParticipant = activeConversation?.participants[0];
  const headerTitle = activeConversation?.is_group
    ? activeConversation?.name || "Group chat"
    : activeOtherParticipant?.full_name || activeOtherParticipant?.username || "Chat";
  const headerAvatar = activeConversation?.is_group ? null : activeOtherParticipant?.avatar_url;
  const otherUserId = activeConversation?.is_group ? null : activeOtherParticipant?.id;

  const participantMap: Record<string, { avatar_url: string | null; name: string }> = {};
  activeConversation?.participants.forEach((p) => {
    participantMap[p.id] = { avatar_url: p.avatar_url ?? null, name: p.full_name || p.username };
  });
  if (currentUser) {
    participantMap[currentUser.id] = {
      avatar_url: currentUser.avatar_url ?? null,
      name: currentUser.full_name || currentUser.username,
    };
  }
  const getSenderInfo = (senderId: string) =>
    participantMap[senderId] || { avatar_url: null, name: "Unknown" };

  return (
    <AppLayout activeNav="messages">
      <div className="flex flex-1 overflow-hidden bg-surface text-on-surface w-full h-full">
        {/* Conversations Sidebar — full screen on mobile when no convo is active, hidden otherwise */}
        <div className={`${
          activeConversationId ? 'hidden md:flex' : 'flex'
        } md:flex flex-col md:w-72 lg:w-80 w-full shrink-0 border-r border-outline-variant bg-[#111318]`}>
          <div className="p-4 flex items-center justify-between border-b border-outline-variant/30">
            <h2 className="font-headline-sm text-headline-sm font-bold">Chats</h2>
            <button
              onClick={() => setShowCreateGroupModal(true)}
              title="New group"
              className="text-primary hover:bg-primary/10 p-2 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">group_add</span>
            </button>
          </div>

          <div className="px-4 py-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
              <input
                type="text"
                placeholder="Search developers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1e2025] border border-outline-variant/50 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {searchQuery.trim() ? (
              isSearching ? (
                <div className="p-4 text-center text-on-surface-variant text-sm">Searching...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => selectSearchResultUser(user)}
                    className="p-3 mx-2 my-1 rounded-lg cursor-pointer transition-colors flex items-center gap-3 hover:bg-[#1e2025]/50"
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-variant shrink-0 border border-outline-variant/30">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold">
                          {user.full_name?.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{user.full_name}</div>
                      <div className="text-[12px] text-primary">@{user.username}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-on-surface-variant text-sm">No users found.</div>
              )
            ) : (
              <>
                {conversations.filter((conv) => {
                    // Hide conversations where the other user was deleted (no participants left)
                    if (!conv.is_group && (!conv.participants[0] || !conv.participants[0].username)) return false;
                    return true;
                  }).map((conv) => {
                  const other = conv.participants[0];
                  const title = conv.is_group ? conv.name || "Group chat" : other?.full_name || other?.username;
                  const avatar = conv.is_group ? null : other?.avatar_url;
                  const isActive = activeConversationId === conv.conversation_id;
                  const isMenuOpen = openMenuId === conv.conversation_id;
                  const isPendingDelete = pendingDeleteId === conv.conversation_id;
                  const isDeleting = deletingId === conv.conversation_id;
                  const isBlocked = conv.is_blocked;

                  return (
                    <div
                      key={conv.conversation_id}
                      className={`group relative p-3 mx-2 my-1 rounded-lg transition-colors flex items-center gap-3 ${
                        isActive ? "bg-[#1e2025]" : "hover:bg-[#1e2025]/50"
                      } ${isBlocked ? 'opacity-60' : ''}`}
                    >
                      <div
                        onClick={() => setActiveConversationId(conv.conversation_id)}
                        className="flex flex-1 items-center gap-3 min-w-0 cursor-pointer"
                      >
                        <div className="relative">
                          {conv.is_group ? (
                            <div className="w-12 h-12 shrink-0 relative">
                              {conv.participants.slice(0, 3).map((p, i) => (
                                <div
                                  key={p.id}
                                  title={p.full_name || p.username}
                                  className="absolute w-7 h-7 rounded-full overflow-hidden bg-surface-variant border-2 border-[#111318]"
                                  style={{
                                    top: i === 0 ? 0 : i === 1 ? 10 : 10,
                                    left: i === 0 ? 5 : i === 1 ? 0 : 10,
                                    zIndex: 3 - i,
                                  }}
                                >
                                  {p.avatar_url ? (
                                    <img src={p.avatar_url} alt={p.username} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[9px] font-bold">
                                      {(p.full_name || p.username)?.substring(0, 1).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-variant shrink-0 border border-outline-variant/30">
                              {avatar ? (
                                <img src={avatar} alt={title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center font-bold">
                                  {title?.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                          )}
                          {!conv.is_group && other && onlineUsers.has(other.id) && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#111318]"></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm truncate">{title}</span>
                              {isBlocked && !conv.is_group && (
                                <span className="material-symbols-outlined text-[14px] text-red-400 shrink-0" title="Blocked">
                                  block
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-[13px] text-on-surface-variant truncate opacity-80">
                            {decryptedPreviews[conv.conversation_id]
                              ? decryptedPreviews[conv.conversation_id]
                              : conv.last_message_encrypted
                              ? "🔒 Encrypted message"
                              : conv.last_message || (conv.last_message_id ? "[Message]" : "No messages yet")}
                          </div>
                        </div>
                        {(conv.unread_count ?? 0) > 0 && (
                          <div className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#71d4ff] text-[#003548] text-[11px] font-bold flex items-center justify-center">
                            {(conv.unread_count ?? 0) > 99 ? "99+" : conv.unread_count}
                          </div>
                        )}
                      </div>

                      <div className="relative shrink-0">
                        <button
                          type="button"
                          aria-label={`More options for ${title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(isMenuOpen ? null : conv.conversation_id);
                          }}
                          className={`rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-white/10 hover:text-white ${
                            isMenuOpen ? "bg-white/10 text-white" : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">more_vert</span>
                        </button>

                        {isMenuOpen && (
                          <div
                            className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-outline-variant/40 bg-[#1e2025] shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setPendingDeleteId(conv.conversation_id);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                              Delete chat
                            </button>
                          </div>
                        )}
                      </div>

                      {isPendingDelete && (
                        <div
                          className="absolute inset-0 z-30 flex items-center justify-between gap-2 rounded-lg bg-[#1e2025] px-3 border border-red-500/30"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-xs text-on-surface truncate font-medium">Delete chat?</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              className="rounded px-2 py-1 text-xs text-on-surface-variant hover:bg-white/10"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => confirmDelete(conv.conversation_id)}
                              className="rounded bg-red-500/90 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                            >
                              {isDeleting ? "..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {conversations.length === 0 && (
                  <div className="p-8 text-center text-on-surface-variant text-sm">No conversations yet.</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Chat Area — shown on mobile only when a conversation is active */}
        <div className={`${
          activeConversationId ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col bg-[#0b0d10] relative min-w-0`}>
          {isResolvingConversation ? (
            <div className="flex-1 flex items-center justify-center text-on-surface-variant/50">
              <p className="text-title-lg font-medium">Loading conversation...</p>
            </div>
          ) : activeConversationId ? (
            <>
              <div className="h-16 px-3 sm:px-6 border-b border-outline-variant/30 flex justify-between items-center bg-[#0b0d10]/95 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {/* Back button — mobile only */}
                  <button
                    onClick={() => setActiveConversationId(null)}
                    className="md:hidden p-1.5 text-on-surface-variant hover:text-on-surface rounded-full hover:bg-surface-variant/30 transition-colors shrink-0"
                    aria-label="Back to conversations"
                  >
                    <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                  </button>
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-variant shrink-0">
                    {headerAvatar ? (
                      <img src={headerAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold">
                        {headerTitle?.substring(0, 2).toUpperCase() || "U"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold flex items-center gap-1.5 truncate">
                      <span className="truncate">{headerTitle}</span>
                      {activeConversation?.is_blocked && (
                        <span
                          className="material-symbols-outlined text-[16px] text-red-400 shrink-0"
                          title="Blocked"
                        >
                          block
                        </span>
                      )}
                      {!activeConversation?.is_group && e2eeReady && !activeConversation?.is_blocked && (
                        <span
                          className="material-symbols-outlined text-[15px] text-green-500 shrink-0"
                          title="Messages are end-to-end encrypted"
                        >
                          lock
                        </span>
                      )}
                    </div>
                    {activeConversation?.is_blocked ? (
                      <div className="text-[12px] text-red-400 font-medium">Blocked user</div>
                    ) : (
                      otherUserId && onlineUsers.has(otherUserId) && (
                        <div className="text-[12px] text-green-500 font-medium">Online</div>
                      )
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 text-on-surface-variant shrink-0">
                  <button onClick={() => alert("Audio calls coming soon!")} className="hover:text-primary transition-colors"><span className="material-symbols-outlined text-[22px]">call</span></button>
                  <button onClick={() => alert("Video calls coming soon!")} className="hover:text-primary transition-colors"><span className="material-symbols-outlined text-[22px]">videocam</span></button>
                  <button onClick={() => alert("Info panel coming soon!")} className="hover:text-primary transition-colors"><span className="material-symbols-outlined text-[22px]">info</span></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-6 flex flex-col gap-4 sm:gap-6">
                <div className="text-center text-[12px] text-on-surface-variant/50 relative mb-4">
                  <span className="bg-[#0b0d10] px-3 relative z-10">Today</span>
                  <div className="absolute top-1/2 left-0 w-full h-[1px] bg-outline-variant/20"></div>
                </div>

                {messages.map((msg, idx) => {
                  const isMine = msg.sender_id === currentUser?.id;
                  const showAvatar = !isMine && (idx === 0 || messages[idx - 1].sender_id !== msg.sender_id);
                  const sender = getSenderInfo(msg.sender_id);

                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMine ? "justify-end" : "justify-start"}`}>
                      {!isMine && (
                        <div className="w-8 h-8 shrink-0 mt-auto">
                          {showAvatar && (
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-variant" title={sender.name}>
                              {sender.avatar_url ? (
                                <img src={sender.avatar_url} alt={sender.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                                  {sender.name?.substring(0, 2).toUpperCase() || "U"}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} max-w-[85%] sm:max-w-[70%] group`}>
                        {activeConversation?.is_group && !isMine && showAvatar && (
                          <div className="text-[12px] font-medium text-on-surface-variant mb-1 px-1">
                            {sender.name}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {isMine && (
                            <button
                              onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-on-surface transition-opacity"
                            >
                              <span className="material-symbols-outlined text-[16px]">add_reaction</span>
                            </button>
                          )}
                          <div
                            className={`px-4 py-2.5 rounded-2xl relative ${
                              isMine
                                ? "bg-[#71d4ff] text-[#003548] rounded-br-sm"
                                : "bg-[#1e2025] text-on-surface border border-outline-variant/20 rounded-bl-sm"
                            }`}
                          >
                            {msg.image_url && (
                              <img src={msg.image_url} alt="Attachment" className="max-w-full rounded-lg mb-2 max-h-64 object-cover" />
                            )}
                            {msg.content ? (
                              <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</div>
                            ) : !msg.image_url ? (
                              <div className="whitespace-pre-wrap text-[15px] leading-relaxed opacity-75 italic">[Sent message]</div>
                            ) : null}
                          </div>
                          {!isMine && (
                            <button
                              onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-on-surface transition-opacity"
                            >
                              <span className="material-symbols-outlined text-[16px]">add_reaction</span>
                            </button>
                          )}
                        </div>

                        {activeReactionMsgId === msg.id && (
                          <div className={`absolute z-20 ${isMine ? "right-12" : "left-12"} mt-1`}>
                            <EmojiPicker
                              onEmojiClick={(e) => toggleReaction(msg.id, e.emoji)}
                              theme={Theme.DARK}
                              lazyLoadEmojis={true}
                            />
                          </div>
                        )}

                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
                            {Array.from(new Set(msg.reactions.map((r) => r.emoji))).map((emoji) => {
                              const count = msg.reactions!.filter((r) => r.emoji === emoji).length;
                              const hasReacted = msg.reactions!.some((r) => r.emoji === emoji && r.user_id === currentUser?.id);
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(msg.id, emoji)}
                                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border ${hasReacted ? "bg-[#71d4ff]/20 border-[#71d4ff]/50" : "bg-[#1e2025] border-outline-variant/30 hover:bg-[#1e2025]/80"}`}
                                >
                                  <span>{emoji}</span>
                                  <span className={hasReacted ? "text-[#71d4ff]" : "text-on-surface-variant"}>{count}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="text-[11px] mt-1.5 text-on-surface-variant flex items-center gap-1">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {isMine && (
                            <span
                              className={`material-symbols-outlined text-[14px] ${
                                msg.is_read ? "text-[#71d4ff]" : "text-on-surface-variant/60"
                              }`}
                            >
                              done_all
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 bg-[#0b0d10] border-t border-outline-variant/20">
                {activeConversation?.is_blocked ? (
                  <div className="bg-[#1e2025]/90 border border-red-500/30 rounded-xl p-4 text-center text-red-400 flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[20px]">block</span>
                    <span className="text-sm font-medium">You can&apos;t message a blocked user</span>
                  </div>
                ) : (
                  <div className="bg-[#111318] border border-outline-variant/40 rounded-xl overflow-hidden focus-within:border-primary/50 transition-colors">
                    <div className="px-3 py-2 border-b border-outline-variant/20 flex gap-2 text-on-surface-variant relative">
                      <button onClick={() => insertTextAtCursor("**", "**")} className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors font-bold text-sm">B</button>
                      <button onClick={() => insertTextAtCursor("*", "*")} className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors font-bold text-sm italic">I</button>
                      <button onClick={() => insertTextAtCursor("`", "`")} className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors text-sm">&lt; &gt;</button>
                      <button onClick={() => insertTextAtCursor("[", "](url)")} className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors"><span className="material-symbols-outlined text-[16px]">link</span></button>
                      <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">sentiment_satisfied</span>
                      </button>

                      {showEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-2 z-30">
                          <EmojiPicker
                            onEmojiClick={(e) => setInputText((prev) => prev + e.emoji)}
                            theme={Theme.DARK}
                          />
                        </div>
                      )}
                    </div>

                    {attachedImage && (
                      <div className="px-4 py-2 bg-surface-variant/20 border-b border-outline-variant/20 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-primary truncate">
                          <span className="material-symbols-outlined text-[18px]">image</span>
                          {attachedImage.name}
                        </div>
                        <button onClick={() => setAttachedImage(null)} className="text-on-surface-variant hover:text-red-400">
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      </div>
                    )}

                    <div className="flex items-end p-2 gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setAttachedImage(e.target.files[0]);
                          }
                        }}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 rounded-lg transition-colors"
                      >
                        <span className="material-symbols-outlined">attach_file</span>
                      </button>
                      <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendChatMessage();
                          }
                        }}
                        placeholder="Write a message or paste code..."
                        className="flex-1 bg-transparent border-none resize-none max-h-32 min-h-[44px] py-3 focus:outline-none focus:ring-0 text-[15px]"
                        rows={1}
                      />
                      <button
                        onClick={sendChatMessage}
                        disabled={(!inputText.trim() && !attachedImage) || isUploading}
                        className="p-3 bg-[#71d4ff] text-[#003548] rounded-lg disabled:opacity-50 hover:brightness-110 transition-colors shrink-0 mb-1"
                      >
                        <span className="material-symbols-outlined text-[20px]">{isUploading ? "hourglass_empty" : "send"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant/50">
              <span className="material-symbols-outlined text-[80px] mb-6 opacity-30">forum</span>
              <p className="text-title-lg font-medium">Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>

      {showCreateGroupModal && (
        <CreateGroupModal
          onClose={() => setShowCreateGroupModal(false)}
          onCreated={(conversationId) => {
            setShowCreateGroupModal(false);
            setActiveConversationId(conversationId);
            refreshConversations();
          }}
        />
      )}
    </AppLayout>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-surface text-on-surface">Loading chat...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}