"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getUserProfile,
  UserProfileResponse,
  getPosts,
  PostResponse,
  toggleFollow,
} from "@/lib/api";
import PostCard from "@/components/PostCard";
import CreatePostModal from "@/components/CreatePostModal";
import BlockButton from "@/components/BlockButton";

export default function UserProfilePage({ params }: { params: { username: string } }) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"posts" | "archived">("posts");
  const [editingPost, setEditingPost] = useState<PostResponse | null>(null);

  const isOwnProfile = currentUser?.username === params.username;

  const fetchProfileData = async (tab: "posts" | "archived" = activeTab) => {
    try {
      const [profileData, postsData] = await Promise.all([
        getUserProfile(params.username),
        // Archived posts are only ever fetched for your own profile —
        // getPosts silently ignores include_archived for other users' profiles
        // on the backend, but we also gate it here for clarity.
        getPosts(params.username, isOwnProfile && tab === "archived"),
      ]);
      setProfile(profileData);
      // When viewing "archived", only keep archived posts; when viewing "posts",
      // only keep non-archived ones (the backend already excludes archived by
      // default, but this keeps the two tabs strictly separate either way).
      const filtered =
        tab === "archived"
          ? postsData.filter((p) => p.is_archived)
          : postsData.filter((p) => !p.is_archived);
      setPosts(filtered);
    } catch (e: any) {
      setError(e.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchProfileData(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.username, activeTab]);

  const handleToggleFollow = async () => {
    if (!profile) return;
    try {
      await toggleFollow(profile.username);
      await fetchProfileData();
    } catch (e: any) {
      alert(e.message || "Failed to toggle follow");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin-slow text-primary text-4xl">progress_activity</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-on-surface">
        <div className="text-error font-bold mb-4">{error || "User not found"}</div>
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
          User Profile
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-md lg:p-lg mt-8">
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 sm:p-6 lg:p-8 flex flex-col items-center text-center">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-surface bg-surface-container-highest flex shrink-0 items-center justify-center mb-6 shadow-xl">
            {profile.avatar_url ? (
               <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-on-surface font-bold text-4xl">{(profile.full_name?.substring(0, 2) || profile.username.substring(0, 2)).toUpperCase()}</span>
            )}
          </div>

          <h1 className="text-display-sm font-bold text-on-surface mb-2">{profile.full_name}</h1>
          <p className="text-headline-sm text-primary mb-6 flex items-center gap-1.5">
            @{profile.username}
            {profile.is_private && (
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant" title="Private account">
                lock
              </span>
            )}
          </p>

          <div className="max-w-lg bg-surface-container-lowest rounded-lg p-md border border-outline-variant w-full mb-8">
            <p className="text-body-lg text-on-surface-variant whitespace-pre-wrap">
              {profile.bio || "This user hasn't added a bio yet."}
            </p>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 text-body-sm text-on-surface-variant mb-8">
            <span className="flex items-center gap-1 font-bold text-on-surface">
              {profile.followers_count ?? 0} <span className="font-normal text-on-surface-variant">Followers</span>
            </span>
            <span className="flex items-center gap-1 font-bold text-on-surface">
              {profile.following_count ?? 0} <span className="font-normal text-on-surface-variant">Following</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              Joined {new Date(profile.created_at).toLocaleDateString()}
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {isOwnProfile ? (
              <button
                onClick={() => router.push("/profile")}
                className="px-6 py-2 bg-secondary-container text-on-secondary-container font-bold rounded-lg hover:brightness-110 transition-colors"
              >
                Edit Profile
              </button>
            ) : profile.has_blocked_me ? (
              <div className="text-body-md text-error font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">block</span>
                You cannot view or interact with this account.
              </div>
            ) : (
              <>
                {!profile.is_blocked_by_me && (
                  <>
                    <button
                      onClick={handleToggleFollow}
                      className={`px-6 py-2 font-bold rounded-lg transition-colors flex items-center gap-2 ${
                        profile.is_following || profile.has_pending_request
                          ? "bg-surface-variant text-on-surface hover:bg-surface-container-high"
                          : "bg-primary text-on-primary hover:brightness-110"
                      }`}
                    >
                      {profile.has_pending_request && (
                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                      )}
                      {profile.is_following
                        ? "Unfollow"
                        : profile.has_pending_request
                        ? "Requested"
                        : profile.is_private
                        ? "Request to Follow"
                        : "Follow"}
                    </button>
                    <button
                      onClick={() => router.push(`/chat?user=${profile.username}`)}
                      className="px-6 py-2 bg-secondary-container text-on-secondary-container font-bold rounded-lg hover:brightness-110 transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">chat</span>
                      Message
                    </button>
                  </>
                )}
                <BlockButton
                  username={profile.username}
                  isBlockedByMe={!!profile.is_blocked_by_me}
                  onChange={(blocked) => {
                    setProfile((prev) => (prev ? { ...prev, is_blocked_by_me: blocked } : null));
                    fetchProfileData(activeTab);
                  }}
                />
              </>
            )}
          </div>
        </div>

        <div className="mt-12">
          <div className="flex items-center justify-between border-b border-outline-variant mb-6">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab("posts")}
                className={`px-4 py-2 text-title-lg font-bold border-b-2 -mb-px transition-colors ${
                  activeTab === "posts"
                    ? "border-primary text-on-surface"
                    : "border-transparent text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Posts
              </button>
              {isOwnProfile && (
                <button
                  onClick={() => setActiveTab("archived")}
                  className={`px-4 py-2 text-title-lg font-bold border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                    activeTab === "archived"
                      ? "border-primary text-on-surface"
                      : "border-transparent text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">archive</span>
                  Archived
                </button>
              )}
            </div>
          </div>

          {profile.has_blocked_me ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">block</span>
              <h3 className="text-title-md font-bold text-on-surface mb-1">Account Unavailable</h3>
              <p className="text-body-md text-on-surface-variant">
                You cannot view posts from @{profile.username}.
              </p>
            </div>
          ) : profile.is_blocked_by_me ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">block</span>
              <h3 className="text-title-md font-bold text-on-surface mb-1">You have blocked @{profile.username}</h3>
              <p className="text-body-md text-on-surface-variant">
                Unblock this account to view their posts.
              </p>
            </div>
          ) : profile.is_private && !isOwnProfile && !profile.is_following ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
              <h3 className="text-title-md font-bold text-on-surface mb-1">This account is private</h3>
              <p className="text-body-md text-on-surface-variant">
                {profile.has_pending_request
                  ? "Your follow request is pending approval."
                  : `Follow @${profile.username} to see their posts.`}
              </p>
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">
                {activeTab === "archived" ? "archive" : "post_add"}
              </span>
              <h3 className="text-title-md font-bold text-on-surface mb-1">
                {activeTab === "archived" ? "No archived posts" : "No posts yet"}
              </h3>
              <p className="text-body-md text-on-surface-variant">
                {activeTab === "archived"
                  ? "Posts you archive will show up here."
                  : isOwnProfile
                  ? "You haven't posted anything."
                  : `@${profile.username} hasn't posted anything.`}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLikeToggle={() => fetchProfileData(activeTab)}
                  onEdit={setEditingPost}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {editingPost && (
        <CreatePostModal
          editingPost={editingPost}
          onClose={() => setEditingPost(null)}
          onSuccess={() => fetchProfileData(activeTab)}
        />
      )}
    </div>
  );
}