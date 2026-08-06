"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * OAuth Success Landing Page
 *
 * After Google/GitHub OAuth, the backend redirects here.
 * This page sets the same-domain devpulse_session cookie so Next.js
 * middleware can detect the authenticated state, then redirects to /feed.
 */
export default function OAuthSuccessPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    // Set same-domain session cookie so middleware allows /feed access
    document.cookie = `devpulse_session=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

    // Refresh auth context with current user from /auth/me
    refreshUser().then(() => {
      router.replace("/feed");
    }).catch(() => {
      router.replace("/login");
    });
  }, [router, refreshUser]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-on-surface-variant text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
