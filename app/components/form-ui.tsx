"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";

export const inputCls = (error?: string) =>
  `w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition focus:ring-4 ${
    error
      ? "border-[#e5484d] focus:ring-[#fdecec]"
      : "border-[#d5e5ef] focus:border-[#0aa4e8] focus:ring-sky-100"
  }`;

/** +380 67 123 45 67 */
export function formatPhone(input: string) {
  let digits = input.replace(/\D/g, "");
  if (!digits.startsWith("380")) digits = `380${digits.replace(/^3?8?0?/, "")}`;
  digits = digits.slice(0, 12);
  const parts = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 8), digits.slice(8, 10), digits.slice(10, 12)];
  return `+${parts.filter(Boolean).join(" ")}${digits.length <= 3 ? " " : ""}`;
}

export const isPhoneComplete = (phone: string) => phone.replace(/\D/g, "").length === 12;

export function Field({
  id,
  label,
  optional,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={`field-${id}`} className="mb-1.5 block text-sm font-bold">
        {label}{" "}
        {optional && <span className="font-medium text-[#8aa5b5]">(необов&apos;язково)</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-semibold text-[#e5484d]">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-[#8aa5b5]">{hint}</p>
      )}
    </div>
  );
}

/** Поле пароля з кнопкою «показати» */
export function PasswordInput({
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${inputCls(error)} pr-12`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Сховати пароль" : "Показати пароль"}
        className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[#8aa5b5] transition hover:text-[#067eb7]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-[#fdecec] px-4 py-3 text-sm font-semibold text-[#c53035]">
      {children}
    </p>
  );
}

export function SubmitButton({
  pending,
  children,
  className = "",
}: {
  pending: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex w-full items-center justify-center gap-2 rounded-full bg-[#ffd51f] py-3.5 text-base font-extrabold shadow-[0_10px_26px_rgba(255,213,31,.35)] transition hover:bg-[#ffe044] disabled:cursor-wait disabled:opacity-70 ${className}`}
    >
      {pending && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#082c45] border-t-transparent" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
