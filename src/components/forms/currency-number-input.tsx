"use client";

import { useEffect, useRef, useState } from "react";

export function formatThousandNumber(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "";
  const str = String(val).trim();
  let digitsOnly = str.replace(/\D/g, "");
  if (!digitsOnly) return "";
  // Strip redundant leading zeroes, e.g. "05" -> "5", "00" -> "0"
  digitsOnly = digitsOnly.replace(/^0+(?=[1-9])/, "").replace(/^0+$/, "0");
  return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parseThousandNumber(val: string): number {
  const digitsOnly = String(val).replace(/\D/g, "");
  return digitsOnly ? parseInt(digitsOnly, 10) : 0;
}

export type CurrencyNumberInputProps = {
  name: string;
  defaultValue?: number | string;
  value?: number | string;
  onChange?: (numericValue: number, formattedValue: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  min?: number;
  max?: number;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  allowEmptyOnBlur?: boolean;
};

export function CurrencyNumberInput({
  name,
  defaultValue = 0,
  value: controlledValue,
  onChange,
  placeholder = "0",
  className = "",
  required = false,
  min = 0,
  id,
  autoFocus,
  disabled,
  readOnly,
  allowEmptyOnBlur = false,
}: CurrencyNumberInputProps) {
  const isControlled = controlledValue !== undefined;

  const getInitial = () => {
    const val = controlledValue !== undefined ? controlledValue : defaultValue;
    if (val === "" || val === undefined || val === null) return { num: 0, str: "" };
    const num = typeof val === "number" ? val : parseThousandNumber(String(val));
    return {
      num,
      str: num === 0 ? "0" : formatThousandNumber(num),
    };
  };

  const initial = getInitial();
  const [displayValue, setDisplayValue] = useState<string>(initial.str);
  const [numericValue, setNumericValue] = useState<number>(initial.num);
  const isFocusedRef = useRef(false);

  // Sync if controlledValue changes from outside while not actively typing
  useEffect(() => {
    if (isControlled && !isFocusedRef.current) {
      const num = typeof controlledValue === "number" 
        ? controlledValue 
        : parseThousandNumber(String(controlledValue));
      setNumericValue(num);
      setDisplayValue(num === 0 ? "0" : formatThousandNumber(num));
    }
  }, [controlledValue, isControlled]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;

    // If completely cleared
    if (!raw.trim()) {
      setDisplayValue("");
      setNumericValue(0);
      onChange?.(0, "");
      return;
    }

    // Keep only digits
    let digitsOnly = raw.replace(/\D/g, "");
    if (!digitsOnly) {
      setDisplayValue("");
      setNumericValue(0);
      onChange?.(0, "");
      return;
    }

    digitsOnly = digitsOnly.replace(/^0+(?=[1-9])/, "").replace(/^0+$/, "0");
    const num = parseInt(digitsOnly, 10);
    const formatted = formatThousandNumber(digitsOnly);

    setDisplayValue(formatted);
    setNumericValue(num);
    onChange?.(num, formatted);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    isFocusedRef.current = true;
    // Auto-clear if currently 0 so user can type immediately
    if (displayValue === "0" || numericValue === 0) {
      setDisplayValue("");
    } else {
      e.target.select();
    }
  }

  function handleBlur() {
    isFocusedRef.current = false;
    if (!displayValue.trim()) {
      if (!allowEmptyOnBlur) {
        const fallback = min !== undefined && min > 0 ? min : 0;
        const fallbackStr = fallback === 0 ? "0" : formatThousandNumber(fallback);
        setDisplayValue(fallbackStr);
        setNumericValue(fallback);
        onChange?.(fallback, fallbackStr);
      }
    }
  }

  return (
    <div className="relative w-full">
      {/* Hidden input holds clean raw integer for form submission */}
      <input type="hidden" name={name} value={numericValue} />

      {/* Formatted visible input with numeric keypad support */}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9.]*"
        id={id}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={readOnly}
        className={className}
        autoComplete="off"
      />
    </div>
  );
}
