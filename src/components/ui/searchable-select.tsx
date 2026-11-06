"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type KeyboardEvent,
} from "react";

export type SearchableSelectOption = {
  label: string;
  value: string | number;
  sublabel?: string;
  disabled?: boolean;
};

export interface SearchableSelectProps {
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (value: string | number, option?: SearchableSelectOption) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  label?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  emptyMessage?: string;
}

export function SearchableSelect({
  name,
  value: controlledValue,
  defaultValue = "",
  onChange,
  options = [],
  placeholder = "Pilih opsi...",
  searchPlaceholder = "Cari opsi...",
  label,
  disabled = false,
  required = false,
  className = "",
  id,
  emptyMessage = "Tidak ada opsi yang sesuai.",
}: SearchableSelectProps) {
  // Controlled vs Uncontrolled state
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState<string | number>(
    defaultValue
  );
  const selectedValue = isControlled ? controlledValue : internalValue;

  // Open & Search state
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync internal state if controlledValue changes
  useEffect(() => {
    if (isControlled) {
      setInternalValue(controlledValue ?? "");
    }
  }, [isControlled, controlledValue]);

  // Screen size detection for Desktop (Popover) vs Mobile (Bottom Sheet)
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return options.find(
      (opt) => String(opt.value) === String(selectedValue)
    );
  }, [options, selectedValue]);

  // Filter options in real-time based on search query
  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return options;

    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(query);
      const matchSublabel = opt.sublabel
        ? opt.sublabel.toLowerCase().includes(query)
        : false;
      const matchValue = String(opt.value).toLowerCase().includes(query);
      return matchLabel || matchSublabel || matchValue;
    });
  }, [options, searchQuery]);

  // Handle opening and autofocusing input
  const handleOpen = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearchQuery("");
  }, [disabled]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
  }, []);

  // Autofocus search input upon opening
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Click outside listener for Desktop Popover
  useEffect(() => {
    if (!isOpen || isMobile) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        handleClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isMobile, handleClose]);

  // Prevent background scrolling when mobile bottom-sheet is open
  useEffect(() => {
    if (isOpen && isMobile) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, isMobile]);

  // Keyboard navigation (Escape to close)
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && isOpen) {
      e.stopPropagation();
      handleClose();
    }
  };

  // Select an option
  const handleSelectOption = (option: SearchableSelectOption) => {
    if (option.disabled) return;

    if (!isControlled) {
      setInternalValue(option.value);
    }
    onChange?.(option.value, option);
    handleClose();
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`relative w-full text-left ${className}`}
    >
      {label ? (
        <span className="mb-1.5 block text-xs font-semibold text-slate-700">
          {label}
        </span>
      ) : null}

      {/* Hidden input to ensure native form & Next.js Server Action compatibility */}
      {name ? (
        <input
          type="hidden"
          name={name}
          value={selectedValue ?? ""}
          required={required}
          disabled={disabled}
          id={id}
        />
      ) : null}

      {/* Trigger Button Styled Consistent with SMPT-v2 inputClass */}
      <button
        type="button"
        id={id ? `${id}-trigger` : undefined}
        onClick={() => (isOpen ? handleClose() : handleOpen())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-xs transition outline-none ${
          disabled
            ? "cursor-not-allowed bg-slate-100 text-slate-400 opacity-70"
            : "hover:border-slate-300 hover:bg-slate-50/50 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
        } ${isOpen ? "border-blue-600 ring-4 ring-blue-500/10" : ""}`}
      >
        <span
          className={`block truncate ${
            selectedOption ? "font-medium text-slate-800" : "text-slate-400"
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <span className="pointer-events-none ml-2 shrink-0 text-slate-400 transition-transform duration-200">
          <svg
            className={`h-4 w-4 transform transition-transform ${
              isOpen ? "rotate-180 text-blue-600" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </span>
      </button>

      {/* ==================================================================== */}
      {/* 1. DESKTOP POPOVER BEHAVIOR (Floating list below trigger)             */}
      {/* ==================================================================== */}
      {isOpen && !isMobile ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 w-full rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl ring-1 ring-slate-900/5 transition-all"
        >
          {/* Popover Search Field */}
          <div className="relative mb-2 px-1">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            ) : null}
          </div>

          {/* Desktop Options List */}
          <div className="max-h-60 overflow-y-auto space-y-0.5 pr-0.5 text-sm">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected =
                  String(opt.value) === String(selectedValue);
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelectOption(opt)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium transition ${
                      opt.disabled
                        ? "cursor-not-allowed text-slate-300 opacity-60"
                        : isSelected
                        ? "bg-blue-50/80 font-bold text-blue-700"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <div className="truncate">
                      <span className="block truncate">{opt.label}</span>
                      {opt.sublabel ? (
                        <span className="block text-[11px] font-normal text-slate-400">
                          {opt.sublabel}
                        </span>
                      ) : null}
                    </div>
                    {isSelected ? (
                      <span className="ml-2 shrink-0 text-blue-600 font-bold">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {/* ==================================================================== */}
      {/* 2. MOBILE BOTTOM SHEET / DRAWER BEHAVIOR                             */}
      {/* ==================================================================== */}
      {isOpen && isMobile ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Bottom Sheet Modal */}
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-50 flex max-h-[85vh] w-full flex-col rounded-t-3xl border-t border-slate-200/80 bg-white p-4 pb-6 shadow-2xl transition-transform animate-in slide-in-from-bottom duration-200"
          >
            {/* Grab Handle Pill */}
            <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-slate-300" />

            {/* Header: Title & Close Button */}
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-slate-900">
                {label || placeholder}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            {/* Search Input for Mobile */}
            <div className="relative mb-3 shrink-0">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              ) : null}
            </div>

            {/* Scrollable Options List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
              {filteredOptions.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  {emptyMessage}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected =
                    String(opt.value) === String(selectedValue);
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => handleSelectOption(opt)}
                      className={`flex min-h-11 w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-medium transition active:scale-[0.99] ${
                        opt.disabled
                          ? "cursor-not-allowed text-slate-300 opacity-60"
                          : isSelected
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "bg-slate-50/70 text-slate-800 hover:bg-slate-100"
                      }`}
                    >
                      <div className="truncate">
                        <span className="block truncate">{opt.label}</span>
                        {opt.sublabel ? (
                          <span
                            className={`block text-xs font-normal ${
                              isSelected ? "text-blue-100" : "text-slate-400"
                            }`}
                          >
                            {opt.sublabel}
                          </span>
                        ) : null}
                      </div>
                      {isSelected ? (
                        <span className="ml-2 shrink-0 font-bold text-white">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SearchableSelect;

