"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PostResponse,
  toggleLike,
  repostPost,
  deletePost,
  archivePost,
  unarchivePost,
  toggleBlock,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor(
    (now.getTime() - date.getTime()) / 1000
  );

  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;
  return `${Math.floor(diffInMonths / 12)}y ago`;
}

interface PostCardProps {
  post: PostResponse;
  onPostUpdate?: (updatedPost: PostResponse) => void;
  onLikeToggle?: () => void;
  onEdit?: (post: PostResponse) => void;
}

export default function PostCard({
  post,
  onPostUpdate,
  onLikeToggle,
  onEdit,
}: PostCardProps) {
  const { user } = useAuth();
  const router = useRouter();

  const displayPost = post.original_post || post;

  const [menuOpen, setMenuOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isReposted, setIsReposted] = useState(
    displayPost.is_reposted || false
  );

  React.useEffect(() => {
    setIsReposted(displayPost.is_reposted || false);
  }, [displayPost.id, displayPost.is_reposted]);

  const isReposter = user?.id === post.author_id;
  const isOriginalAuthor = user?.id === displayPost.author_id;
  const canManage = isReposter || isOriginalAuthor;

  // Editing/archiving only makes sense on the original post,
  // not on a repost wrapper.
  const canEditOrArchive = isOriginalAuthor && !post.original_post;

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isLiking) return;

    setIsLiking(true);

    try {
      const res = await toggleLike(displayPost.id);

      /*
       * Update the actual post owned by the parent.
       *
       * Do NOT update local likesCount/isLiked state here.
       * The parent becomes the single source of truth.
       */
      const updatedPost: PostResponse = {
        ...post,
        is_liked: res.is_liked,
        likes_count: res.likes_count,
      };

      onPostUpdate?.(updatedPost);
    } catch (err) {
      console.error("Failed to toggle like", err);
    } finally {
      setIsLiking(false);
    }
  };

  const handleRepost = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await repostPost(displayPost.id);
      setIsReposted(res.reposted);  // ← add this
      const updatedPost: PostResponse = {
        ...post,
        is_reposted: res.reposted,
      };
      onPostUpdate?.(updatedPost);
    } catch (err) {
      console.error("Failed to repost", err);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);

    try {
      // If the user is the reposter, delete the repost.
      // If the user is the original author, delete the original post.
      const idToDelete = isReposter ? post.id : displayPost.id;

      await deletePost(idToDelete);

      if (onLikeToggle) {
        onLikeToggle();
      }
    } catch (err) {
      console.error("Failed to delete post", err);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    onEdit?.(displayPost);
  };

  const handleToggleArchive = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    setIsArchiving(true);

    try {
      if (displayPost.is_archived) {
        await unarchivePost(displayPost.id);
      } else {
        await archivePost(displayPost.id);
      }

      if (onLikeToggle) {
        onLikeToggle();
      }
    } catch (err) {
      console.error("Failed to toggle archive state", err);
    } finally {
      setIsArchiving(false);
    }
  };

  const formattedTime = timeAgo(post.created_at);

  const avatarInitials = (
    displayPost.author.full_name?.substring(0, 2) ||
    displayPost.author.username.substring(0, 2)
  ).toUpperCase();

  const handleBlockAuthor = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);

    if (
      !confirm(
        `Are you sure you want to block @${displayPost.author.username}?`
      )
    ) {
      return;
    }

    try {
      await toggleBlock(displayPost.author.username);

      if (onLikeToggle) {
        onLikeToggle();
      }
    } catch (err) {
      console.error("Failed to block user", err);
    }
  };

  const handleGoToProfile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    router.push(`/profile/${displayPost.author.username}`);
  };

  return (
    <div
      onClick={() => router.push(`/posts/${post.id}`)}
      className="cursor-pointer block"
    >
      <article
        className={`bg-surface-container-low border rounded-xl p-md lg:p-lg hover:border-outline transition-all group ${displayPost.is_archived
            ? "border-dashed border-outline-variant/60 opacity-70"
            : "border-outline-variant"
          }`}
      >
        {post.original_post && (
          <div className="flex items-center gap-xs text-on-surface-variant text-body-sm mb-sm px-2 font-medium">
            <span className="material-symbols-outlined text-[16px]">
              repeat
            </span>
            <span>Reposted by @{post.author.username}</span>
          </div>
        )}

        {displayPost.is_archived && (
          <div className="flex items-center gap-xs text-on-surface-variant text-body-sm mb-sm px-2 font-medium">
            <span className="material-symbols-outlined text-[16px]">
              archive
            </span>
            <span>Archived — only visible to you</span>
          </div>
        )}

        <div className="flex justify-between items-start mb-md gap-2">
          <div className="flex items-center gap-sm min-w-0 flex-1">
            {displayPost.author.avatar_url ? (
              <img
                src={displayPost.author.avatar_url}
                alt={displayPost.author.username}
                className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant bg-surface-container-highest flex items-center justify-center shrink-0">
                <span className="text-on-surface font-bold">
                  {avatarInitials}
                </span>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h3 className="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors truncate">
                {displayPost.title}
              </h3>

              <div className="flex gap-1.5 items-center mt-0.5 text-body-sm text-on-surface-variant truncate">
                <span
                  className="hover:underline cursor-pointer truncate"
                  onClick={handleGoToProfile}
                >
                  @{displayPost.author.username}
                </span>

                <span className="shrink-0">
                  • {formattedTime}
                </span>
              </div>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-full hover:bg-surface-variant/40"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              title="Options"
            >
              <span className="material-symbols-outlined">
                more_horiz
              </span>
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 mt-1 w-48 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl z-10 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {canEditOrArchive && (
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-on-surface hover:bg-surface-variant/40 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      edit
                    </span>
                    Edit
                  </button>
                )}

                {canEditOrArchive && (
                  <button
                    type="button"
                    onClick={handleToggleArchive}
                    disabled={isArchiving}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-on-surface hover:bg-surface-variant/40 transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {displayPost.is_archived
                        ? "unarchive"
                        : "archive"}
                    </span>

                    {displayPost.is_archived
                      ? "Unarchive"
                      : "Archive"}
                  </button>
                )}

                {canManage && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-error hover:bg-error-container/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      delete
                    </span>
                    Delete
                  </button>
                )}

                {!isOriginalAuthor && (
                  <button
                    type="button"
                    onClick={handleBlockAuthor}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-error hover:bg-error-container/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      block
                    </span>
                    Block @{displayPost.author.username}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {displayPost.content && (
          <div className="bg-surface-container-highest rounded-lg p-md mb-md border border-outline-variant overflow-x-auto">
            <pre className="font-code-block text-code-block">
              <code className="text-on-surface-variant whitespace-pre-wrap">
                {displayPost.content}
              </code>
            </pre>
          </div>
        )}

        {displayPost.image_url && (
          <div className="mb-md rounded-lg overflow-hidden border border-outline-variant bg-surface-container-highest">
            <img
              src={displayPost.image_url}
              alt="Post image"
              className="w-full max-h-[500px] object-contain"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 pt-md border-t border-outline-variant/30">
          <div className="flex items-center gap-2 sm:gap-6 flex-wrap">
            <div className="flex items-center gap-xs text-on-surface-variant group-hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[18px]">
                forum
              </span>

              <span className="font-label-caps text-label-caps">
                {post.comments_count}{" "}
                <span className="hidden sm:inline">Comments</span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleRepost}
              className={`flex items-center gap-xs transition-colors p-1.5 rounded-md hover:bg-white/5 ${isReposted
                  ? "text-[#00b894]"
                  : "text-on-surface-variant hover:text-[#00b894]"
                }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                repeat
              </span>

              <span className="font-label-caps text-label-caps">
                Repost
              </span>
            </button>

            {/* LIKE BUTTON */}
            <button
              type="button"
              onClick={handleLike}
              disabled={isLiking}
              className={`flex items-center gap-xs transition-colors p-1.5 rounded-md hover:bg-white/5 ${displayPost.is_liked
                  ? "text-[#ff4757]"
                  : "text-on-surface-variant hover:text-[#ff4757]"
                } ${isLiking ? "opacity-70 cursor-wait" : ""}`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{
                  fontVariationSettings: displayPost.is_liked
                    ? "'FILL' 1"
                    : "'FILL' 0",
                }}
              >
                favorite
              </span>

              <span className="font-label-caps text-label-caps">
                {displayPost.likes_count ?? 0}{" "}
                <span className="hidden sm:inline">Like</span>
              </span>
            </button>
          </div>

          <span className="px-3 py-1.5 bg-secondary-container text-on-secondary-container text-body-sm font-semibold rounded-lg hover:bg-outline-variant transition-colors shrink-0">
            View Post
          </span>
        </div>
      </article>
    </div>
  );
}