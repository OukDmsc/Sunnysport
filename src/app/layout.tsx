import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/lib/language";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUNNY SPORT CLUB | Football field booking",
  description: "Manage football field bookings, payments, and customers in Cambodia.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/sunny-sport-club.jpg", apple: "/sunny-sport-club-180.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SUNNY SPORT CLUB" },
};

export const viewport: Viewport = {
  themeColor: "#0a3d2b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><LanguageProvider>{children}<PwaRegister /></LanguageProvider></body>
    </html>
  );
}
