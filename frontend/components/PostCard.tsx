"use client";

import React, { useState } from "react";
import Link from "next/link";
import { PostResponse, toggleLike, repostPost, deletePost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

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

export default function PostCard({ post, onLikeToggle }: { post: PostResponse; onLikeToggle?: () => void }) {
  const { user } = useAuth();
  const displayPost = post.original_post || post;
  
  const isReposter = user?.id === post.author_id;
  const isOriginalAuthor = user?.id === displayPost.author_id;
  const canDelete = isReposter || isOriginalAuthor;

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await toggleLike(displayPost.id);
      if (onLikeToggle) {
        onLikeToggle();
      }
    } catch (err) {
      console.error("Failed to toggle like", err);
    }
  };

  const handleRepost = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await repostPost(displayPost.id);
      // We could trigger a feed refresh if needed, for now just an alert or rely on parent
      if (onLikeToggle) {
         onLikeToggle();
      }
    } catch (err) {
      console.error("Failed to repost", err);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      // If the user is the reposter, delete the repost.
      // If the user is the original author (but not the reposter), delete the original post.
      const idToDelete = isReposter ? post.id : displayPost.id;
      await deletePost(idToDelete);
      if (onLikeToggle) {
         onLikeToggle();
      }
    } catch (err) {
      console.error("Failed to delete post", err);
    }
  };

  const formattedTime = timeAgo(post.created_at);
  
  const avatarInitials = (displayPost.author.full_name?.substring(0, 2) || displayPost.author.username.substring(0, 2)).toUpperCase();

  return (
    <Link href={`/posts/${post.id}`}>
      <article className="bg-surface-container-low border border-outline-variant rounded-xl p-md lg:p-lg hover:border-outline transition-all group block">
        {post.original_post && (
          <div className="flex items-center gap-xs text-on-surface-variant text-body-sm mb-sm px-2 font-medium">
            <span className="material-symbols-outlined text-[16px]">repeat</span>
            <span>Reposted by @{post.author.username}</span>
          </div>
        )}
        <div className="flex justify-between items-start mb-md">
          <div className="flex items-center gap-sm">
            {displayPost.author.avatar_url ? (
              <img src={displayPost.author.avatar_url} alt={displayPost.author.username} className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant bg-surface-container-highest flex items-center justify-center">
                <span className="text-on-surface font-bold">{avatarInitials}</span>
              </div>
            )}
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors">
                {displayPost.title}
              </h3>
              <div className="flex gap-2 items-center mt-0.5">
                <span className="text-body-sm text-on-surface-variant hover:underline cursor-pointer" onClick={(e) => {
                    // Prevent navigation to post if clicking on user
                    e.stopPropagation();
                }}>
                  <Link href={`/profile/${displayPost.author.username}`}>@{displayPost.author.username}</Link>
                </span>
                <span className="text-body-sm text-on-surface-variant">
                  • {formattedTime}
                </span>
              </div>
            </div>
          </div>
          {canDelete ? (
            <button className="text-on-surface-variant hover:text-error transition-colors" onClick={handleDelete} title="Delete Post">
              <span className="material-symbols-outlined">delete</span>
            </button>
          ) : (
            <button className="text-on-surface-variant hover:text-on-surface" onClick={(e) => e.preventDefault()}>
              <span className="material-symbols-outlined">more_horiz</span>
            </button>
          )}
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
            <img src={displayPost.image_url} alt="Post image" className="w-full max-h-[500px] object-contain" />
          </div>
        )}
        
        <div className="flex items-center justify-between pt-md border-t border-outline-variant/30">
          <div className="flex gap-lg">
            <div className="flex items-center gap-xs text-on-surface-variant group-hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[18px]">forum</span>
              <span className="font-label-caps text-label-caps">{post.comments_count} Comments</span>
            </div>
            <button 
              onClick={handleRepost}
              className={`flex items-center gap-xs transition-colors ${displayPost.is_reposted ? 'text-[#00b894]' : 'text-on-surface-variant hover:text-[#00b894]'}`}
            >
              <span className="material-symbols-outlined text-[18px]">repeat</span>
              <span className="font-label-caps text-label-caps">Repost</span>
            </button>
            <button 
              onClick={handleLike}
              className={`flex items-center gap-xs transition-colors ${displayPost.is_liked ? 'text-[#ff4757]' : 'text-on-surface-variant hover:text-[#ff4757]'}`}
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: displayPost.is_liked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
              <span className="font-label-caps text-label-caps">{displayPost.likes_count} Like</span>
            </button>
          </div>
          <span className="px-md py-1.5 bg-secondary-container text-on-secondary-container text-body-sm font-semibold rounded-lg hover:bg-outline-variant transition-colors">
            View Post
          </span>
        </div>
      </article>
    </Link>
  );
}
