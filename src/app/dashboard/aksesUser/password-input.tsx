"use client";

import { useState } from "react";

type Props = {
  name: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  required?: boolean;
  minLength?: number;
};

export function PasswordInput({
  name,
  placeholder,
  autoComplete = "new-password",
  className = "",
  required = false,
  minLength,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className={`${className} pr-12`}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-700"
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        title={visible ? "Sembunyikan password" : "Tampilkan password"}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.4A10.8 10.8 0 0112 4c5.2 0 8.5 4.3 9.4 5.7a4 4 0 010 4.6c-.5.8-1.6 2.3-3.2 3.5M6.2 6.2C4.4 7.4 3.2 9.1 2.6 10a4 4 0 000 4c.9 1.5 4.2 6 9.4 6 1 0 2-.2 2.9-.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.6 10a4 4 0 000 4c.9 1.5 4.2 6 9.4 6s8.5-4.5 9.4-6a4 4 0 000-4C20.5 8.5 17.2 4 12 4S3.5 8.5 2.6 10z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
