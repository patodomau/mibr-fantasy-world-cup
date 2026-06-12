import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiBR Fantasy World Cup",
  description: "MiBR guild fantasy game for the 2026 World Cup.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
