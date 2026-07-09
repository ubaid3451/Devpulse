"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getPosts, PostResponse } from "@/lib/api";
import PostCard from "@/components/PostCard";
import AppLayout from "@/components/AppLayout";
import Link from "next/link";

export default function FeedPage() {
  const { user, isLoading } = useAuth();
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const fetchPosts = async () => {
    setLoadingPosts(true);
    try {
      const data = await getPosts();
      // Filter out "ghost" reposts whose original post has been deleted
      const validPosts = (data || []).filter(post => !(post.repost_id && !post.original_post));
      setPosts(validPosts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    if (!isLoading && user) {
      fetchPosts();
    }
  }, [isLoading, user]);

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
        <div className="relative flex-1 max-w-2xl group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-full pl-10 pr-4 py-1.5 font-body-base text-body-base focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            placeholder="Search errors, tags, or users"
            type="text"
          />
        </div>
        <div className="flex items-center gap-md ml-auto">
          <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined">terminal</span>
          </button>
          <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined">bug_report</span>
          </button>
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
            placeholder="Search errors..."
            type="text"
          />
        </div>
      </div>

      {/* Feed Content */}
      <div className="flex-1 overflow-y-auto p-md lg:p-lg space-y-md">
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
            <PostCard key={post.id} post={post} onLikeToggle={fetchPosts} />
          ))
        )}
      </div>
    </AppLayout>
  );
}
