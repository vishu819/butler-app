import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import ToastHost from "@/components/ui/Toast";

// Poppins everywhere — rounded-geometric sans matching the app's visual identity.
// Bound to both --font-inter (body) and --font-display (headings/numbers) so the
// whole app uses one family. Self-hosted — no network cost, no layout shift.
const poppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Butler — Your Engineering Mentor",
  description: "Your daily growth companion",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Butler" },
  icons: {
    icon: "/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#111112",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
