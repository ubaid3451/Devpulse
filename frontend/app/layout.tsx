import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
// @ts-ignore: allow global CSS side-effect import in app layout
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ChatSocketProvider } from "@/lib/chat-socket-context";
import { E2EEProvider } from "@/lib/e2ee-context";

import { ThemeProvider } from "@/lib/theme-context";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DevPulse — Community Debugging for Developers",
    template: "%s | DevPulse",
  },
  description:
    "DevPulse is the social platform for developers to share, debug, and learn together. Post bugs, get AI-suggested fixes, and collaborate in real-time.",
  keywords: ["developer", "debugging", "community", "bug tracking", "social"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const saved = localStorage.getItem('devpulse_theme') || 'dark';
                document.documentElement.setAttribute('data-theme', saved);
                if (saved === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                } else {
                  document.documentElement.classList.remove('light');
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-background font-body-base antialiased min-h-screen flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <E2EEProvider>
              <ChatSocketProvider>{children}</ChatSocketProvider>
            </E2EEProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}