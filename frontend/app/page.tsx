import Link from "next/link";

export default function RootPage() {
  return (
    <div className="min-h-screen bg-background text-on-background relative overflow-hidden flex flex-col justify-center items-center">
      {/* Dynamic Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-primary-container/10 rounded-full blur-[150px] pointer-events-none animate-float stagger-2" />

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center max-w-4xl px-6 text-center space-y-12">
        {/* Header section */}
        <div className="space-y-6 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container border border-outline-variant text-sm font-medium text-primary mb-4 hover:bg-surface-variant transition-colors cursor-default">
            <span className="material-symbols-outlined text-base">rocket_launch</span>
            Welcome to the future of developer networking
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tight text-on-surface drop-shadow-sm">
            Dev<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-container">Pulse</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            The social platform built exclusively for developers. Share your journey, showcase projects, and connect with brilliant minds globally.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full animate-fade-in-up stagger-1">
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 text-left hover:border-primary transition-all duration-300 hover:transform hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-primary">code</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Showcase Code</h3>
            <p className="text-on-surface-variant text-sm">Share your best snippets and get feedback from top engineers.</p>
          </div>

          <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 text-left hover:border-primary transition-all duration-300 hover:transform hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
              <span className="material-symbols-outlined text-purple-400">hub</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Build Network</h3>
            <p className="text-on-surface-variant text-sm">Connect with collaborators and expand your professional reach.</p>
          </div>

          <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 text-left hover:border-primary transition-all duration-300 hover:transform hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
              <span className="material-symbols-outlined text-amber-400">trending_up</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Level Up</h3>
            <p className="text-on-surface-variant text-sm">Discover trending repositories and stay ahead of the curve.</p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-8 animate-fade-in-up stagger-2">
          <Link
            href="/register"
            className="px-8 py-4 rounded-xl bg-primary text-on-primary font-bold hover:brightness-110 transition-all duration-300 shadow-md transform hover:-translate-y-0.5 flex items-center gap-2 justify-center"
          >
            Join the Community
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </Link>
          
          <Link
            href="/login"
            className="px-8 py-4 rounded-xl bg-surface-container border border-outline-variant text-on-surface font-bold hover:bg-surface-variant transition-all duration-300 transform hover:-translate-y-0.5 flex items-center justify-center"
          >
            Sign In
          </Link>
        </div>
      </main>
      
      {/* Footer text */}
      <div className="absolute bottom-6 w-full text-center text-sm text-on-surface-variant opacity-70">
        © 2026 DevPulse. Designed for Engineers.
      </div>
    </div>
  );
}
