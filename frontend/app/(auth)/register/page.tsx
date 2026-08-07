"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError, BASE_URL } from "@/lib/api";

const API_URL = BASE_URL;

interface PasswordStrength {
  minLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

function checkPassword(p: string): PasswordStrength {
  return {
    minLength: p.length >= 8,
    hasUppercase: /[A-Z]/.test(p),
    hasNumber: /[0-9]/.test(p),
    hasSymbol: /[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(p),
  };
}

function StrengthItem({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-xs text-[10px] font-medium text-on-surface-variant">
      <span
        className={`material-symbols-outlined text-[14px] transition-colors ${
          ok ? "text-tertiary" : "text-error"
        }`}
      >
        {ok ? "check_circle" : "cancel"}
      </span>
      {label}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = checkPassword(password);
  const allPassing = Object.values(strength).every(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allPassing) {
      setError("Please meet all password requirements.");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      await register(fullName, email, password);
      router.push(`/verify-otp?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Navigation */}
      <header className="w-full bg-surface border-b border-outline-variant fixed top-0 z-50">
        <div className="flex justify-between items-center w-full px-md py-sm max-w-container-max mx-auto h-16">
          <div className="text-headline-md font-headline-md font-bold text-on-surface">
            DevPulse
          </div>
          <div className="flex items-center gap-md">
            <span className="text-body-sm font-body-sm text-on-surface-variant cursor-pointer hover:text-primary transition-colors">
              Help
            </span>
          </div>
        </div>
      </header>

      {/* Main Registration Shell */}
      <main className="flex-grow flex items-center justify-center pt-24 pb-8 px-gutter md:px-0 bg-background overflow-hidden relative">
        {/* Subtle Ambient Background */}
        <div className="absolute inset-0 z-0 opacity-40 pointer-events-none"></div>
        <div className="max-w-[1000px] w-full grid grid-cols-1 md:grid-cols-2 z-10 overflow-hidden rounded-xl surface-level-1 shadow-2xl">
          {/* Branding Panel (Left/Top) */}
          <section className="relative p-xl flex flex-col justify-between overflow-hidden min-h-[300px] md:min-h-auto">
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary-container/10 to-transparent"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-sm mb-xl">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span
                    className="material-symbols-outlined text-on-primary-fixed text-lg"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    terminal
                  </span>
                </div>
                <span className="font-bold text-headline-md font-headline-md text-on-surface">
                  DevPulse
                </span>
              </div>
              <h1 className="text-display-lg font-display-lg mb-md leading-tight text-on-surface">
                Join the <span className="text-primary">network</span>
              </h1>
              <p className="text-body-base font-body-base text-on-surface-variant max-w-xs">
                Collaborative debugging for modern engineering teams. Resolve
                bottlenecks, track bugs, and deploy with confidence.
              </p>
            </div>
            <div className="relative z-10 pt-lg">
              <div className="flex flex-col gap-sm">
                <div className="flex items-center gap-sm text-body-sm font-body-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-primary text-sm">
                    check_circle
                  </span>
                  Real-time error tracking
                </div>
                <div className="flex items-center gap-sm text-body-sm font-body-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-primary text-sm">
                    check_circle
                  </span>
                  Shared stack trace insights
                </div>
                <div className="flex items-center gap-sm text-body-sm font-body-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-primary text-sm">
                    check_circle
                  </span>
                  Direct VCS integration
                </div>
              </div>
            </div>
            {/* Abstract Code Decoration */}
            <div className="absolute -bottom-12 -left-12 opacity-5 pointer-events-none rotate-12">
              <pre className="font-code-block text-code-block text-on-surface text-xs leading-relaxed">
{`function debug(engine) {
  const trace = engine.getStack();
  return trace.map(frame => {
    return pulse.analyze(frame);
  });
}`}
              </pre>
            </div>
          </section>
          {/* Registration Form Panel (Right/Main) */}
          <section className="bg-surface-container-lowest p-lg md:p-xl border-t md:border-t-0 md:border-l border-outline-variant">
            {/* Toggle Tab */}
            <div className="flex bg-surface-container-high p-1 rounded-lg mb-lg max-w-[280px] mx-auto md:mx-0">
              <Link
                href="/login"
                className="flex-1 py-sm text-label-caps font-label-caps text-on-surface-variant hover:text-on-surface transition-all text-center rounded-md"
              >
                SIGN IN
              </Link>
              <button className="flex-1 py-sm text-label-caps font-label-caps bg-surface-variant text-primary rounded-md shadow-sm">
                CREATE ACCOUNT
              </button>
            </div>
            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="space-y-md">
              {error && (
                <div className="p-3 rounded-lg bg-error-container/20 border border-error/30 text-error text-sm">
                  {error}
                </div>
              )}
              <div className="space-y-xs">
                <label className="text-label-caps font-label-caps text-on-surface-variant ml-1 block">
                  FULL NAME
                </label>
                <input
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-body-base font-body-base text-on-surface placeholder:text-outline input-focus-ring transition-all"
                  placeholder="Linus Torvalds"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-xs">
                <label className="text-label-caps font-label-caps text-on-surface-variant ml-1 block">
                  EMAIL ADDRESS
                </label>
                <input
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-body-base font-body-base text-on-surface placeholder:text-outline input-focus-ring transition-all"
                  placeholder="dev@pulse.io"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-xs">
                <label className="text-label-caps font-label-caps text-on-surface-variant ml-1 block">
                  PASSWORD
                </label>
                <div className="relative">
                  <input
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-body-base font-body-base text-on-surface placeholder:text-outline input-focus-ring transition-all pr-10"
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary flex items-center justify-center"
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    <span className="material-symbols-outlined text-lg">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>
              {/* Password Checklist */}
              <div className="grid grid-cols-2 gap-xs px-1 mt-2">
                <StrengthItem ok={strength.minLength} label="8+ Characters" />
                <StrengthItem ok={strength.hasSymbol} label="1+ Symbol" />
                <StrengthItem ok={strength.hasUppercase} label="1+ Uppercase" />
                <StrengthItem ok={strength.hasNumber} label="1+ Number" />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary-container text-on-primary-container font-bold py-sm rounded-lg hover:opacity-90 active:scale-95 transition-all mt-lg flex items-center justify-center gap-sm shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin-slow">
                      progress_activity
                    </span>
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <span className="material-symbols-outlined text-sm">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </form>
            {/* Divider */}
            <div className="flex items-center gap-md my-lg">
              <div className="flex-grow h-[1px] bg-outline-variant"></div>
              <span className="text-label-caps font-label-caps text-outline">
                OR CONTINUE WITH
              </span>
              <div className="flex-grow h-[1px] bg-outline-variant"></div>
            </div>
            {/* Social Auth */}
            <div className="grid grid-cols-2 gap-md">
              <a
                href={`${API_URL}/auth/google`}
                className="flex items-center justify-center gap-sm py-sm rounded-lg border border-outline-variant hover:bg-surface-variant transition-colors text-body-sm font-body-sm font-semibold text-on-surface"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.68 14.91 1 12 1 7.48 1 3.61 3.7 1.84 7.66l3.66 2.84C6.34 7.56 8.96 5 12 5z"
                    fill="#EA4335"
                  ></path>
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31l3.44 2.67c2.01-1.85 3.16-4.58 3.16-7.99z"
                    fill="#4285F4"
                  ></path>
                  <path
                    d="M5.5 14.5c-.25-.75-.4-1.55-.4-2.5s.15-1.75.4-2.5L1.84 6.66C1.15 8.19 0.75 9.94 0.75 12c0 2.06.4 3.81 1.09 5.34l3.66-2.84z"
                    fill="#FBBC05"
                  ></path>
                  <path
                    d="M12 23c2.91 0 5.34-1 7.12-2.72l-3.44-2.67c-1.01.68-2.31 1.09-3.68 1.09-3.04 0-5.66-2.56-6.5-5.5l-3.66 2.84C3.61 20.3 7.48 23 12 23z"
                    fill="#34A853"
                  ></path>
                </svg>
                Google
              </a>
              <a
                href={`${API_URL}/auth/github`}
                className="flex items-center justify-center gap-sm py-sm rounded-lg border border-outline-variant hover:bg-surface-variant transition-colors text-body-sm font-body-sm font-semibold text-on-surface"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path>
                </svg>
                GitHub
              </a>
            </div>
            {/* Form Footer */}
            <div className="mt-xl text-center space-y-md">
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-primary font-bold hover:underline decoration-1"
                >
                  Sign In
                </Link>
              </p>
              <p className="text-[10px] leading-relaxed text-outline max-w-[280px] mx-auto uppercase tracking-wider">
                By joining, you agree to our{" "}
                <a className="hover:text-on-surface" href="#">
                  Terms
                </a>{" "}
                and{" "}
                <a className="hover:text-on-surface" href="#">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </section>
        </div>
      </main>
      {/* Footer Content */}
      <footer className="w-full bg-background mt-auto">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-md py-lg max-w-container-max mx-auto gap-md border-t border-outline-variant">
          <div className="text-label-caps font-bold text-on-surface-variant">
            © 2026 DEVPULSE. FOR DEVELOPERS BY DEVELOPERS.
          </div>
          <nav className="flex gap-lg flex-wrap justify-center">
            <a
              className="text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
              href="#"
            >
              PRIVACY POLICY
            </a>
            <a
              className="text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
              href="#"
            >
              TERMS OF SERVICE
            </a>
            <a
              className="text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
              href="#"
            >
              SECURITY
            </a>
            <a
              className="text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
              href="#"
            >
              STATUS
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
