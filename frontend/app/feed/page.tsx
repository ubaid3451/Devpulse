"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getPosts, PostResponse, searchUsers, AuthorResponse } from "@/lib/api";
import PostCard from "@/components/PostCard";
import AppLayout from "@/components/AppLayout";
import Link from "next/link";

function UserSearchResults({
  results,
  isSearching,
  query,
  onSelect,
}: {
  results: AuthorResponse[];
  isSearching: boolean;
  query: string;
  onSelect: () => void;
}) {
  if (!query.trim()) return null;

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-low border border-outline-variant rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto">
      {isSearching ? (
        <div className="p-4 text-center text-on-surface-variant text-sm">Searching...</div>
      ) : results.length > 0 ? (
        results.map((user) => (
          <Link
            key={user.id}
            href={`/profile/${user.username}`}
            onClick={onSelect}
            className="flex items-center gap-3 p-3 hover:bg-surface-variant/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest shrink-0 border border-outline-variant/30">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                  {(user.full_name || user.username).substring(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{user.full_name || user.username}</div>
              <div className="text-[13px] text-primary">@{user.username}</div>
            </div>
          </Link>
        ))
      ) : (
        <div className="p-4 text-center text-on-surface-variant text-sm">No users found.</div>
      )}
    </div>
  );
}

export default function FeedPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AuthorResponse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const fetchPosts = async (showLoading = false) => {
    if (showLoading) setLoadingPosts(true);
    try {
      const data = await getPosts();
      // Filter out "ghost" reposts whose original post has been deleted
      const validPosts = (data || []).filter(post => !(post.repost_id && !post.original_post));
      setPosts(validPosts);
    } catch (e) {
      console.error(e);
    } finally {
      if (showLoading) setLoadingPosts(false);
    }
  };

  useEffect(() => {
    if (!isLoading && user) {
      fetchPosts(true);
    }
  }, [isLoading, user]);

  // Debounced user search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delay = setTimeout(() => {
      searchUsers(searchQuery)
        .then(setSearchResults)
        .catch((err) => console.error("Failed to search users", err))
        .finally(() => setIsSearching(false));
    }, 300);

    return () => clearTimeout(delay);
  }, [searchQuery]);

  // Close the results dropdown when clicking outside it
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const clearSearch = () => setSearchQuery("");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin-slow text-primary text-4xl">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <AppLayout activeNav="home">
      {/* Search Header (Desktop Only) */}
      <div className="hidden md:flex items-center h-16 px-lg sticky top-0 bg-surface/80 backdrop-blur-md z-40 border-b border-outline-variant shrink-0">
        <div ref={searchContainerRef} className="relative flex-1 max-w-2xl group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-full pl-10 pr-4 py-1.5 font-body-base text-body-base focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            placeholder="Search users..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <UserSearchResults
            results={searchResults}
            isSearching={isSearching}
            query={searchQuery}
            onSelect={clearSearch}
          />
        </div>
      </div>

      {/* Mobile Search Bar */}
      <div className="md:hidden p-md border-b border-outline-variant shrink-0">
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            search
          </span>
          <input
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-10 pr-4 py-2 font-body-base"
            placeholder="Search users..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <UserSearchResults
            results={searchResults}
            isSearching={isSearching}
            query={searchQuery}
            onSelect={clearSearch}
          />
        </div>
      </div>

      {/* Feed Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-md lg:p-lg space-y-3 sm:space-y-md">
        {loadingPosts ? (
          <div className="flex justify-center p-8">
            <span className="material-symbols-outlined animate-spin-slow text-primary text-4xl">progress_activity</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center p-8 text-on-surface-variant bg-surface-container-low rounded-xl border border-outline-variant">
            <div className="mb-4">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant opacity-50">post_add</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">No posts yet</h3>
            <p className="text-body-base">Be the first to post a bug or question!</p>
          </div>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onPostUpdate={(updated) =>
                setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
              }
            />
          ))
        )}
      </div>
    </AppLayout>
  );
}