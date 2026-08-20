"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import CreatePostModal from "@/components/CreatePostModal";
import { getUnreadNotificationCount } from "@/lib/api";

interface AppLayoutProps {
  children: React.ReactNode;
  activeNav?: "home" | "explore" | "messages" | "notifications" | "admin";
}

export default function AppLayout({ children, activeNav = "home" }: AppLayoutProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getUnreadNotificationCount()
      .then((res) => setUnreadNotifCount(res.unread_count))
      .catch(() => {});

    const interval = setInterval(() => {
      getUnreadNotificationCount()
        .then((res) => setUnreadNotifCount(res.unread_count))
        .catch(() => {});
    }, 15000);

    return () => clearInterval(interval);
  }, [user]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const navItems = [
    { id: "home", label: "Home", icon: "home", href: "/feed" },
    { id: "explore", label: "Explore", icon: "explore", href: "/explore" },
    { id: "messages", label: "Messages", icon: "mail", href: "/chat" },
    { id: "notifications", label: "Notifications", icon: "notifications", href: "/notifications", badge: unreadNotifCount },
    // Admin link only shows up for admin-role users. Added conditionally here
    // (rather than always rendered + hidden with CSS) so it never appears in
    // the DOM at all for regular users.
    ...(user?.role === "admin" || user?.role === "superadmin"
      ? [{ id: "admin", label: "Admin", icon: "shield_person", href: "/admin", badge: 0 }]
      : []),
  ];

  return (
    <div className="bg-surface text-on-surface min-h-screen select-none flex flex-col md:flex-row">
      {/* Mobile Top Bar */}
      <header className="flex justify-between items-center w-full px-4 h-16 sticky top-0 z-50 md:hidden bg-surface border-b border-outline-variant">
        <div className="font-headline-md text-headline-md font-bold text-on-surface truncate">
          DevPulse
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link href={`/profile/${user?.username}`} title="Profile" className="w-8 h-8 rounded-full overflow-hidden bg-primary-container text-on-primary-container flex items-center justify-center font-bold border border-outline-variant uppercase hover:brightness-110 transition-all shrink-0">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              user?.username?.[0] || "U"
            )}
          </Link>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 text-error hover:bg-error-container/20 rounded-lg transition-colors flex items-center justify-center shrink-0"
          >
            <span className="material-symbols-outlined text-[22px]">logout</span>
          </button>
        </div>
      </header>

      <div className="flex w-full min-h-screen">
        {/* Sidebar Navigation (Desktop) */}
        <aside className="hidden md:flex flex-col h-screen sticky top-0 w-64 bg-surface border-r border-outline-variant shrink-0">
          <div className="p-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]">terminal</span>
            <div>
              <div className="font-headline-md text-headline-md font-bold text-on-surface leading-tight">
                DevPulse
              </div>
            </div>
          </div>

          <nav className="flex-1 px-sm mt-4">
            {navItems.map(item => (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center justify-between px-md py-sm mb-xs rounded-sm transition-colors ${
                  activeNav === item.id
                    ? "text-primary font-bold border-l-4 border-primary bg-surface-variant -ml-[4px] pl-[12px]"
                    : "text-on-surface-variant hover:bg-surface-variant"
                }`}
              >
                <div className="flex items-center gap-md">
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span className="font-body-base text-body-base">{item.label}</span>
                </div>
                {Boolean(item.badge && item.badge > 0) && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-primary text-on-primary rounded-full">
                    {item.badge! > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            ))}

            <div className="mt-6 px-md mb-2">
              <button
                onClick={() => setIsModalOpen(true)}
                className="w-full py-sm bg-primary text-on-primary font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-md"
              >
                <span className="material-symbols-outlined">add</span>
                Post a Bug
              </button>
            </div>
          </nav>

          <div className="p-md mt-auto">
            {/* User Profile Mini */}
            <Link href={`/profile/${user?.username}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-variant transition-colors mb-4">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-container flex items-center justify-center shrink-0">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-on-primary-container">{user?.username?.[0]?.toUpperCase() || "U"}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-body-sm text-on-surface truncate">
                  {user?.full_name || user?.username}
                </div>
                <div className="text-[12px] text-on-surface-variant truncate">
                  @{user?.username}
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">settings</span>
            </Link>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-md px-md py-sm text-error hover:bg-error-container/20 transition-colors rounded-lg"
            >
              <span className="material-symbols-outlined">logout</span>
              <span className="font-body-base text-body-base text-left flex-1">Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex flex-col h-[calc(100vh-4rem)] md:h-screen overflow-hidden bg-surface pb-16 md:pb-0">
          {children}
        </div>
      </div>

      {/* Bottom Nav Bar (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 md:hidden bg-surface-container border-t border-outline-variant pb-safe">
        {navItems.map(item => (
          <Link
            key={item.id}
            href={item.href}
            className={`relative flex flex-col items-center gap-1 ${activeNav === item.id ? "text-primary scale-105" : "text-on-surface-variant"} transition-transform`}
          >
            <div className="relative">
              <span className="material-symbols-outlined">{item.icon}</span>
              {Boolean(item.badge && item.badge > 0) && (
                <span className="absolute -top-1 -right-2 px-1.5 py-0.2 text-[10px] font-bold bg-primary text-on-primary rounded-full min-w-[16px] text-center">
                  {item.badge! > 99 ? "99+" : item.badge}
                </span>
              )}
            </div>
            <span className="font-label-caps text-label-caps">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* FAB (Mobile only — hidden on messages page to avoid overlapping the chat send button) */}
      {activeNav !== "messages" && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="md:hidden fixed bottom-20 right-6 w-14 h-14 bg-primary-container text-on-primary-container rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
        >
          <span className="material-symbols-outlined text-[28px]">add</span>
        </button>
      )}

      {isModalOpen && (
        <CreatePostModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            if (activeNav === "home") {
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}