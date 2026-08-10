"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getExploreUsers, toggleFollow, ExploreUser, ToggleFollowStatusType } from "@/lib/api";
import AppLayout from "@/components/AppLayout";

const PAGE_SIZE = 20;

export default function ExplorePage() {
  const [users, setUsers] = useState<ExploreUser[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [processingUsername, setProcessingUsername] = useState<string | null>(null);

  const observerTarget = useRef<HTMLDivElement>(null);

  // `skip` and a synchronous loading lock both live in refs, not state.
  // Why: the IntersectionObserver can fire again before a state update from
  // the previous loadMore() call has actually committed (React state updates
  // aren't synchronous), so two overlapping calls could both read
  // isLoading === false and skip === 0, fetch the same page twice, and
  // duplicate every user in the list. Refs are read/written synchronously,
  // so the lock actually prevents the second call from proceeding.
  const skipRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMoreRef.current) return;

    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const res = await getExploreUsers(skipRef.current, PAGE_SIZE);

      setUsers((prev) => {
        // Extra safety net: de-duplicate by id in case of any remaining
        // overlap (e.g. a user's own data changing between pages).
        const existingIds = new Set(prev.map((u) => u.id));
        const newOnes = res.users.filter((u) => !existingIds.has(u.id));
        return [...prev, ...newOnes];
      });

      skipRef.current += res.users.length;
      hasMoreRef.current = res.has_more;
      setHasMore(res.has_more);
    } catch (err) {
      console.error("Failed to load explore users", err);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
      setInitialLoad(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadMore();
  }, [loadMore]);

  // Infinite scroll — observe a sentinel div near the bottom of the list
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleFollowClick = async (user: ExploreUser) => {
    setProcessingUsername(user.username);
    try {
      const res = await toggleFollow(user.username);
      const status = res.status;

      setUsers((prev) =>
        prev.map((u) => {
          if (u.username !== user.username) return u;
          if (status === "followed") return { ...u, is_following: true, has_pending_request: false };
          if (status === "unfollowed") return { ...u, is_following: false, has_pending_request: false };
          if (status === "requested") return { ...u, is_following: false, has_pending_request: true };
          if (status === "request_cancelled") return { ...u, is_following: false, has_pending_request: false };
          return u;
        })
      );
    } catch (err) {
      console.error("Failed to toggle follow", err);
    } finally {
      setProcessingUsername(null);
    }
  };

  const buttonLabel = (user: ExploreUser) => {
    if (user.is_following) return "Following";
    if (user.has_pending_request) return "Requested";
    if (user.is_private) return "Request to Follow";
    return "Follow";
  };

  return (
    <AppLayout activeNav="explore">
      <div className="bg-surface text-on-surface min-h-screen">
        <header className="flex items-center w-full px-md h-16 sticky top-0 z-50 bg-surface border-b border-outline-variant">
          <div className="font-headline-sm text-headline-sm font-bold text-on-surface">
            Explore
          </div>
        </header>

        <main className="max-w-2xl mx-auto p-3 sm:p-md lg:p-lg pb-16">
          {initialLoad ? (
            <div className="flex items-center justify-center py-16">
              <span className="material-symbols-outlined animate-spin-slow text-primary text-4xl">progress_activity</span>
            </div>
          ) : users.length === 0 ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">group</span>
              <h3 className="text-title-md font-bold text-on-surface mb-1">No users found</h3>
              <p className="text-body-md text-on-surface-variant">Check back later.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="bg-surface-container-low border border-outline-variant rounded-xl p-md flex items-center justify-between gap-4"
                >
                  <Link href={`/profile/${user.username}`} className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-container-highest shrink-0 border border-outline-variant/30">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold">
                          {(user.full_name || user.username).substring(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm truncate">{user.full_name || user.username}</span>
                        {user.is_private && (
                          <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">lock</span>
                        )}
                      </div>
                      <div className="text-[13px] text-primary">@{user.username}</div>
                      {user.bio && (
                        <div className="text-[13px] text-on-surface-variant truncate mt-0.5">{user.bio}</div>
                      )}
                    </div>
                  </Link>

                  <button
                    onClick={() => handleFollowClick(user)}
                    disabled={processingUsername === user.username}
                    className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors shrink-0 disabled:opacity-50 ${
                      user.is_following || user.has_pending_request
                        ? "bg-surface-variant text-on-surface hover:bg-surface-container-high"
                        : "bg-primary text-on-primary hover:brightness-110"
                    }`}
                  >
                    {buttonLabel(user)}
                  </button>
                </div>
              ))}

              {/* Infinite scroll sentinel */}
              <div ref={observerTarget} className="h-4" />

              {isLoading && (
                <div className="flex items-center justify-center py-6">
                  <span className="material-symbols-outlined animate-spin-slow text-primary text-2xl">progress_activity</span>
                </div>
              )}

              {!hasMore && users.length > 0 && (
                <div className="text-center py-6 text-on-surface-variant text-sm">
                  You've reached the end.
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}