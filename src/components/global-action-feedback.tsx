"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function GlobalActionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const barRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoDismissRef = useRef<NodeJS.Timeout | null>(null);

  const resetActiveButtons = useCallback(() => {
    const loadingButtons = document.querySelectorAll<HTMLButtonElement>("button[data-smpt-loading='true']");
    loadingButtons.forEach((btn) => {
      btn.removeAttribute("data-smpt-loading");
      btn.disabled = false;
      const originalHtml = btn.getAttribute("data-original-html");
      if (originalHtml) {
        btn.innerHTML = originalHtml;
        btn.removeAttribute("data-original-html");
      }
    });
  }, []);

  const stopLoading = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);

    if (!barRef.current) return;
    const bar = barRef.current;

    // Tuntaskan ke 100% lalu fade out
    bar.style.transition = "width 200ms ease-out, opacity 250ms ease";
    bar.style.width = "100%";

    timerRef.current = setTimeout(() => {
      bar.style.opacity = "0";
      timerRef.current = setTimeout(() => {
        bar.style.width = "0%";
      }, 300);
    }, 200);

    resetActiveButtons();
  }, [resetActiveButtons]);

  const startLoading = useCallback(() => {
    if (!barRef.current) return;
    const bar = barRef.current;

    if (timerRef.current) clearTimeout(timerRef.current);
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);

    bar.style.opacity = "1";
    bar.style.width = "25%";
    bar.style.transition = "width 350ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease";

    timerRef.current = setTimeout(() => {
      bar.style.width = "70%";
      timerRef.current = setTimeout(() => {
        bar.style.width = "85%";
      }, 400);
    }, 350);

    // Safety auto-dismiss: Jika dalam 3 detik tidak berpindah rute, otomatis tutup agar tidak macet
    autoDismissRef.current = setTimeout(() => {
      stopLoading();
    }, 3000);
  }, [stopLoading]);

  // Hentikan loading saat rute atau query URL berubah
  useEffect(() => {
    stopLoading();
  }, [pathname, searchParams, stopLoading]);

  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const link = target?.closest("a");
      if (!link || !link.href) return;

      const url = new URL(link.href, window.location.origin);
      const isInternal = url.origin === window.location.origin;
      const isSamePage = url.pathname === window.location.pathname && url.search === window.location.search;
      const isBlank = link.target === "_blank" || e.ctrlKey || e.metaKey || e.shiftKey;

      if (isInternal && !isSamePage && !isBlank && !link.hasAttribute("download")) {
        startLoading();
      }
    };

    const handleFormSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (!form) return;

      const submitter = (e.submitter as HTMLButtonElement | null) || form.querySelector<HTMLButtonElement>("button[type='submit']");
      if (submitter && !submitter.hasAttribute("data-no-loading")) {
        submitter.setAttribute("data-smpt-loading", "true");
        submitter.setAttribute("data-original-html", submitter.innerHTML);
        
        const originalText = submitter.innerText.trim();
        const actionLabel = originalText ? (originalText.length > 20 ? "Memproses..." : `${originalText}...`) : "Memproses...";
        
        submitter.innerHTML = `
          <span class="inline-flex items-center gap-2">
            <svg class="h-3.5 w-3.5 animate-spin text-current shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span>${actionLabel}</span>
          </span>
        `;
        submitter.disabled = true;
      }

      startLoading();
    };

    const handlePageShow = () => {
      stopLoading();
    };

    document.addEventListener("click", handleLinkClick, { passive: true });
    document.addEventListener("submit", handleFormSubmit, { capture: true });
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("click", handleLinkClick);
      document.removeEventListener("submit", handleFormSubmit, { capture: true });
      window.removeEventListener("pageshow", handlePageShow);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [startLoading, stopLoading]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 right-0 z-[99999] h-[2.5px] bg-transparent"
    >
      <div
        ref={barRef}
        className="h-full w-0 bg-gradient-to-r from-blue-600 via-indigo-500 to-sky-400 opacity-0 shadow-[0_0_10px_rgba(59,130,246,0.7)]"
      />
    </div>
  );
}
