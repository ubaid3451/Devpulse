"use client";

/**
 * Sidebar list of conversations ("Chats" panel).
 *
 * Delete behavior: deleting a chat here only hides it from the current
 * user's list (calls hideConversation). The other participant keeps the
 * conversation and its full history untouched. If new activity comes in
 * on a hidden conversation, the backend is expected to un-hide it so it
 * reappears here.
 */

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Search, Trash2, UserPlus } from "lucide-react";
import {
  ApiError,
  getConversations,
  hideConversation,
  type ConversationResponse,
} from "../lib/api";

interface ChatListProps {
  activeConversationId?: string;
  onSelectConversation: (conversationId: string) => void;
  onStartNewChat?: () => void;
}

function displayName(conversation: ConversationResponse): string {
  if (conversation.is_group) return conversation.name ?? "Group chat";
  const other = conversation.participants[0];
  return other?.full_name || other?.username || "Unknown";
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function previewText(conversation: ConversationResponse): string {
  if (!conversation.last_message) return "No messages yet";
  if (conversation.last_message_encrypted) return "🔒 Encrypted message";
  return conversation.last_message;
}

export function ChatList({
  activeConversationId,
  onSelectConversation,
  onStartNewChat,
}: ChatListProps) {
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getConversations();
        if (!cancelled) setConversations(data);
      } catch {
        if (!cancelled) setError("Couldn't load chats.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function confirmDelete(conversationId: string) {
    setDeletingId(conversationId);
    setError(null);
    try {
      await hideConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.conversation_id !== conversationId));
      if (activeConversationId === conversationId) {
        onSelectConversation("");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't delete chat. Try again.");
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }

  const filtered = conversations.filter((c) =>
    displayName(c).toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="flex h-full w-[310px] flex-col border-r border-white/10 bg-[#0a0a0c]">
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <h2 className="text-lg font-semibold text-white">Chats</h2>
        <button
          type="button"
          onClick={onStartNewChat}
          aria-label="Start new chat"
          className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <UserPlus size={18} />
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <Search size={16} className="text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search developers..."
            className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <p className="px-4 pb-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-white/40">Loading chats…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-white/40">
            {search ? "No chats match your search." : "No conversations yet."}
          </p>
        ) : (
          filtered.map((conversation) => {
            const name = displayName(conversation);
            const isActive = conversation.conversation_id === activeConversationId;
            const isMenuOpen = openMenuId === conversation.conversation_id;
            const isPendingDelete = pendingDeleteId === conversation.conversation_id;
            const isDeleting = deletingId === conversation.conversation_id;

            return (
              <div
                key={conversation.conversation_id}
                className={`group relative flex items-center gap-3 px-4 py-3 transition-colors ${
                  isActive ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectConversation(conversation.conversation_id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="relative shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                      {initials(name)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{name}</p>
                    <p className="truncate text-xs text-white/50">{previewText(conversation)}</p>
                  </div>
                </button>

                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-label={`More options for ${name}`}
                    onClick={() =>
                      setOpenMenuId(isMenuOpen ? null : conversation.conversation_id)
                    }
                    className={`rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white ${
                      isMenuOpen ? "bg-white/10 text-white" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <MoreVertical size={16} />
                  </button>

                  {isMenuOpen && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 top-9 z-10 w-40 overflow-hidden rounded-lg border border-white/10 bg-[#151518] shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          setPendingDeleteId(conversation.conversation_id);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                        Delete chat
                      </button>
                    </div>
                  )}
                </div>

                {isPendingDelete && (
                  <div
                    className="absolute inset-0 z-20 flex items-center justify-between gap-2 bg-[#151518] px-4"
                    role="dialog"
                    aria-label={`Confirm delete chat with ${name}`}
                  >
                    <span className="text-sm text-white/80">Delete this chat?</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="rounded-md px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => confirmDelete(conversation.conversation_id)}
                        className="rounded-md bg-red-500/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        {isDeleting ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}