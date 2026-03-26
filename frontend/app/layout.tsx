import "@fontsource/playfair-display/700.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arc — Agent of Agents",
  description:
    "Orb-native runtime interface for Arc's long-running deep agent workflows.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}
