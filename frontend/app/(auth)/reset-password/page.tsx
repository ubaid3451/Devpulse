"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api";

const OTP_LENGTH = 6;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [step, setStep] = useState<1 | 2>(1);
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === 1) {
      inputRefs.current[0]?.focus();
    }
  }, [step]);

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

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (digits.join("").length < OTP_LENGTH) {
      setError("Please enter all 6 digits.");
      return;
    }
    setError("");
    setStep(2);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await apiPost("/auth/reset-password", { 
        email, 
        code: digits.join(""), 
        new_password: newPassword 
      });
      setSuccess(true);
    } catch (err) {
      const errorDetail = err instanceof ApiError ? err.detail : "Reset failed.";
      setError(errorDetail);
      if (errorDetail.toLowerCase().includes("otp")) {
        setStep(1); // Go back if OTP was the problem
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <main className="flex-grow flex items-center justify-center p-md">
          <div className="w-full max-w-md bg-surface-container border border-outline-variant p-xl rounded-lg text-center">
            <div className="flex justify-center mb-lg">
              <div className="w-12 h-12 rounded-full bg-green-600/20 text-green-500 flex items-center justify-center animate-pulse-ring">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
              </div>
            </div>
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface mb-sm">
              Password Reset
            </h1>
            <p className="text-body-base font-body-base text-on-surface-variant mb-xl">
              Your password has been changed successfully. You can now log in with your new password.
            </p>
            <Link
              href="/login"
              className="w-full inline-block bg-primary-container hover:bg-primary text-on-primary-container font-headline-md py-md rounded-lg transition-all"
            >
              Go to Login
            </Link>
          </div>
        </main>
      </div>
    );
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
              {step === 1 ? "Verify email" : "Set new password"}
            </h1>
            <p className="text-body-base font-body-base text-on-surface-variant">
              {step === 1 
                ? "Enter the 6-digit code we sent to your email address." 
                : "Create a new, strong password for your account."}
            </p>
            {email && step === 1 && (
              <p className="text-body-sm text-outline mt-1">
                Sent to <span className="text-primary font-code-block">{email}</span>
              </p>
            )}
          </div>

          {step === 1 ? (
            <form onSubmit={handleNextStep} className="space-y-xl">
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
                disabled={digits.join("").length < OTP_LENGTH}
                className="w-full bg-primary-container hover:bg-primary text-on-primary-container font-headline-md py-md rounded-lg transition-all active:scale-95 flex items-center justify-center gap-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Next
                <span className="material-symbols-outlined text-[20px]">
                  arrow_forward
                </span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-lg">
              <div className="space-y-xs">
                <label className="text-label-caps font-label-caps text-on-surface-variant px-xs">
                  NEW PASSWORD
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-body-base font-body-base text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-error-container/20 border border-error/30 text-error text-sm text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-sm">
                <button
                  type="button"
                  onClick={() => { setError(""); setStep(1); }}
                  className="w-1/3 bg-surface-variant hover:bg-outline-variant text-on-surface font-headline-md py-md rounded-lg transition-all active:scale-95 flex items-center justify-center"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !newPassword}
                  className="w-2/3 bg-primary-container hover:bg-primary text-on-primary-container font-headline-md py-md rounded-lg transition-all active:scale-95 flex items-center justify-center gap-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin-slow">
                        progress_activity
                      </span>
                      Saving...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="mt-xl text-center">
            <Link
              href="/login"
              className="text-body-sm font-body-sm text-primary hover:underline"
            >
              Cancel
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
