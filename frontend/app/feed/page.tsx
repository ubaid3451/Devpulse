"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function FeedPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();

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
          <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold border border-outline-variant uppercase">
            {user?.username?.[0] || "U"}
          </div>
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
            <a
              className="flex items-center gap-md px-md py-sm mb-xs text-on-surface-variant hover:bg-surface-variant transition-colors rounded-sm"
              href="#"
            >
              <span className="material-symbols-outlined">person</span>
              <span className="font-body-base text-body-base">Profile</span>
            </a>
          </nav>
          <div className="p-md">
            <button className="w-full py-sm bg-primary-container text-on-primary-container font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all">
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
            {/* Bug Card 1 */}
            <article className="bg-surface-container-low border border-outline-variant rounded-xl p-md lg:p-lg hover:border-outline transition-all group">
              <div className="flex justify-between items-start mb-md">
                <div className="flex items-center gap-sm">
                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant bg-surface-container-highest flex items-center justify-center">
                    <span className="text-on-surface font-bold">DV</span>
                  </div>
                  <div>
                    <h3 className="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors">
                      React hydration error in Next.js 14
                    </h3>
                    <div className="flex gap-2 items-center mt-0.5">
                      <span className="text-body-sm text-on-surface-variant">
                        @dan_vortex • 14m ago
                      </span>
                      <span className="px-2 py-0.5 bg-error-container/20 text-error text-[10px] font-bold rounded uppercase tracking-wider border border-error-container/30">
                        Urgent
                      </span>
                    </div>
                  </div>
                </div>
                <button className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">more_horiz</span>
                </button>
              </div>
              <div className="bg-surface-container-highest rounded-lg p-md mb-md border border-outline-variant overflow-x-auto cursor-pointer" title="Click to copy code snippet">
                <pre className="font-code-block text-code-block">
                  <code className="text-on-surface-variant">
                    <span className="text-[#ff7b72]">export default function</span>{" "}
                    <span className="text-[#d2a8ff]">Page</span>() {"{\n"}
                    {"  "}
                    <span className="text-[#ff7b72]">const</span> [data, setData] ={" "}
                    <span className="text-[#d2a8ff]">useState</span>(
                    <span className="text-[#ff7b72]">null</span>);{"\n"}
                    {"  "}
                    <span className="text-[#8b949e]">
                      {"// hydration mismatch triggered here"}
                    </span>
                    {"\n"}
                    {"  "}
                    <span className="text-[#ff7b72]">return</span> &lt;
                    <span className="text-[#d2a8ff]">div</span>&gt;
                    {"{typeof window !== "}
                    <span className="text-[#a5d6ff]">&apos;undefined&apos;</span>
                    {" ? "}
                    <span className="text-[#a5d6ff]">&apos;Client&apos;</span>
                    {" : "}
                    <span className="text-[#a5d6ff]">&apos;Server&apos;</span>
                    {"}"}
                    &lt;/<span className="text-[#d2a8ff]">div</span>&gt;;{"\n"}
                    {"}"}
                  </code>
                </pre>
              </div>
              <div className="flex flex-wrap gap-sm mb-lg">
                <span className="px-2 py-1 bg-surface-container-high border border-outline-variant rounded font-code-block text-body-sm text-primary-fixed-dim">
                  #typescript
                </span>
                <span className="px-2 py-1 bg-surface-container-high border border-outline-variant rounded font-code-block text-body-sm text-primary-fixed-dim">
                  #nextjs
                </span>
                <span className="px-2 py-1 bg-surface-container-high border border-outline-variant rounded font-code-block text-body-sm text-primary-fixed-dim">
                  #react
                </span>
              </div>
              <div className="flex items-center justify-between pt-md border-t border-outline-variant/30">
                <div className="flex gap-lg">
                  <button className="flex items-center gap-xs text-on-surface-variant hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">forum</span>
                    <span className="font-label-caps text-label-caps">24 Solutions</span>
                  </button>
                  <button className="flex items-center gap-xs text-on-surface-variant hover:text-tertiary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">bolt</span>
                    <span className="font-label-caps text-label-caps">1.2k Rep</span>
                  </button>
                </div>
                <button className="px-md py-1.5 bg-secondary-container text-on-secondary-container text-body-sm font-semibold rounded-lg hover:bg-outline-variant transition-colors">
                  View Solutions
                </button>
              </div>
            </article>

            {/* Bug Card 2 */}
            <article className="bg-surface-container-low border border-outline-variant rounded-xl p-md lg:p-lg hover:border-outline transition-all group">
              <div className="flex justify-between items-start mb-md">
                <div className="flex items-center gap-sm">
                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant bg-surface-container-highest flex items-center justify-center">
                    <span className="text-on-surface font-bold">NW</span>
                  </div>
                  <div>
                    <h3 className="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors">
                      Memory leak in WebWorker cluster
                    </h3>
                    <div className="flex gap-2 items-center mt-0.5">
                      <span className="text-body-sm text-on-surface-variant">
                        @node_wizard • 2h ago
                      </span>
                      <span className="px-2 py-0.5 bg-tertiary-container/20 text-tertiary text-[10px] font-bold rounded uppercase tracking-wider border border-tertiary-container/30">
                        High Priority
                      </span>
                    </div>
                  </div>
                </div>
                <button className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">more_horiz</span>
                </button>
              </div>
              <div className="bg-surface-container-highest rounded-lg p-md mb-md border border-outline-variant overflow-x-auto cursor-pointer" title="Click to copy code snippet">
                <pre className="font-code-block text-code-block">
                  <code className="text-on-surface-variant">
                    <span className="text-[#ff7b72]">while</span> (tasks.
                    <span className="text-[#d2a8ff]">length</span>) {"{\n"}
                    {"  "}
                    <span className="text-[#ff7b72]">const</span> worker ={" "}
                    <span className="text-[#ff7b72]">new</span>{" "}
                    <span className="text-[#d2a8ff]">Worker</span>(
                    <span className="text-[#a5d6ff]">&apos;./heavy.js&apos;</span>);{"\n"}
                    {"  worker."}
                    <span className="text-[#d2a8ff]">postMessage</span>
                    {"(tasks."}
                    <span className="text-[#d2a8ff]">shift</span>());{"\n"}
                    {"  "}
                    <span className="text-[#8b949e]">
                      {"// worker is never terminated?"}
                    </span>
                    {"\n}"}
                  </code>
                </pre>
              </div>
              <div className="flex flex-wrap gap-sm mb-lg">
                <span className="px-2 py-1 bg-surface-container-high border border-outline-variant rounded font-code-block text-body-sm text-primary-fixed-dim">
                  #nodejs
                </span>
                <span className="px-2 py-1 bg-surface-container-high border border-outline-variant rounded font-code-block text-body-sm text-primary-fixed-dim">
                  #webworkers
                </span>
              </div>
              <div className="flex items-center justify-between pt-md border-t border-outline-variant/30">
                <div className="flex gap-lg">
                  <button className="flex items-center gap-xs text-on-surface-variant hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">forum</span>
                    <span className="font-label-caps text-label-caps">8 Solutions</span>
                  </button>
                  <button className="flex items-center gap-xs text-on-surface-variant hover:text-tertiary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">bolt</span>
                    <span className="font-label-caps text-label-caps">450 Rep</span>
                  </button>
                </div>
                <button className="px-md py-1.5 bg-secondary-container text-on-secondary-container text-body-sm font-semibold rounded-lg hover:bg-outline-variant transition-colors">
                  View Solutions
                </button>
              </div>
            </article>
          </div>
        </main>

        {/* Right Sidebar (Desktop) */}
        <aside className="hidden lg:flex flex-col w-80 sticky top-0 h-screen p-lg bg-surface">
          {/* Trending Tags */}
          <section className="mb-xl">
            <div className="flex items-center justify-between mb-md">
              <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
                Trending Tags
              </h4>
              <span className="material-symbols-outlined text-primary text-[18px]">
                trending_up
              </span>
            </div>
            <div className="space-y-sm">
              <a className="flex items-center justify-between group" href="#">
                <span className="text-body-base font-medium text-on-surface group-hover:text-primary transition-colors">
                  #rust-lang
                </span>
                <span className="text-body-sm text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded border border-outline-variant">
                  2.4k
                </span>
              </a>
              <a className="flex items-center justify-between group" href="#">
                <span className="text-body-base font-medium text-on-surface group-hover:text-primary transition-colors">
                  #typescript
                </span>
                <span className="text-body-sm text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded border border-outline-variant">
                  1.8k
                </span>
              </a>
              <a className="flex items-center justify-between group" href="#">
                <span className="text-body-base font-medium text-on-surface group-hover:text-primary transition-colors">
                  #docker
                </span>
                <span className="text-body-sm text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded border border-outline-variant">
                  942
                </span>
              </a>
              <a className="flex items-center justify-between group" href="#">
                <span className="text-body-base font-medium text-on-surface group-hover:text-primary transition-colors">
                  #postgresql
                </span>
                <span className="text-body-sm text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded border border-outline-variant">
                  612
                </span>
              </a>
            </div>
          </section>

          {/* Active Solvers */}
          <section>
            <div className="flex items-center justify-between mb-md">
              <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
                Active Solvers
              </h4>
              <span className="material-symbols-outlined text-tertiary text-[18px]">
                workspace_premium
              </span>
            </div>
            <div className="space-y-md">
              <div className="flex items-center gap-md">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
                  <span className="material-symbols-outlined text-[20px]">person</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body-base font-bold text-on-surface truncate">
                    Sarah Codes
                  </p>
                  <p className="text-body-sm text-on-surface-variant">24 solves today</p>
                </div>
                <div className="text-primary font-code-block text-[12px]">+140</div>
              </div>
              <div className="flex items-center gap-md">
                <div className="w-8 h-8 rounded-full bg-tertiary/20 flex items-center justify-center text-tertiary border border-tertiary/30">
                  <span className="material-symbols-outlined text-[20px]">person</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body-base font-bold text-on-surface truncate">
                    Dev_Shadow
                  </p>
                  <p className="text-body-sm text-on-surface-variant">18 solves today</p>
                </div>
                <div className="text-primary font-code-block text-[12px]">+95</div>
              </div>
            </div>
          </section>

          <footer className="mt-auto pt-lg border-t border-outline-variant/30">
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
      <button className="md:hidden fixed bottom-20 right-6 w-14 h-14 bg-primary-container text-on-primary-container rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-50">
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>
    </div>
  );
}
