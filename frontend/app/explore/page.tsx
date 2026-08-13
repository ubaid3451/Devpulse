"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getExploreUsers, toggleFollow, ExploreUser } from "@/lib/api";
import AppLayout from "@/components/AppLayout";

const PAGE_SIZE = 20;

export default function ExplorePage() {
  const [users, setUsers] = useState<ExploreUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [processingUsername, setProcessingUsername] = useState<string | null>(null);

  const observerTarget = useRef<HTMLDivElement>(null);

  // Synchronous loading locks and cursor tracking in refs
  const skipRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const searchQueryRef = useRef("");

  const loadMore = useCallback(async (reset = false) => {
    if (isLoadingRef.current) return;
    if (!reset && !hasMoreRef.current) return;

    if (reset) {
      skipRef.current = 0;
      hasMoreRef.current = true;
      setHasMore(true);
    }

    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const currentQuery = searchQueryRef.current;
      const res = await getExploreUsers(skipRef.current, PAGE_SIZE, currentQuery);

      setUsers((prev) => {
        if (reset) return res.users;
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

  // Search input change handler with debounce
  useEffect(() => {
    searchQueryRef.current = searchQuery;
    const timer = setTimeout(() => {
      setInitialLoad(true);
      loadMore(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadMore]);

  // Infinite scroll — IntersectionObserver on sentinel
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
          loadMore(false);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  // Infinite scroll — Window scroll listener fallback
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 400 &&
        hasMoreRef.current &&
        !isLoadingRef.current
      ) {
        loadMore(false);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
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
        <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-outline-variant px-md py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search developers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-full pl-10 pr-4 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
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
              <h3 className="text-title-md font-bold text-on-surface mb-1">No developers found</h3>
              <p className="text-body-md text-on-surface-variant">Try searching for another username or keyword.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="bg-surface-container-low border border-outline-variant rounded-xl p-md flex items-center justify-between gap-4 hover:border-outline transition-colors"
                >
                  <Link href={`/profile/${user.username}`} className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-container-highest shrink-0 border border-outline-variant/30">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-on-surface">
                          {(user.full_name || user.username).substring(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-on-surface truncate">{user.full_name || user.username}</span>
                        {user.is_private && (
                          <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0" title="Private account">lock</span>
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
            </div>
          )}

          {/* Infinite Scroll Sentinel — always rendered at bottom */}
          <div ref={observerTarget} className="h-10 my-4" />

          {isLoading && !initialLoad && (
            <div className="flex items-center justify-center py-6">
              <span className="material-symbols-outlined animate-spin-slow text-primary text-2xl">progress_activity</span>
            </div>
          )}

          {!hasMore && users.length > 0 && (
            <div className="text-center py-6 text-on-surface-variant text-sm font-medium">
              You've reached the end.
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}