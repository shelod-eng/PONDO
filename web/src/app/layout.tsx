import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PONDO Demo Portal",
  description: "Unified checkout + sponsor portal demo (PONDO-TRD-001)",
  metadataBase: new URL("https://www.pondo-pay.online"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
