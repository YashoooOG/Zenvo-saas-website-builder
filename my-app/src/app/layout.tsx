import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Zenvo",
    template: "%s | Zenvo",
  },
  description:
    "Build websites, manage client projects, and grow your agency with Zenvo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/agency"
          signUpFallbackRedirectUrl="/agency"
          afterSignOutUrl="/"
          appearance={{ variables: { colorPrimary: "#1e40af", borderRadius: "0.5rem" } }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
