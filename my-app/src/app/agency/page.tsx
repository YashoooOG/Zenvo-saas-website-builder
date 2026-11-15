import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { ThemeSelect } from "@/components/theme-select";
import { Brand } from "@/components/brand";

export const metadata: Metadata = { title: "Your workspace" };

export default async function AgencyPage() {
  // Check the resource itself, including direct and client-side navigation.
  await auth.protect();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b bg-card px-6 py-5 sm:px-12">
        <Brand />
        <div className="account-theme"><ThemeSelect /><UserButton /></div>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
        <h1 className="text-4xl font-semibold tracking-tight">Welcome to your workspace.</h1>
        <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">
          You’re signed in to Zenvo. Open your profile menu to manage your account and security settings.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link href="/" className="action">Back to home</Link>
          <SignOutButton redirectUrl="/">
            <button className="rounded-md px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted">Sign out</button>
          </SignOutButton>
        </div>
      </section>
    </main>
  );
}
