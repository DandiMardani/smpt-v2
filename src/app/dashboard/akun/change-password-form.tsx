"use client";

import { useRef, useState } from "react";
import { buttonClass, inputClass } from "@/components/final/final-ui";

function EyeButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-700 focus:outline-none"
      aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
      title={visible ? "Sembunyikan password" : "Tampilkan password"}
      tabIndex={-1}
    >
      {visible ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.4A10.8 10.8 0 0112 4c5.2 0 8.5 4.3 9.4 5.7a4 4 0 010 4.6c-.5.8-1.6 2.3-3.2 3.5M6.2 6.2C4.4 7.4 3.2 9.1 2.6 10a4 4 0 000 4c.9 1.5 4.2 6 9.4 6 1 0 2-.2 2.9-.5"
          />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.6 10a4 4 0 000 4c.9 1.5 4.2 6 9.4 6s8.5-4.5 9.4-6a4 4 0 000-4C20.5 8.5 17.2 4 12 4S3.5 8.5 2.6 10z"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

export function ChangePasswordForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirmRef = useRef<HTMLInputElement>(null);

  function handleConfirmChange(val: string) {
    setConfirmPassword(val);
    if (confirmRef.current) {
      if (val && newPassword && val !== newPassword) {
        confirmRef.current.setCustomValidity("Konfirmasi password tidak cocok dengan password baru.");
      } else {
        confirmRef.current.setCustomValidity("");
      }
    }
  }

  function handleNewPasswordChange(val: string) {
    setNewPassword(val);
    if (confirmRef.current && confirmPassword) {
      if (val !== confirmPassword) {
        confirmRef.current.setCustomValidity("Konfirmasi password tidak cocok dengan password baru.");
      } else {
        confirmRef.current.setCustomValidity("");
      }
    }
  }

  return (
    <form
      action={async (formData) => {
        setIsSubmitting(true);
        try {
          await action(formData);
        } finally {
          setIsSubmitting(false);
        }
      }}
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-700">
          Password Baru
        </label>
        <div className="relative">
          <input
            name="new_password"
            type={showNewPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => handleNewPasswordChange(e.target.value)}
            disabled={isSubmitting}
            className={`${inputClass} pr-12`}
            placeholder="Minimal 8 karakter"
          />
          <EyeButton
            visible={showNewPassword}
            onClick={() => setShowNewPassword((v) => !v)}
          />
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Gunakan kombinasi huruf & angka</p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-700">
          Konfirmasi Password
        </label>
        <div className="relative">
          <input
            ref={confirmRef}
            name="confirm_password"
            type={showConfirmPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => handleConfirmChange(e.target.value)}
            disabled={isSubmitting}
            className={`${inputClass} pr-12`}
            placeholder="Ulangi password baru"
          />
          <EyeButton
            visible={showConfirmPassword}
            onClick={() => setShowConfirmPassword((v) => !v)}
          />
        </div>
        {confirmPassword && newPassword && confirmPassword === newPassword ? (
          <p className="mt-1 text-[11px] font-medium text-emerald-600">✓ Password cocok</p>
        ) : null}
      </div>

      <div className="flex items-center md:col-span-2 pt-2 md:pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`${buttonClass} w-full md:w-auto min-w-[200px]`}
        >
          {isSubmitting ? "Menyimpan..." : "Simpan Password Baru"}
        </button>
      </div>
    </form>
  );
}
