"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignup = mode === "signup";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Something went wrong.");
      setPending(false);
      return;
    }
    const next = params.get("next");
    router.push(next?.startsWith("/") ? next : "/new");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card p-8">
        <h1 className="text-2xl font-bold tracking-tight">{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {isSignup ? "Start generating listings in under a minute." : "Log in to your Listing Studio account."}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Username</span>
            <input name="username" className="input" autoComplete="username" required minLength={3} maxLength={32} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              className="input"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? 8 : undefined}
            />
            {isSignup && <span className="mt-1 block text-xs text-stone-500">At least 8 characters.</span>}
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" disabled={pending}>
            {pending ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
          </button>
        </form>
      </div>
      <p className="mt-4 text-center text-sm text-stone-600">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-brand-600 hover:underline">
          {isSignup ? "Log in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
