"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getPost, addComment, PostDetailResponse } from "@/lib/api";
import PostCard from "@/components/PostCard";

export default function PostDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [post, setPost] = useState<PostDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPost = async () => {
    try {
      const data = await getPost(params.id);
      setPost(data);
    } catch (e: any) {
      setError(e.message || "Failed to load post");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && user) {
      fetchPost();
    }
  }, [isLoading, user, params.id]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim()) return;

    setIsSubmitting(true);
    try {
      await addComment(params.id, commentContent);
      setCommentContent("");
      fetchPost();
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin-slow text-primary text-4xl">progress_activity</span>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-on-surface">
        <div className="text-error font-bold mb-4">{error || "Post not found"}</div>
        <button onClick={() => router.push("/feed")} className="text-primary hover:underline">
          Return to Feed
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <header className="flex items-center w-full px-md h-16 sticky top-0 z-50 bg-surface border-b border-outline-variant">
        <button onClick={() => router.push("/feed")} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-full transition-colors mr-4">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Post Details
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-3 sm:p-md lg:p-lg space-y-md sm:space-y-lg pb-16">
        <PostCard post={post} onLikeToggle={fetchPost} />

        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-md lg:p-lg">
          <h3 className="font-headline-sm text-headline-sm mb-md">Comments ({post.comments.length})</h3>
          
          <form onSubmit={handleCommentSubmit} className="mb-lg flex gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant bg-surface-container-highest flex shrink-0 items-center justify-center">
              {user?.avatar_url ? (
                 <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-on-surface font-bold text-sm">{(user?.full_name?.substring(0, 2) || user?.username?.substring(0, 2) || "U").toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1">
              <textarea
                value={commentContent}
                onChange={e => setCommentContent(e.target.value)}
                placeholder="Add a comment..."
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 text-body-base focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none min-h-[80px]"
              />
              <div className="flex justify-end mt-2">
                <button 
                  type="submit"
                  disabled={!commentContent.trim() || isSubmitting}
                  className="px-4 py-1.5 bg-primary text-on-primary font-bold rounded hover:brightness-110 disabled:opacity-50 transition-colors"
                >
                  Comment
                </button>
              </div>
            </div>
          </form>

          <div className="space-y-4">
            {post.comments.map(comment => (
              <div key={comment.id} className="flex gap-3 pt-4 border-t border-outline-variant/30 first:border-0 first:pt-0">
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-outline-variant bg-surface-container-highest flex shrink-0 items-center justify-center">
                  {comment.author.avatar_url ? (
                    <img src={comment.author.avatar_url} alt={comment.author.username} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-on-surface font-bold text-xs">{(comment.author.full_name?.substring(0, 2) || comment.author.username.substring(0, 2)).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-body-sm text-on-surface">@{comment.author.username}</span>
                    <span className="text-[12px] text-on-surface-variant">
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-body-base text-on-surface-variant whitespace-pre-wrap">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
