import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { AuthLoading } from "@/components/auth/auth-loading";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallback={<AuthLoading />} />
    </Suspense>
  );
}
