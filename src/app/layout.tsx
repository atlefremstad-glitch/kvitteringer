import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ReceiptMe",
  description: "Skann og hold oversikt over kvitteringer",
  appleWebApp: { capable: true, title: "ReceiptMe", statusBarStyle: "default" },
  // ?v=2 tvinger nettlesere og telefoner til å hente ikonene på nytt
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "16x16 32x32 48x48" },
      { url: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=2",
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#056b5a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nb" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
