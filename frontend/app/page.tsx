import Link from "next/link";

export default function RootPage() {
  return (
    <div className="min-h-screen dot-grid-bg relative overflow-hidden flex flex-col justify-center items-center">
      {/* Dynamic Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-sky-500/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[150px] mix-blend-screen pointer-events-none animate-float stagger-2" />

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center max-w-4xl px-6 text-center space-y-12">
        {/* Header section */}
        <div className="space-y-6 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel text-sm font-medium text-[var(--dp-primary-container)] mb-4 hover:bg-white/5 transition-colors cursor-default">
            <span className="material-symbols-outlined text-base">rocket_launch</span>
            Welcome to the future of developer networking
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tight text-white drop-shadow-2xl">
            Dev<span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-600">Pulse</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-[var(--dp-on-surface-variant)] max-w-2xl mx-auto leading-relaxed">
            The social platform built exclusively for developers. Share your journey, showcase projects, and connect with brilliant minds globally.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full animate-fade-in-up stagger-1">
          <div className="glass-panel rounded-2xl p-6 text-left hover:border-[var(--dp-primary-container)] transition-all duration-300 hover:transform hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center mb-4 group-hover:bg-sky-500/20 transition-colors">
              <span className="material-symbols-outlined text-sky-400">code</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Showcase Code</h3>
            <p className="text-[var(--dp-on-surface-variant)] text-sm">Share your best snippets and get feedback from top engineers.</p>
          </div>

          <div className="glass-panel rounded-2xl p-6 text-left hover:border-[var(--dp-primary-container)] transition-all duration-300 hover:transform hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
              <span className="material-symbols-outlined text-purple-400">hub</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Build Network</h3>
            <p className="text-[var(--dp-on-surface-variant)] text-sm">Connect with collaborators and expand your professional reach.</p>
          </div>

          <div className="glass-panel rounded-2xl p-6 text-left hover:border-[var(--dp-primary-container)] transition-all duration-300 hover:transform hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
              <span className="material-symbols-outlined text-amber-400">trending_up</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Level Up</h3>
            <p className="text-[var(--dp-on-surface-variant)] text-sm">Discover trending repositories and stay ahead of the curve.</p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-8 animate-fade-in-up stagger-2">
          <Link
            href="/register"
            className="px-8 py-4 rounded-xl bg-[var(--dp-primary-container)] text-[var(--dp-on-primary-container)] font-bold hover:bg-[var(--dp-primary-fixed-dim)] transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:shadow-[0_0_30px_rgba(56,189,248,0.5)] transform hover:-translate-y-0.5 flex items-center gap-2 justify-center"
          >
            Join the Community
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </Link>
          
          <Link
            href="/login"
            className="px-8 py-4 rounded-xl glass-panel text-white font-bold hover:bg-white/10 transition-all duration-300 transform hover:-translate-y-0.5 flex items-center justify-center"
          >
            Sign In
          </Link>
        </div>
      </main>
      
      {/* Footer text */}
      <div className="absolute bottom-6 w-full text-center text-sm text-[var(--dp-on-surface-variant)] opacity-60">
        © 2026 DevPulse. Designed for Engineers.
      </div>
    </div>
  );
}
