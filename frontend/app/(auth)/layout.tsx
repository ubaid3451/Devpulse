import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Sign In | DevPulse",
    template: "%s | DevPulse",
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
