import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import QueryProvider from "@/provider/query";
import AuthProvider from "@/provider/AuthProvider";
import ReduxProvider from "@/provider/provider"
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Let's study",
  description: "Created by Krishna Faujdar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">

      {/* ✅ Google Script */}
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />

      <body className={`${geistSans.variable} ${geistMono.variable}`}>

        <QueryProvider>

          <AuthProvider>
            <ReduxProvider>
              {children}
            </ReduxProvider>
          </AuthProvider>

        </QueryProvider>

      </body>
    </html>
  );
}
