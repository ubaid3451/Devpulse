"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError, BASE_URL } from "@/lib/api";

const API_URL = BASE_URL;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAdminMode, setIsAdminMode] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const user = await login(email, password);
      if (isAdminMode) {
        if (user?.role !== "admin") {
          setError("This account does not have admin privileges.");
          setIsLoading(false);
          return;
        }
        router.push("/admin");
      } else {
        if (user?.role === "admin") {
          router.push("/admin");
        } else {
          router.push("/feed");
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403 && err.detail?.includes("not verified")) {
          router.push(`/verify-otp?email=${encodeURIComponent(email)}`);
          return;
        }
        setError(err.detail || err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex flex-col md:flex-row w-full min-h-screen bg-background overflow-hidden">
      {/* Left Side: Brand & Visuals */}
      <section className="hidden md:flex relative w-1/2 bg-surface-container-lowest items-center justify-center border-r border-outline-variant">
        {/* Background Decoration */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div
            className="absolute top-0 left-0 w-full h-full dot-grid-bg"
          ></div>
        </div>
        {/* Hero Image Content */}
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-xl text-center">
          <div className="mb-lg">
            <div className="text-primary-container mb-md">
              <span
                className="material-symbols-outlined text-[64px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                terminal
              </span>
            </div>
            <h1 className="text-display-lg font-display-lg text-on-surface mb-sm tracking-tight">
              DevPulse <span className="text-primary">Engine</span>
            </h1>
            <p className="text-body-base font-body-base text-on-surface-variant max-w-md mx-auto">
              Accelerating the developer workflow with integrated bug tracking and
              real-time social debugging.
            </p>
          </div>
          {/* Abstract Visual Card */}
          <div className="w-full max-w-lg aspect-video rounded-xl overflow-hidden glass-effect relative">
            <div
              className="w-full h-full bg-cover bg-center opacity-80"
              style={{
                backgroundImage:
                  "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCKKgPJPthHvWBhM0lGf50PpPYhNcJojEnAqgoYVpAZPNhkD7XibuTGgfXB_hmAUokvoLf0VZnanSydGUeJbXYiqNiybrXeglT8BPiPf4Jj8SVYdKKbwuko3M7046e5--yF4rb4GlQrxH70sZxLoc1j6vuHdaLTYR17JtxbITeVIp6TKg47F_sYniCwLWOt_oeRRndvCul34O5oo6YMEH3UroEotpgfJ1_cc2NsBky7Tbzc-bnDlmu8r6MdObTlVSooa1MA22g3ApE')",
              }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest to-transparent opacity-60"></div>
            {/* Floating Code Snippet Overlay */}
            <div className="absolute bottom-md left-md right-md text-left bg-surface-container-highest/80 p-md rounded-lg border border-outline-variant backdrop-blur-sm">
              <div className="flex gap-xs mb-xs">
                <div className="w-2 h-2 rounded-full bg-error"></div>
                <div className="w-2 h-2 rounded-full bg-tertiary"></div>
                <div className="w-2 h-2 rounded-full bg-primary"></div>
              </div>
              <code className="font-code-block text-code-block text-primary">
                <span className="text-tertiary">import</span> {"{ pulse } "}
                <span className="text-tertiary">from</span>{" "}
                <span className="text-primary-fixed-dim">&apos;@devpulse/core&apos;</span>
                ;<br />
                pulse.<span className="text-on-primary-container">monitor</span>(
                <span className="text-secondary-fixed">&quot;bug-report-v2&quot;</span>);
              </code>
            </div>
          </div>
        </div>
      </section>

      {/* Right Side: Auth Form */}
      <section className="flex-1 flex flex-col items-center justify-center px-lg py-xl bg-surface relative">
        {/* Mobile Logo */}
        <div className="md:hidden mb-lg flex items-center gap-sm">
          <span
            className="material-symbols-outlined text-primary text-[32px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            terminal
          </span>
          <span className="text-headline-md font-bold text-on-surface">
            DevPulse
          </span>
        </div>
        <div className="w-full max-w-[400px] space-y-lg">
          <header className="text-center md:text-left">
            <h2 className="text-headline-md font-headline-md text-on-surface">
              Welcome back
            </h2>
            <p className="text-body-sm font-body-sm text-on-surface-variant mt-xs">
              Enter your credentials to access your dashboard
            </p>
          </header>

          {/* Auth Toggle Tabs */}
          <div className="flex p-xs bg-surface-container-low rounded-lg border border-outline-variant">
            <button className="flex-1 py-sm text-label-caps font-label-caps rounded-md transition-all duration-200 bg-primary-container text-on-primary-container shadow-sm cursor-default">
              SIGN IN
            </button>
            <Link
              href="/register"
              className="flex-1 py-sm text-label-caps font-label-caps rounded-md transition-all duration-200 text-on-surface-variant hover:text-on-surface text-center"
            >
              CREATE ACCOUNT
            </Link>
          </div>

          {/* Form Section */}
          <form onSubmit={handleSubmit} className="space-y-md">
            {error && (
              <div className="p-3 rounded-lg bg-error-container/20 border border-error/30 text-error text-sm">
                {error}
              </div>
            )}
            <div className="space-y-xs">
              <label className="text-label-caps font-label-caps text-on-surface-variant ml-xs block">
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
            <div className="space-y-xs">
              <div className="flex justify-between items-center px-xs">
                <label className="text-label-caps font-label-caps text-on-surface-variant">
                  PASSWORD
                </label>
                <Link
                  href="/forgot-password"
                  className="text-body-sm font-body-sm text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-body-base font-body-base text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary-container text-on-primary-container py-sm rounded-lg font-headline-md text-[16px] hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined animate-spin-slow">
                    progress_activity
                  </span>
                  Signing in...
                </>
              ) : (
                <>
                  Continue
                  <span className="material-symbols-outlined text-[18px]">
                    arrow_forward
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative py-sm flex items-center">
            <div className="flex-grow border-t border-outline-variant"></div>
            <span className="flex-shrink mx-md text-label-caps font-label-caps text-outline">
              OR CONTINUE WITH
            </span>
            <div className="flex-grow border-t border-outline-variant"></div>
          </div>

          {/* Social Logins */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <a
              href={`${API_URL}/auth/google`}
              className="flex items-center justify-center gap-sm bg-surface-container-low border border-outline-variant py-sm rounded-lg text-body-base font-body-base text-on-surface hover:bg-surface-container-high transition-colors"
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
              className="flex items-center justify-center gap-sm bg-surface-container-low border border-outline-variant py-sm rounded-lg text-body-base font-body-base text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"></path>
              </svg>
              GitHub
            </a>
          </div>

          {/* Footer Text */}
          <p className="text-center text-body-sm font-body-sm text-outline pt-md">
            By continuing, you agree to DevPulse&apos;s <br />
            <a href="#" className="text-on-surface hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="text-on-surface hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        {/* Footer for Social/Links */}
        <footer className="absolute bottom-0 w-full p-md text-center md:text-left">
          <div className="flex flex-wrap justify-center md:justify-start gap-md border-t border-outline-variant/30 pt-md max-w-[400px] mx-auto md:mx-0">
            <span className="text-label-caps font-label-caps text-outline">
              © 2026 DevPulse
            </span>
            <a
              href="#"
              className="text-label-caps font-label-caps text-outline hover:text-primary transition-colors"
            >
              STATUS
            </a>
            <a
              href="#"
              className="text-label-caps font-label-caps text-outline hover:text-primary transition-colors"
            >
              SECURITY
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
}
