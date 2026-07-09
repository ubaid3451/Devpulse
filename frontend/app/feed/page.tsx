"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getPosts, PostResponse } from "@/lib/api";
import PostCard from "@/components/PostCard";
import CreatePostModal from "@/components/CreatePostModal";
import Link from "next/link";

export default function FeedPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

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
    <div className="bg-surface text-on-surface min-h-screen select-none">
      {/* Mobile Top Bar */}
      <header className="flex justify-between items-center w-full px-md h-16 sticky top-0 z-50 md:hidden bg-surface border-b border-outline-variant">
        <div className="font-headline-md text-headline-md font-bold text-on-surface">
          DevPulse
        </div>
        <div className="flex gap-4">
          <span className="material-symbols-outlined text-primary">terminal</span>
          <span className="material-symbols-outlined text-primary">bug_report</span>
          <Link href={`/profile/${user?.username}`} className="w-8 h-8 rounded-full overflow-hidden bg-primary-container text-on-primary-container flex items-center justify-center font-bold border border-outline-variant uppercase hover:brightness-110 transition-all">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              user?.username?.[0] || "U"
            )}
          </Link>
        </div>
      </header>

      <div className="flex max-w-[1440px] mx-auto min-h-screen">
        {/* Sidebar Navigation (Desktop) */}
        <aside className="hidden md:flex flex-col h-full sticky top-0 w-64 bg-surface border-r border-outline-variant">
          <div className="p-lg">
            <div className="font-headline-md text-headline-md font-bold text-on-surface mb-xs">
              DevPulse
            </div>
            <div className="font-body-sm text-body-sm text-on-surface-variant opacity-70">
              Developer Network
            </div>
            <div className="mt-4 pt-4 border-t border-outline-variant/50">
              <span className="text-body-sm text-on-surface">Welcome, </span>
              <span className="text-body-sm text-primary font-bold">
                {user?.full_name || user?.username || "Dev"}
              </span>
            </div>
          </div>
          <nav className="flex-1 px-sm">
            {/* Active Item */}
            <a
              className="flex items-center gap-md px-md py-sm mb-xs text-primary font-bold border-r-2 border-primary bg-surface-variant transition-colors rounded-r-sm"
              href="#"
            >
              <span className="material-symbols-outlined">home</span>
              <span className="font-body-base text-body-base">Home</span>
            </a>
            <a
              className="flex items-center gap-md px-md py-sm mb-xs text-on-surface-variant hover:bg-surface-variant transition-colors rounded-sm"
              href="#"
            >
              <span className="material-symbols-outlined">explore</span>
              <span className="font-body-base text-body-base">Explore</span>
            </a>
            <a
              className="flex items-center gap-md px-md py-sm mb-xs text-on-surface-variant hover:bg-surface-variant transition-colors rounded-sm"
              href="#"
            >
              <span className="material-symbols-outlined">notifications</span>
              <span className="font-body-base text-body-base">Notifications</span>
            </a>
          </nav>
          <div className="p-md">
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full py-sm bg-primary-container text-on-primary-container font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all"
            >
              Post a Bug
            </button>
          </div>
          <div className="px-sm mb-md">
            <a
              className="flex items-center gap-md px-md py-sm text-on-surface-variant hover:bg-surface-variant transition-colors rounded-sm"
              href="#"
            >
              <span className="material-symbols-outlined">settings</span>
              <span className="font-body-base text-body-base">Settings</span>
            </a>
            <a
              className="flex items-center gap-md px-md py-sm text-on-surface-variant hover:bg-surface-variant transition-colors rounded-sm"
              href="#"
            >
              <span className="material-symbols-outlined">menu_book</span>
              <span className="font-body-base text-body-base">Documentation</span>
            </a>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-md px-md py-sm text-error hover:bg-error-container/20 transition-colors rounded-sm"
            >
              <span className="material-symbols-outlined">logout</span>
              <span className="font-body-base text-body-base text-left flex-1">Sign Out</span>
            </button>
          </div>
          <footer className="mt-auto p-md border-t border-outline-variant/30 hidden md:block">
            <div className="flex flex-wrap gap-sm text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">
              <a className="hover:text-primary" href="#">Status</a>
              <a className="hover:text-primary" href="#">Terms</a>
              <a className="hover:text-primary" href="#">API</a>
              <a className="hover:text-primary" href="#">Careers</a>
            </div>
            <p className="text-[10px] text-on-surface-variant/50 mt-xs">
              © 2024 DevPulse System
            </p>
          </footer>
        </aside>

        {/* Main Content Feed */}
        <main className="flex-1 border-r border-outline-variant bg-surface min-w-0">
          {/* Search Header (Desktop Only) */}
          <div className="hidden md:flex items-center h-16 px-lg sticky top-0 bg-surface/80 backdrop-blur-md z-40 border-b border-outline-variant">
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
              <Link href={`/profile/${user?.username}`} className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-surface-variant transition-colors border border-outline-variant bg-surface-container-low ml-2 group">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm border border-outline-variant">
                  {user?.avatar_url ? (
                     <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                     user?.username?.[0]?.toUpperCase() || "U"
                  )}
                </div>
                <span className="font-bold text-body-sm text-on-surface group-hover:text-primary transition-colors">Profile</span>
              </Link>
            </div>
          </div>
          {/* Mobile Search Bar */}
          <div className="md:hidden p-md border-b border-outline-variant">
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
          <div className="p-md lg:p-lg space-y-md">
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
        </main>


      </div>

      {/* Bottom Nav Bar (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 md:hidden bg-surface-container border-t border-outline-variant pb-safe">
        <a
          className="flex flex-col items-center gap-1 text-primary scale-95 transition-transform"
          href="#"
        >
          <span className="material-symbols-outlined">home</span>
          <span className="font-label-caps text-label-caps">Home</span>
        </a>
        <a
          className="flex flex-col items-center gap-1 text-on-surface-variant active:bg-surface-variant"
          href="#"
        >
          <span className="material-symbols-outlined">search</span>
          <span className="font-label-caps text-label-caps">Explore</span>
        </a>
        <a
          className="flex flex-col items-center gap-1 text-on-surface-variant active:bg-surface-variant"
          href="#"
        >
          <span className="material-symbols-outlined">notifications</span>
          <span className="font-label-caps text-label-caps">Alerts</span>
        </a>
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-1 text-on-surface-variant active:bg-surface-variant"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="font-label-caps text-label-caps">Logout</span>
        </button>
      </nav>

      {/* FAB (Mobile only) */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="md:hidden fixed bottom-20 right-6 w-14 h-14 bg-primary-container text-on-primary-container rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-50"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

      {isModalOpen && (
        <CreatePostModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={fetchPosts}
        />
      )}
    </div>
  );
}
