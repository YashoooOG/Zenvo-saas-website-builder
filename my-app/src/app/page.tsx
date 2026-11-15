import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 sm:px-12">
        <Link href="/" className="text-2xl font-semibold tracking-tight">zenvo<span className="text-blue-700">.</span></Link>
        <nav aria-label="Account" className="flex items-center gap-6 text-sm font-medium">
          <Link href="/sign-in" className="rounded-sm hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">Sign in</Link>
          <Link href="/sign-up" className="rounded-md bg-slate-950 px-4 py-2.5 text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">Create account</Link>
        </nav>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-24 sm:px-12">
        <h1 className="max-w-2xl text-5xl leading-[1.1] font-semibold tracking-tight sm:text-7xl">Your next chapter<br />starts with Zenvo.</h1>
        <p className="mt-7 max-w-lg text-lg leading-8 text-slate-600">A workspace for your agency. Create an account or sign in to pick up where you left off.</p>
        <Link href="/agency" prefetch={false} className="mt-10 w-fit rounded-md bg-blue-800 px-6 py-3.5 text-sm font-medium text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">Open your workspace <span aria-hidden="true">→</span></Link>
      </section>
      <footer className="px-6 py-6 text-sm text-slate-500 sm:px-12">Zenvo — built around your agency.</footer>
    </main>
  );
}
