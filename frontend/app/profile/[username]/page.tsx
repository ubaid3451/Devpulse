"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getUserProfile, UserProfileResponse, getPosts, PostResponse } from "@/lib/api";
import PostCard from "@/components/PostCard";

export default function UserProfilePage({ params }: { params: { username: string } }) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchProfileData = async () => {
    try {
      const [profileData, postsData] = await Promise.all([
        getUserProfile(params.username),
        getPosts(params.username)
      ]);
      setProfile(profileData);
      setPosts(postsData);
    } catch (e: any) {
      setError(e.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, [params.username]);

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

  const isOwnProfile = currentUser?.username === profile.username;

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
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl flex flex-col items-center text-center">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-surface bg-surface-container-highest flex shrink-0 items-center justify-center mb-6 shadow-xl">
            {profile.avatar_url ? (
               <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-on-surface font-bold text-4xl">{(profile.full_name?.substring(0, 2) || profile.username.substring(0, 2)).toUpperCase()}</span>
            )}
          </div>
          
          <h1 className="text-display-sm font-bold text-on-surface mb-2">{profile.full_name}</h1>
          <p className="text-headline-sm text-primary mb-6">@{profile.username}</p>
          
          <div className="max-w-lg bg-surface-container-lowest rounded-lg p-md border border-outline-variant w-full mb-8">
            <p className="text-body-lg text-on-surface-variant whitespace-pre-wrap">
              {profile.bio || "This user hasn't added a bio yet."}
            </p>
          </div>
          
          <div className="flex gap-4 text-body-sm text-on-surface-variant mb-8">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              Joined {new Date(profile.created_at).toLocaleDateString()}
            </span>
          </div>

          {isOwnProfile && (
            <button 
              onClick={() => router.push("/profile")}
              className="px-6 py-2 bg-secondary-container text-on-secondary-container font-bold rounded-lg hover:brightness-110 transition-colors"
            >
              Edit Profile
            </button>
          )}
        </div>

        <div className="mt-12">
          <h2 className="text-title-lg font-bold text-on-surface mb-6 border-b border-outline-variant pb-2">Posts by @{profile.username}</h2>
          
          {posts.length === 0 ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">post_add</span>
              <h3 className="text-title-md font-bold text-on-surface mb-1">No posts yet</h3>
              <p className="text-body-md text-on-surface-variant">
                {isOwnProfile ? "You haven't" : `@${profile.username} hasn't`} posted anything.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map(post => (
                <PostCard key={post.id} post={post} onLikeToggle={fetchProfileData} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
