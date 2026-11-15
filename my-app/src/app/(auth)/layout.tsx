import Link from "next/link";
import { ThemeSelect } from "@/components/theme-select";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <section className="flex flex-col justify-between gap-12 bg-slate-950 px-6 py-8 text-white sm:px-12 lg:p-16">
        <Link href="/" className="w-fit text-2xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          zenvo<span className="text-blue-400">.</span>
        </Link>
        <div className="max-w-md py-4 lg:py-20">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            A place for your<br className="hidden sm:block" /> agency to grow.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-slate-300">
            Your work begins with a secure account. Make yourself at home.
          </p>
        </div>
        <p className="hidden text-sm text-slate-400 lg:block">Your agency. Your clients. Zenvo.</p>
      </section>
      <section aria-label="Account access" className="flex min-w-0 flex-col items-center justify-center gap-8 px-4 py-12 sm:px-8">
        <ThemeSelect />{children}
      </section>
    </main>
  );
}
