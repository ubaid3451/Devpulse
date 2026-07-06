"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await apiPost("/auth/forgot-password", { email });
      router.push(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="w-full flex justify-between items-center px-md py-sm max-w-container-max mx-auto bg-surface border-b border-outline-variant">
        <div className="text-headline-md font-headline-md font-bold text-on-surface">
          DevPulse
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center p-md">
        <div className="w-full max-w-md bg-surface-container border border-outline-variant p-xl rounded-lg">
          <div className="flex justify-center mb-lg">
            <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary-container">
                lock_reset
              </span>
            </div>
          </div>

          <div className="text-center mb-xl">
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface mb-sm">
              Reset Password
            </h1>
            <p className="text-body-base font-body-base text-on-surface-variant">
              Enter your email address and we&apos;ll send you a verification code to reset your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-lg">
            <div className="space-y-xs">
              <label className="text-label-caps font-label-caps text-on-surface-variant px-xs">
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-body-base font-body-base text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                placeholder="name@company.com"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-error-container/20 border border-error/30 text-error text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full bg-primary-container hover:bg-primary text-on-primary-container font-headline-md py-md rounded-lg transition-all active:scale-95 flex items-center justify-center gap-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined animate-spin-slow">
                    progress_activity
                  </span>
                  Sending code...
                </>
              ) : (
                <>
                  Send verification code
                  <span className="material-symbols-outlined text-[20px]">
                    arrow_forward
                  </span>
                </>
              )}
            </button>
          </form>

          <div className="mt-xl text-center">
            <Link
              href="/login"
              className="text-body-sm font-body-sm text-primary hover:underline"
            >
              Back to login
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
