"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AppLayout from "@/components/AppLayout";
import Link from "next/link";
import { getAdminStats, AdminStatsResponse } from "@/lib/api";

// Shared sub-nav for the three admin pages. Kept here (duplicated in
// users/page.tsx and posts/page.tsx) rather than a shared layout.tsx, so
// each page independently redirects non-admins rather than relying on a
// parent layout to gate all three at once.
function AdminTabs({ active }: { active: "dashboard" | "users" | "posts" }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", href: "/admin" },
    { id: "users", label: "Users", href: "/admin/users" },
    { id: "posts", label: "Posts", href: "/admin/posts" },
  ] as const;

  return (
    <div className="flex gap-2 border-b border-outline-variant/30 px-6 pt-4">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            active === tab.id
              ? "text-primary border-b-2 border-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-[#111318] border border-outline-variant/30 rounded-xl p-5">
      <div className="text-[13px] text-on-surface-variant mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

/** Pure-SVG sparkline — no chart.js required */
function TrendChart({ title, data }: { title: string; data: { date: string; count: number }[] }) {
  const W = 500;
  const H = 160;
  const PAD = { top: 10, right: 10, bottom: 28, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#111318] border border-outline-variant/30 rounded-xl p-5">
        <div className="text-[13px] text-on-surface-variant mb-3">{title} — last 30 days</div>
        <div className="h-40 flex items-center justify-center text-on-surface-variant text-sm">No data</div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const xStep = innerW / Math.max(data.length - 1, 1);
  const points = data.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top + innerH - ((d.count - minVal) / range) * innerH,
    label: d.date.slice(5),
    count: d.count,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const fillPath = `${linePath} L${points[points.length - 1].x},${PAD.top + innerH} L${PAD.left},${PAD.top + innerH} Z`;

  // Y-axis tick labels (4 ticks)
  const yTicks = [0, 0.33, 0.67, 1].map((frac) => ({
    y: PAD.top + innerH - frac * innerH,
    label: Math.round(minVal + frac * range),
  }));

  // Show only first, middle, last x labels
  const xLabelIndices = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <div className="bg-[#111318] border border-outline-variant/30 rounded-xl p-5">
      <div className="text-[13px] text-on-surface-variant mb-3">{title} — last 30 days</div>
      <div className="w-full" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id={`fill-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#71d4ff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#71d4ff" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yTicks.map((t) => (
            <line key={t.y} x1={PAD.left} y1={t.y} x2={PAD.left + innerW} y2={t.y}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          ))}

          {/* Y-axis labels */}
          {yTicks.map((t) => (
            <text key={t.y} x={PAD.left - 6} y={t.y + 4} textAnchor="end"
              fontSize="9" fill="#9aa0a6">{t.label}</text>
          ))}

          {/* X-axis labels */}
          {points.map((p, i) =>
            xLabelIndices.has(i) ? (
              <text key={i} x={p.x} y={H - 4} textAnchor="middle"
                fontSize="9" fill="#9aa0a6">{p.label}</text>
            ) : null
          )}

          {/* Fill area */}
          <path d={fillPath} fill={`url(#fill-${title})`} />

          {/* Line */}
          <path d={linePath} fill="none" stroke="#71d4ff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* Dots */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#71d4ff" />
          ))}
        </svg>
      </div>
    </div>
  );
}


export default function AdminDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-side guard — redirect non-admin/superadmin users.
  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "superadmin") {
      router.replace("/feed");
    }
  }, [user, router]);

  // Always attempt to load stats — backend enforces view_stats permission.
  // If admin lacks permission, backend returns 403 → we show the lock UI.
  useEffect(() => {
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) return;
    setForbidden(false);
    setError(null);
    getAdminStats()
      .then(setStats)
      .catch((err) => {
        const msg: string = err?.message || "";
        if (msg.toLowerCase().includes("permission") || msg.includes("403")) {
          setForbidden(true);
        } else {
          setError(msg || "Failed to load stats");
        }
      });
  }, [user]);

  if (!user || (user.role !== "admin" && user.role !== "superadmin")) return null;

  return (
    <AppLayout activeNav="admin">
      <div className="flex flex-col h-full overflow-y-auto">
        <AdminTabs active="dashboard" />

        <div className="p-6">
          <h1 className="text-xl font-bold mb-6">Dashboard</h1>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-error-container/20 text-error text-sm">{error}</div>
          )}

          {forbidden ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] mb-3 opacity-40">lock</span>
              <p className="text-sm font-medium">You don't have access to view dashboard stats.</p>
              <p className="text-[13px] mt-1 opacity-60">Ask your superadmin to grant you the <code className="bg-white/5 px-1 rounded">view_stats</code> permission.</p>
            </div>
          ) : !stats ? (
            <div className="text-on-surface-variant text-sm">Loading stats...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Total Users" value={stats.total_users} />
                <StatCard label="Total Posts" value={stats.total_posts} />
                <StatCard label="Active Posts" value={stats.active_posts} />
                <StatCard label="Archived Posts" value={stats.archived_posts} />
                <StatCard label="Total Likes" value={stats.total_likes} />
                <StatCard label="Total Comments" value={stats.total_comments} />
                <StatCard label="Signups (7d)" value={stats.new_signups_7d} />
                <StatCard label="Signups (30d)" value={stats.new_signups_30d} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TrendChart title="Signups" data={stats.signups_per_day} />
                <TrendChart title="Posts" data={stats.posts_per_day} />
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}