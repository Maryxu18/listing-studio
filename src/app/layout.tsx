import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
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
  title: "Listing Studio",
  description: "AI-generated, SEO-optimized product listings and photos for your shop.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/80 backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-lg bg-brand-500 text-sm text-white">LS</span>
              Listing Studio
            </Link>
            {session ? (
              <>
                <Link href="/new" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                  New listing
                </Link>
                <Link href="/products" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                  My products
                </Link>
                <div className="ml-auto flex items-center gap-3 text-sm text-stone-500">
                  <span>@{session.username}</span>
                  <LogoutButton />
                </div>
              </>
            ) : (
              <div className="ml-auto flex items-center gap-2">
                <Link href="/login" className="btn-secondary">
                  Log in
                </Link>
                <Link href="/signup" className="btn-primary">
                  Sign up
                </Link>
              </div>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
