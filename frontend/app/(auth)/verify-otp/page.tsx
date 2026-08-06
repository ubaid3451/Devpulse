"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api";
import type { AuthResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

function VerifyOTPContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const { refreshUser } = useAuth();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleInput = useCallback(
    (index: number, value: string) => {
      const char = value.replace(/\D/g, "").slice(-1);
      const next = [...digits];
      next[index] = char;
      setDigits(next);
      if (char && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits]
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((c, i) => { next[i] = c; });
    setDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
  }, []);

  const handleVerify = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const code = digits.join("");
      if (code.length < OTP_LENGTH) { setError("Please enter all 6 digits."); return; }
      setError("");
      setIsVerifying(true);
      try {
        await apiPost<AuthResponse>("/auth/verify-otp", { email, code });
        // Set same-domain session marker so middleware allows access to /feed
        document.cookie = `devpulse_session=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        // The backend has now set the auth cookie, but AuthContext's `user`
        // state doesn't know that yet — it was only populated once, on
        // initial app load. Without this call, /feed would render with
        // user === null until something else (like a manual refresh)
        // happens to re-trigger that check. refreshUser() re-fetches
        // /auth/me and updates context immediately, so the redirect below
        // lands on a fully authenticated feed on the first try.
        await refreshUser();
        setSuccess(true);
        setTimeout(() => router.push("/feed"), 1500);
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Verification failed.");
      } finally {
        setIsVerifying(false);
      }
    },
    [digits, email, router, refreshUser]
  );

  const handleResend = useCallback(async () => {
    setIsResending(true);
    setError("");
    try {
      await apiPost("/auth/resend-otp", { email });
      setCountdown(RESEND_COOLDOWN);
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not resend code.");
    } finally {
      setIsResending(false);
    }
  }, [email]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Navigation (Shell suppressed for transactional page) */}
      <header className="w-full flex justify-between items-center px-md py-sm max-w-container-max mx-auto bg-surface border-b border-outline-variant">
        <div className="text-headline-md font-headline-md font-bold text-on-surface">
          DevPulse
        </div>
        <div className="hidden md:flex gap-md items-center">
          <span className="text-label-caps font-label-caps text-on-surface-variant">
            Help
          </span>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center p-md">
        <div className="w-full max-w-md bg-surface-container border border-outline-variant p-xl rounded-lg">
          {/* Icon / Branding Header */}
          <div className="flex justify-center mb-lg">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${success ? "bg-green-600/20 animate-pulse-ring" : "bg-primary-container"}`}>
              <span
                className="material-symbols-outlined text-on-primary-container"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {success ? "check_circle" : "verified_user"}
              </span>
            </div>
          </div>

          {/* Title & Subtext */}
          <div className="text-center mb-xl">
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface mb-sm">
              {success ? "Verified!" : "Verify your account"}
            </h1>
            <p className="text-body-base font-body-base text-on-surface-variant">
              {success ? "Redirecting you to your dashboard…" : "Enter the 6-digit code sent to your email"}
            </p>
            {email && !success && (
              <p className="text-body-sm text-outline mt-1">
                Sent to <span className="text-primary font-code-block">{email}</span>
              </p>
            )}
          </div>

          {/* OTP Input Form */}
          {!success && (
            <form onSubmit={handleVerify} className="space-y-xl" id="otp-form">
              <div className="flex justify-center gap-sm" id="otp-container">
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleInput(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    aria-label={`Digit ${i + 1}`}
                    className={`w-10 h-14 md:w-12 md:h-16 text-center text-headline-md font-code-block bg-surface-container-lowest border rounded-lg text-primary focus:border-primary-container outline-none transition-all ${digit ? "border-primary-container" : "border-outline-variant"}`}
                  />
                ))}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-error-container/20 border border-error/30 text-error text-sm text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifying || digits.join("").length < OTP_LENGTH}
                className={`w-full transition-all font-headline-md py-md rounded-lg active:scale-95 flex items-center justify-center gap-sm disabled:opacity-60 disabled:cursor-not-allowed ${success ? "bg-green-600 text-white" : "bg-primary-container hover:bg-primary text-on-primary-container"}`}
              >
                {isVerifying ? (
                  <>
                    <span className="material-symbols-outlined animate-spin-slow">
                      progress_activity
                    </span>
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify
                    <span className="material-symbols-outlined text-[20px]">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Resend Logic */}
          {!success && (
            <div className="mt-xl text-center">
              <div
                className="text-body-sm font-body-sm text-on-surface-variant"
                id="resend-container"
              >
                Didn&apos;t receive a code?{" "}
                {countdown > 0 ? (
                  <span className="text-primary font-bold ml-1" id="countdown-text">
                    Resend in 00:{countdown < 10 ? `0${countdown}` : countdown}
                  </span>
                ) : (
                  <button
                    id="resend-btn"
                    onClick={handleResend}
                    disabled={isResending}
                    className="text-primary hover:underline decoration-1 font-bold ml-1 transition-all disabled:opacity-60"
                  >
                    {isResending ? "Sending..." : "Resend code"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Developer Utility Hint */}
          <div className="mt-lg pt-lg border-t border-outline-variant flex items-center justify-center gap-sm">
            <span className="material-symbols-outlined text-on-surface-variant text-[16px]">
              terminal
            </span>
            <span className="text-label-caps font-label-caps text-on-surface-variant">
              Auth context: user_stage_2
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex flex-col md:flex-row justify-between items-center w-full px-md py-lg max-w-container-max mx-auto gap-md border-t border-outline-variant">
        <div className="text-label-caps font-bold text-on-surface-variant">
          © 2026 DevPulse. For developers by developers.
        </div>
        <div className="flex gap-md">
          <a
            className="text-label-caps font-label-caps text-on-surface-variant hover:text-primary underline decoration-1"
            href="#"
          >
            Privacy Policy
          </a>
          <a
            className="text-label-caps font-label-caps text-on-surface-variant hover:text-primary underline decoration-1"
            href="#"
          >
            Terms of Service
          </a>
          <a
            className="text-label-caps font-label-caps text-on-surface-variant hover:text-primary underline decoration-1"
            href="#"
          >
            Security
          </a>
        </div>
      </footer>
    </div>
  );
}

export default function VerifyOTPPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin-slow text-primary text-4xl">
            progress_activity
          </span>
        </div>
      }
    >
      <VerifyOTPContent />
    </Suspense>
  );
}