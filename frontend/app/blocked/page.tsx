"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getBlockedUsers, toggleBlock, BlockedUser } from "@/lib/api";

export default function BlockedUsersPage() {
  const router = useRouter();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingUsername, setProcessingUsername] = useState<string | null>(null);

  const fetchBlockedUsers = () => {
    getBlockedUsers()
      .then(setBlockedUsers)
      .catch((err) => console.error("Failed to load blocked users", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBlockedUsers();
  }, []);

  const handleUnblock = async (username: string) => {
    setProcessingUsername(username);
    try {
      await toggleBlock(username); // toggling a blocked user unblocks them
      setBlockedUsers((prev) => prev.filter((u) => u.username !== username));
    } catch (err) {
      console.error("Failed to unblock user", err);
    } finally {
      setProcessingUsername(null);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <header className="flex items-center w-full px-md h-16 sticky top-0 z-50 bg-surface border-b border-outline-variant">
        <button
          onClick={() => router.push("/profile")}
          className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-full transition-colors mr-4"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Blocked Users
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-md lg:p-lg">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-symbols-outlined animate-spin-slow text-primary text-3xl">progress_activity</span>
          </div>
        ) : blockedUsers.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">block</span>
            <h3 className="text-title-md font-bold text-on-surface mb-1">No blocked users</h3>
            <p className="text-body-md text-on-surface-variant">
              Users you block will show up here, and you can unblock them anytime.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map((user) => (
              <div
                key={user.id}
                className="bg-surface-container-low border border-outline-variant rounded-xl p-md flex items-center justify-between gap-4"
              >
                <Link href={`/profile/${user.username}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-surface-container-highest shrink-0 border border-outline-variant/30">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold">
                        {(user.full_name || user.username).substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{user.full_name || user.username}</div>
                    <div className="text-[13px] text-on-surface-variant">@{user.username}</div>
                  </div>
                </Link>

                <button
                  onClick={() => handleUnblock(user.username)}
                  disabled={processingUsername === user.username}
                  className="px-4 py-1.5 bg-surface-variant text-on-surface text-sm font-bold rounded-lg hover:bg-surface-container-high disabled:opacity-50 transition-colors shrink-0"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}