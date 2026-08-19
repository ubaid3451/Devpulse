"use client";

import React from "react";
import Link from "next/link";

interface AdminTabsProps {
  active: "dashboard" | "users" | "posts";
}

export default function AdminTabs({ active }: AdminTabsProps) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/admin" },
    { id: "users", label: "Users", icon: "group", href: "/admin/users" },
    { id: "posts", label: "Posts", icon: "article", href: "/admin/posts" },
  ] as const;

  return (
    <div className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-outline-variant/30 px-4 sm:px-6 pt-3 pb-0 flex gap-2 sm:gap-4 overflow-x-auto shrink-0 shadow-sm">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
              isActive
                ? "text-primary border-primary font-semibold"
                : "text-on-surface-variant hover:text-on-surface border-transparent"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}