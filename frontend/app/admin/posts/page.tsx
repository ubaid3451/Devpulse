"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AppLayout from "@/components/AppLayout";
import Link from "next/link";
import { getAdminPosts, updateAdminPost, deleteAdminPost, AdminPostOut } from "@/lib/api";

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

export default function AdminPostsPage() {
  const router = useRouter();
  const { user: currentUser } = useAuth();

  const [posts, setPosts] = useState<AdminPostOut[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<AdminPostOut | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      router.replace("/feed");
    }
  }, [currentUser, router]);

  const loadPosts = (nextSkip: number, searchTerm: string, archived: boolean) => {
    setIsLoading(true);
    getAdminPosts({ search: searchTerm || undefined, include_archived: archived, skip: nextSkip, limit: PAGE_SIZE })
      .then((res) => {
        setPosts(res.items);
        setTotal(res.total);
        setSkip(res.skip);
      })
      .catch((err) => setError(err?.message || "Failed to load posts"))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return;
    loadPosts(0, "", includeArchived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return;
    const delay = setTimeout(() => loadPosts(0, search, includeArchived), 300);
    return () => clearTimeout(delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, includeArchived]);

  const openEdit = (post: AdminPostOut) => {
    setEditingPost(post);
    setEditTitle(post.title || "");
    setEditContent(post.content || "");
  };

  const saveEdit = async () => {
    if (!editingPost) return;
    setIsSavingEdit(true);
    try {
      const updated = await updateAdminPost(editingPost.id, { title: editTitle, content: editContent });
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingPost(null);
    } catch (err: any) {
      setError(err?.message || "Failed to save changes");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const confirmDelete = async (postId: string) => {
    setDeletingId(postId);
    try {
      await deleteAdminPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setTotal((t) => t - 1);
    } catch (err: any) {
      setError(err?.message || "Failed to delete post");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  if (!currentUser || currentUser.role !== "admin") return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <AppLayout activeNav="admin">
      <div className="flex flex-col h-full overflow-y-auto">
        <AdminTabs active="posts" />

        <div className="p-6">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <h1 className="text-xl font-bold">Posts</h1>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="accent-primary"
                />
                Include archived
              </label>
              <input
                type="text"
                placeholder="Search title, content, or author..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#1e2025] border border-outline-variant/50 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-error-container/20 text-error text-sm">{error}</div>
          )}

          <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#111318] text-on-surface-variant text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Post</th>
                  <th className="px-4 py-3 font-medium">Author</th>
                  <th className="px-4 py-3 font-medium">Engagement</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
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
                ) : posts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-on-surface-variant">
                      No posts found.
                    </td>
                  </tr>
                ) : (
                  posts.map((p) => (
                    <tr key={p.id} className="border-t border-outline-variant/20 align-top">
                      <td className="px-4 py-3 max-w-xs">
                        {p.title && <div className="font-medium truncate">{p.title}</div>}
                        <div className="text-on-surface-variant text-[13px] line-clamp-2">{p.content}</div>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">@{p.author_username}</td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {p.likes_count} likes · {p.comments_count} comments
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            p.is_archived ? "bg-surface-variant text-on-surface-variant" : "bg-green-500/15 text-green-400"
                          }`}
                        >
                          {p.is_archived ? "Archived" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEdit(p)}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#1e2025] hover:bg-[#1e2025]/70 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(p.id)}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                          {confirmDeleteId === p.id && (
                            <div className="flex items-center gap-1.5 bg-[#1e2025] border border-red-500/30 rounded-lg px-2 py-1">
                              <span className="text-[11px] text-on-surface">Delete this post?</span>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-[11px] text-on-surface-variant px-1.5 hover:text-on-surface"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => confirmDelete(p.id)}
                                disabled={deletingId === p.id}
                                className="text-[11px] font-medium text-red-400 px-1.5 hover:text-red-300 disabled:opacity-50"
                              >
                                {deletingId === p.id ? "..." : "Confirm"}
                              </button>
                            </div>
                          )}
                        </div>
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
                onClick={() => loadPosts(Math.max(0, skip - PAGE_SIZE), search, includeArchived)}
                disabled={skip === 0 || isLoading}
                className="px-3 py-1.5 rounded-lg bg-[#1e2025] disabled:opacity-40 hover:bg-[#1e2025]/70 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => loadPosts(skip + PAGE_SIZE, search, includeArchived)}
                disabled={skip + PAGE_SIZE >= total || isLoading}
                className="px-3 py-1.5 rounded-lg bg-[#1e2025] disabled:opacity-40 hover:bg-[#1e2025]/70 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#111318] border border-outline-variant/40 rounded-xl w-full max-w-lg p-5">
            <h2 className="font-bold mb-4">Edit post</h2>
            <label className="block text-[12px] text-on-surface-variant mb-1">Title</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-[#1e2025] border border-outline-variant/50 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-primary"
            />
            <label className="block text-[12px] text-on-surface-variant mb-1">Content</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={5}
              className="w-full bg-[#1e2025] border border-outline-variant/50 rounded-lg px-3 py-2 text-sm mb-4 resize-none focus:outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingPost(null)}
                className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-[#1e2025] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={isSavingEdit}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#71d4ff] text-[#003548] hover:brightness-110 disabled:opacity-50 transition-colors"
              >
                {isSavingEdit ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}