import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { AuthLoading } from "@/components/auth/auth-loading";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallback={<AuthLoading />} />
    </Suspense>
  );
}
