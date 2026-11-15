import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export const metadata: Metadata = { title: "Your workspace" };

export default async function AgencyPage() {
  // Check the resource itself, including direct and client-side navigation.
  await auth.protect();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5 sm:px-12">
        <Link href="/" className="text-2xl font-semibold tracking-tight">zenvo<span className="text-blue-700">.</span></Link>
        <UserButton />
      </header>
      <section className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
        <h1 className="text-4xl font-semibold tracking-tight">Welcome to your workspace.</h1>
        <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">
          You’re signed in to Zenvo. Open your profile menu to manage your account and security settings.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link href="/" className="rounded-md bg-slate-950 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">Back to home</Link>
          <SignOutButton redirectUrl="/">
            <button className="rounded-md px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">Sign out</button>
          </SignOutButton>
        </div>
      </section>
    </main>
  );
}
