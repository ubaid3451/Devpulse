"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { updateProfile, uploadAvatar, updatePrivacy } from "@/lib/api";

const PREDEFINED_AVATARS = [
  "https://api.dicebear.com/7.x/bottts/svg?seed=Felix",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Luna",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Jasper",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Leo",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Oliver",
];

export default function MyProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [bio, setBio] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingPrivacy, setIsTogglingPrivacy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) {
      setBio(user.bio || "");
      setFullName(user.full_name || "");
      setAvatarUrl(user.avatar_url || "");
      setIsPrivate((user as any).is_private || false);
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin-slow text-primary text-4xl">progress_activity</span>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsUploading(true);
      setMessage("");
      try {
        const formData = new FormData();
        formData.append("image", file);
        const data = await uploadAvatar(formData);
        setAvatarUrl(data.avatar_url);
        setMessage("Avatar uploaded successfully! Don't forget to save your profile.");
      } catch (err: any) {
        setMessage(err.message || "Failed to upload avatar");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleTogglePrivacy = async () => {
    const newValue = !isPrivate;
    setIsTogglingPrivacy(true);
    setMessage("");
    try {
      await updatePrivacy(newValue);
      setIsPrivate(newValue);
      setMessage(
        newValue
          ? "Your account is now private. New followers will need your approval."
          : "Your account is now public. Anyone can follow you instantly."
      );
    } catch (err: any) {
      setMessage(err.message || "Failed to update privacy setting");
    } finally {
      setIsTogglingPrivacy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    try {
      await updateProfile({
        bio,
        full_name: fullName,
        avatar_url: avatarUrl || undefined,
      });
      setMessage("Profile updated successfully!");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (e: any) {
      setMessage(e.message || "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <header className="flex items-center w-full px-md h-16 sticky top-0 z-50 bg-surface border-b border-outline-variant">
        <button onClick={() => router.push("/feed")} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-full transition-colors mr-4">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Edit Profile
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-3 sm:p-md lg:p-lg space-y-6 pb-16">
        {message && (
          <div className={`p-4 rounded-lg text-sm border ${message.includes("successfully") || message.includes("now private") || message.includes("now public") ? "bg-primary-container/20 text-primary border-primary/30" : "bg-error-container/20 text-error border-error/30"}`}>
            {message}
          </div>
        )}

        {/* Privacy Settings — separate card, saves immediately (not tied to the main form's Save button) */}
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-md lg:p-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                  {isPrivate ? "lock" : "public"}
                </span>
                <label className="text-label-lg font-bold text-on-surface">
                  {isPrivate ? "Private Account" : "Public Account"}
                </label>
              </div>
              <p className="text-body-sm text-on-surface-variant">
                {isPrivate
                  ? "New followers must be approved by you before they can see your posts."
                  : "Anyone can follow you and see your posts instantly."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleTogglePrivacy}
              disabled={isTogglingPrivacy}
              className={`relative w-14 h-8 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                isPrivate ? "bg-primary" : "bg-surface-variant"
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${
                  isPrivate ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Blocked Users — link out to the dedicated management page */}
        <Link
          href="/blocked"
          className="flex items-center justify-between gap-4 bg-surface-container-low border border-outline-variant rounded-xl p-md lg:p-lg hover:border-outline transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">block</span>
            <span className="text-label-lg font-bold text-on-surface">Blocked Users</span>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">chevron_right</span>
        </Link>

        <form onSubmit={handleSubmit} className="bg-surface-container-low border border-outline-variant rounded-xl p-md lg:p-lg space-y-6">
          <div className="flex flex-col gap-4">
            <label className="block text-label-lg font-bold text-on-surface">Profile Avatar</label>
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-surface bg-surface-container-highest flex shrink-0 items-center justify-center shadow-lg relative group">
                {avatarUrl ? (
                   <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-on-surface font-bold text-2xl">{(fullName?.substring(0, 2) || user.username.substring(0, 2)).toUpperCase()}</span>
                )}
                <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                  <span className="material-symbols-outlined text-white">upload</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                </label>
              </div>

              <div className="flex-1 w-full">
                <div className="text-body-sm text-on-surface-variant mb-3 text-center md:text-left">
                  Upload a custom photo or choose a bot!
                </div>

                {isUploading ? (
                  <div className="h-16 flex items-center justify-center bg-surface-container-lowest rounded-lg border border-outline-variant/50">
                    <span className="material-symbols-outlined animate-spin-slow text-primary">progress_activity</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-center md:justify-start gap-3">
                    {PREDEFINED_AVATARS.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setAvatarUrl(url)}
                        className={`w-14 h-14 rounded-full overflow-hidden border-2 transition-all hover:scale-110 ${avatarUrl === url ? 'border-primary ring-2 ring-primary/30' : 'border-outline-variant hover:border-primary/50'}`}
                      >
                        <img src={url} alt={`Predefined Avatar ${i}`} className="w-full h-full object-cover bg-surface-container-lowest" />
                      </button>
                    ))}
                    <label className="w-14 h-14 rounded-full border-2 border-dashed border-outline hover:border-primary flex items-center justify-center cursor-pointer transition-all hover:scale-110 hover:bg-primary-container/10">
                      <span className="material-symbols-outlined text-on-surface-variant">add_photo_alternate</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-label-lg font-bold text-on-surface mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 text-body-base focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="block text-label-lg font-bold text-on-surface mb-1">Username</label>
            <input
              type="text"
              value={user.username}
              disabled
              className="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-4 py-2 text-body-base text-on-surface-variant cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-label-lg font-bold text-on-surface mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-3 text-body-base focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none min-h-[120px]"
            />
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-primary text-on-primary font-bold rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}