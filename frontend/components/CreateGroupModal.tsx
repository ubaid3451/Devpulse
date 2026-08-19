"use client";

import React, { useEffect, useState } from "react";
import { searchUsers, createGroupConversation, AuthorResponse } from "@/lib/api";

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export default function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AuthorResponse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<AuthorResponse[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const delay = setTimeout(() => {
      searchUsers(searchQuery)
        .then((results) =>
          setSearchResults(results.filter((u) => !selectedUsers.some((s) => s.id === u.id)))
        )
        .catch((err) => console.error("Failed to search users", err))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedUsers]);

  const addUser = (user: AuthorResponse) => {
    setSelectedUsers((prev) => [...prev, user]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleCreate = async () => {
    setError(null);

    if (!groupName.trim()) {
      setError("Please give your group a name.");
      return;
    }
    if (selectedUsers.length < 2) {
      setError("Add at least 2 other members to start a group.");
      return;
    }

    setIsCreating(true);
    try {
      const res = await createGroupConversation(
        groupName.trim(),
        selectedUsers.map((u) => u.username)
      );
      onCreated(res.conversation_id);
    } catch (err: any) {
      setError(err?.detail || "Failed to create group. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[440px] max-w-[90vw] bg-surface-container border border-outline-variant/40 rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <h2 className="font-bold text-lg">New Group</h2>
          <button
            onClick={onClose}
            className="p-1 text-on-surface-variant hover:text-on-surface rounded-full hover:bg-surface-variant/30 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Group name */}
          <div>
            <label className="text-[13px] text-on-surface-variant mb-1.5 block">Group name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Backend Team"
              className="w-full bg-surface-variant border border-outline-variant/50 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Selected members chips */}
          {selectedUsers.length > 0 && (
            <div>
              <label className="text-[13px] text-on-surface-variant mb-1.5 block">
                Members ({selectedUsers.length})
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-1.5 bg-surface-variant border border-outline-variant/40 rounded-full pl-1 pr-2 py-1"
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden bg-surface-variant shrink-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] font-bold">
                          {u.full_name?.substring(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="text-[12px]">{u.full_name || u.username}</span>
                    <button
                      onClick={() => removeUser(u.id)}
                      className="text-on-surface-variant hover:text-red-400 ml-0.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search / add members */}
          <div>
            <label className="text-[13px] text-on-surface-variant mb-1.5 block">Add members</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search developers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-variant border border-outline-variant/50 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {searchQuery.trim() && (
              <div className="mt-2 border border-outline-variant/30 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {isSearching ? (
                  <div className="p-3 text-center text-on-surface-variant text-sm">Searching...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => addUser(user)}
                      className="p-2.5 cursor-pointer transition-colors flex items-center gap-3 hover:bg-surface-variant"
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-variant shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                            {user.full_name?.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{user.full_name}</div>
                        <div className="text-[12px] text-primary">@{user.username}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-on-surface-variant text-sm">No users found.</div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="text-[13px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-outline-variant/30 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-on-surface-variant hover:bg-surface-variant/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-on-primary font-medium disabled:opacity-50 hover:brightness-110 transition-colors"
          >
            {isCreating ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}