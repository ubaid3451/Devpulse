"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AppLayout from "@/components/AppLayout";
import Link from "next/link";
import { getAdminUsers, blockUserAdmin, unblockUserAdmin, updateUserRoleAdmin, AdminUserOut } from "@/lib/api";

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

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
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
    if (!currentUser || currentUser.role !== "admin") return;
    loadUsers(0, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return;
    const delay = setTimeout(() => loadUsers(0, search), 300);
    return () => clearTimeout(delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleToggleBlock = async (target: AdminUserOut) => {
    setActioningId(target.id);
    setError(null);
    try {
      const updated = target.is_active ? await blockUserAdmin(target.id) : await unblockUserAdmin(target.id);
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

  if (!currentUser || currentUser.role !== "admin") return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <AppLayout activeNav="admin">
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
                  <th className="px-4 py-3 font-medium text-right">Action</th>
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
                  users.map((u) => (
                    <tr key={u.id} className="border-t border-outline-variant/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-variant shrink-0">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                                {u.username?.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{u.full_name || u.username}</div>
                            <div className="text-[12px] text-on-surface-variant">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">{u.email}</td>
                      <td className="px-4 py-3">
                        {u.id === currentUser?.id ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/20 text-primary">
                            {u.role} (You)
                          </span>
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
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            u.is_active ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                          }`}
                        >
                          {u.is_active ? "Active" : "Blocked"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.role === "admin" ? (
                          <span className="text-[12px] text-on-surface-variant/50">—</span>
                        ) : (
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
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-on-surface-variant">
            <div>
              Page {currentPage} of {totalPages} ({total} total)
            </div>
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