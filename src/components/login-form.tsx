"use client";

import { useId, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { parseCredentialsFormData } from "@/lib/auth/schema";
import { flattenFieldErrors, FORM_CHECK_MESSAGE } from "@/lib/form";

export function LoginForm() {
  const router = useRouter();
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  function errorId(name: string) {
    return `${formId}-${name}-error`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = parseCredentialsFormData(new FormData(event.currentTarget));
    if (!parsed.success) {
      setFieldErrors(flattenFieldErrors(parsed.error));
      setError(FORM_CHECK_MESSAGE);
      return;
    }

    setPending(true);
    try {
      const result = await signIn("credentials", {
        email: parsed.data.email.trim().toLowerCase(),
        password: parsed.data.password,
        redirect: false,
      });

      if (!result || result.error) {
        setError("Invalid email or password.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not sign in. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormAlert>{error ?? undefined}</FormAlert>

      <div>
        <label
          htmlFor={`${formId}-email`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Email
        </label>
        <input
          id={`${formId}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? errorId("email") : undefined}
          className={controlClassName("w-full")}
        />
        <FieldError id={errorId("email")} messages={fieldErrors.email} />
      </div>

      <div>
        <label
          htmlFor={`${formId}-password`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Password
        </label>
        <input
          id={`${formId}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={
            fieldErrors.password ? errorId("password") : undefined
          }
          className={controlClassName("w-full")}
        />
        <FieldError id={errorId("password")} messages={fieldErrors.password} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
