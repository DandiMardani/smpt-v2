"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function GlobalActionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const barRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Stop loading bar on route change
  useEffect(() => {
    stopLoading();
    resetActiveButtons();
  }, [pathname, searchParams]);

  const startLoading = () => {
    if (!barRef.current) return;
    const bar = barRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);

    bar.style.opacity = "1";
    bar.style.width = "25%";
    bar.style.transition = "width 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease";

    timerRef.current = setTimeout(() => {
      bar.style.width = "75%";
      timerRef.current = setTimeout(() => {
        bar.style.width = "90%";
      }, 500);
    }, 300);
  };

  const stopLoading = () => {
    if (!barRef.current) return;
    const bar = barRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);

    bar.style.width = "100%";
    bar.style.transition = "width 150ms ease, opacity 250ms ease";

    timerRef.current = setTimeout(() => {
      bar.style.opacity = "0";
      setTimeout(() => {
        bar.style.width = "0%";
      }, 250);
    }, 150);
  };

  const resetActiveButtons = () => {
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
  };

  useEffect(() => {
    // 1. Intercept Link clicks
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

    // 2. Intercept Form submissions
    const handleFormSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (!form) return;

      // Find the submit button
      const submitter = (e.submitter as HTMLButtonElement | null) || form.querySelector<HTMLButtonElement>("button[type='submit']");
      if (submitter && !submitter.hasAttribute("data-no-loading")) {
        // Save original HTML
        submitter.setAttribute("data-smpt-loading", "true");
        submitter.setAttribute("data-original-html", submitter.innerHTML);
        
        // Show instant visual response on the button
        const originalText = submitter.innerText.trim();
        const actionLabel = originalText ? (originalText.length > 20 ? "Memproses..." : `${originalText}...`) : "Memproses...";
        
        submitter.innerHTML = `
          <span class="inline-flex items-center gap-2">
            <svg class="h-4 w-4 animate-spin text-current shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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

    // 3. Reset if page is restored from cache (bfcache)
    const handlePageShow = () => {
      stopLoading();
      resetActiveButtons();
    };

    document.addEventListener("click", handleLinkClick, { passive: true });
    document.addEventListener("submit", handleFormSubmit, { capture: true });
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("click", handleLinkClick);
      document.removeEventListener("submit", handleFormSubmit, { capture: true });
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 right-0 z-[99999] h-[3px] bg-transparent"
    >
      <div
        ref={barRef}
        className="h-full w-0 bg-gradient-to-r from-blue-600 via-indigo-500 to-sky-400 opacity-0 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
      />
    </div>
  );
}
