"use client";

import { useRef, useState } from "react";

type Props = {
  passwordName: string;
  confirmationName: string;
  passwordLabel: string;
  confirmationLabel?: string;
  className?: string;
  minLength?: number;
};

function EyeButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
  );
}

export function PasswordPair({
  passwordName,
  confirmationName,
  passwordLabel,
  confirmationLabel = "Konfirmasi Password",
  className = "",
  minLength = 8,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);

  function validateMatch() {
    const password = passwordRef.current?.value ?? "";
    const confirmation = confirmationRef.current?.value ?? "";
    const input = confirmationRef.current;
    if (!input) return;
    input.setCustomValidity(confirmation && password !== confirmation ? "Konfirmasi password tidak sama." : "");
  }

  return (
    <>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-200">{passwordLabel}</label>
        <div className="relative">
          <input
            ref={passwordRef}
            name={passwordName}
            type={showPassword ? "text" : "password"}
            required
            minLength={minLength}
            autoComplete="new-password"
            className={`${className} pr-12`}
            placeholder={`Minimal ${minLength} karakter`}
            onInput={validateMatch}
          />
          <EyeButton visible={showPassword} onClick={() => setShowPassword((value) => !value)} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-200">{confirmationLabel}</label>
        <div className="relative">
          <input
            ref={confirmationRef}
            name={confirmationName}
            type={showConfirmation ? "text" : "password"}
            required
            minLength={minLength}
            autoComplete="new-password"
            className={`${className} pr-12`}
            placeholder="Ulangi password"
            onInput={validateMatch}
          />
          <EyeButton visible={showConfirmation} onClick={() => setShowConfirmation((value) => !value)} />
        </div>
      </div>
    </>
  );
}
