"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AppLayout from "@/components/AppLayout";
import Link from "next/link";
import {
  getAdminUsers,
  blockUserAdmin,
  unblockUserAdmin,
  updateUserRoleAdmin,
  getAdminUserPermissions,
  updateAdminUserPermissions,
  AdminUserOut,
  ALL_PERMISSIONS,
} from "@/lib/api";

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

// ── Permissions Modal ─────────────────────────────────────────────────────────

function PermissionsModal({
  target,
  onClose,
  onSaved,
}: {
  target: AdminUserOut;
  onClose: () => void;
  onSaved: (updated: AdminUserOut) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(target.permissions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateAdminUserPermissions(target.id, Array.from(selected));
      onSaved({ ...target, permissions: Array.from(selected) });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111318] border border-outline-variant/40 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Admin Permissions</h2>
            <p className="text-[12px] text-on-surface-variant mt-0.5">@{target.username}</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {ALL_PERMISSIONS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1d24] hover:bg-[#1e2229] cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(key)}
                onChange={() => toggle(key)}
                className="w-4 h-4 accent-[#71d4ff] cursor-pointer"
              />
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-[11px] text-on-surface-variant font-mono">{key}</div>
              </div>
            </label>
          ))}
        </div>

        {error && (
          <div className="mx-6 mb-3 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">{error}</div>
        )}

        <div className="px-6 py-4 border-t border-outline-variant/20 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Permissions"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  if (role === "superadmin") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-400">
        <span className="material-symbols-outlined text-[12px]">shield_person</span>
        Superadmin
      </span>
    );
  }
  if (role === "admin") {
    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/20 text-blue-400">
        Admin
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-variant/40 text-on-surface-variant">
      User
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const router = useRouter();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<AdminUserOut[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [permTarget, setPermTarget] = useState<AdminUserOut | null>(null);

  const isSuperAdmin = currentUser?.role === "superadmin";

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      router.replace("/feed");
    }
  }, [currentUser, router]);

  const loadUsers = (nextSkip: number, searchTerm: string) => {
    setIsLoading(true);
    getAdminUsers({ search: searchTerm || undefined, skip: nextSkip, limit: PAGE_SIZE })
      .then((res) => {
        setUsers(res.items);
        setTotal(res.total);
        setSkip(res.skip);
      })
      .catch((err) => setError(err?.message || "Failed to load users"))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) return;
    loadUsers(0, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) return;
    const delay = setTimeout(() => loadUsers(0, search), 300);
    return () => clearTimeout(delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleToggleBlock = async (target: AdminUserOut) => {
    setActioningId(target.id);
    setError(null);
    try {
      const updated = target.is_active
        ? await blockUserAdmin(target.id)
        : await unblockUserAdmin(target.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err: any) {
      setError(err?.message || "Action failed");
    } finally {
      setActioningId(null);
    }
  };

  const handleRoleChange = async (target: AdminUserOut, newRole: string) => {
    if (target.id === currentUser?.id) return;
    setActioningId(target.id);
    setError(null);
    try {
      const updated = await updateUserRoleAdmin(target.id, newRole);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err: any) {
      setError(err?.message || "Role update failed");
    } finally {
      setActioningId(null);
    }
  };

  if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <AppLayout activeNav="admin">
      {permTarget && (
        <PermissionsModal
          target={permTarget}
          onClose={() => setPermTarget(null)}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            setPermTarget(null);
          }}
        />
      )}

      <div className="flex flex-col h-full overflow-y-auto">
        <AdminTabs active="users" />

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Users</h1>
            <input
              type="text"
              placeholder="Search by email, username, or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#1e2025] border border-outline-variant/50 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-error-container/20 text-error text-sm">{error}</div>
          )}

          <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#111318] text-on-surface-variant text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-on-surface-variant">
                      Loading...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-on-surface-variant">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isProtected = u.role === "superadmin";
                    const isSelf = u.id === currentUser?.id;
                    const canBlock = !isProtected && !isSelf && u.role !== "admin";

                    return (
                      <tr key={u.id} className="border-t border-outline-variant/20 hover:bg-white/[0.02]">
                        {/* Avatar + name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-variant shrink-0 relative">
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                                  {u.username?.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              {isProtected && (
                                <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 rounded-full w-3 h-3 flex items-center justify-center">
                                  <span className="material-symbols-outlined text-[8px] text-black">shield</span>
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{u.full_name || u.username}</div>
                              <div className="text-[12px] text-on-surface-variant">@{u.username}</div>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3 text-on-surface-variant">{u.email}</td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          {isSelf || isProtected || !isSuperAdmin ? (
                            <div className="flex items-center gap-2">
                              <RoleBadge role={u.role} />
                              {isSelf && <span className="text-[11px] text-on-surface-variant">(You)</span>}
                            </div>
                          ) : (
                            <select
                              value={u.role}
                              onChange={(e) => handleRoleChange(u, e.target.value)}
                              disabled={actioningId === u.id}
                              className="bg-[#1e2025] border border-outline-variant/40 rounded px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer disabled:opacity-50"
                            >
                              <option value="user">user</option>
                              <option value="admin">admin</option>
                            </select>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              u.is_active ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                            }`}
                          >
                            {u.is_active ? "Active" : "Blocked"}
                          </span>
                        </td>

                        {/* Joined */}
                        <td className="px-4 py-3 text-on-surface-variant">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            {/* Permissions button — superadmin only, for admin-role users */}
                            {isSuperAdmin && u.role === "admin" && (
                              <button
                                onClick={() => setPermTarget(u)}
                                title="Manage permissions"
                                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">tune</span>
                                Permissions
                              </button>
                            )}
                            {/* Block/Unblock */}
                            {canBlock ? (
                              <button
                                onClick={() => handleToggleBlock(u)}
                                disabled={actioningId === u.id}
                                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-50 ${
                                  u.is_active
                                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                    : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                                }`}
                              >
                                {actioningId === u.id ? "..." : u.is_active ? "Block" : "Unblock"}
                              </button>
                            ) : (
                              !isSuperAdmin || isProtected ? (
                                <span className="text-[12px] text-on-surface-variant/40">—</span>
                              ) : null
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-on-surface-variant">
            <div>Page {currentPage} of {totalPages} ({total} total)</div>
            <div className="flex gap-2">
              <button
                onClick={() => loadUsers(Math.max(0, skip - PAGE_SIZE), search)}
                disabled={skip === 0 || isLoading}
                className="px-3 py-1.5 rounded-lg bg-[#1e2025] disabled:opacity-40 hover:bg-[#1e2025]/70 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => loadUsers(skip + PAGE_SIZE, search)}
                disabled={skip + PAGE_SIZE >= total || isLoading}
                className="px-3 py-1.5 rounded-lg bg-[#1e2025] disabled:opacity-40 hover:bg-[#1e2025]/70 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}