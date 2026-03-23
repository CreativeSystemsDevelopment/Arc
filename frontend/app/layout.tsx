import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arc — Deep Agent",
  description: "Archenemies Deep Agent for complex, long-running, and open-ended tasks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}
