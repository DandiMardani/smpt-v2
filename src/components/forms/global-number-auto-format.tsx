"use client";

import { useEffect } from "react";

export function GlobalNumberAutoFormat() {
  useEffect(() => {
    function isNumericInput(el: HTMLElement | null): el is HTMLInputElement {
      if (!(el instanceof HTMLInputElement)) return false;
      const type = el.type?.toLowerCase();
      const inputMode = el.inputMode?.toLowerCase();
      const name = el.name?.toLowerCase() || "";
      const isNumberType = type === "number" || inputMode === "numeric" || inputMode === "decimal";
      const isNumericName =
        name.includes("price") ||
        name.includes("amount") ||
        name.includes("qty") ||
        name.includes("target") ||
        name.includes("contract") ||
        name.includes("cost") ||
        name.includes("wage") ||
        name.includes("rate");

      return isNumberType || isNumericName || el.dataset.formatNumber === "true";
    }

    // 1. FOCUSIN: Auto-clear "0" or select all
    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (!isNumericInput(target)) return;

      // Ensure step="any" on any type="number" so browser never triggers stepMismatch
      if (target.type === "number" && target.getAttribute("step") && target.getAttribute("step") !== "any") {
        target.setAttribute("step", "any");
      }

      if (target.value === "0" || target.value === "0,00" || target.value === "Rp 0") {
        target.value = "";
      } else if (target.value) {
        // Select all text so typing immediately replaces it
        setTimeout(() => {
          try {
            target.select();
          } catch {
            // Ignore if select not supported
          }
        }, 10);
      }
    }

    // 2. INPUT: For text inputs with numeric mode or data-currency, format thousands in real-time
    function handleInput(e: Event) {
      const target = e.target as HTMLElement | null;
      if (!isNumericInput(target)) return;

      // If it's a text input marked for auto-formatting
      if (
        target.type === "text" &&
        (target.dataset.formatNumber === "true" ||
          target.name.includes("price") ||
          target.name.includes("amount") ||
          target.name.includes("cost") ||
          target.name.includes("wage") ||
          target.name.includes("contract_value"))
      ) {
        const raw = target.value;
        let clean = raw.replace(/\D/g, "");
        if (!clean) {
          target.value = "";
          return;
        }
        clean = clean.replace(/^0+(?=[1-9])/, "").replace(/^0+$/, "0");
        const formatted = clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        target.value = formatted;
      }
    }

    // 3. SUBMIT: Strip dots from formatted text inputs so server action receives clean digits
    function handleSubmit(e: SubmitEvent) {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;

      Array.from(form.elements).forEach((element) => {
        if (element instanceof HTMLInputElement && element.type === "text" && isNumericInput(element)) {
          // If input has formatted dots, clean before sending unless there's a hidden input
          const hiddenTwin = form.querySelector(`input[type="hidden"][name="${element.name}"]`);
          if (!hiddenTwin && element.value && /^\d{1,3}(\.\d{3})+$/.test(element.value)) {
            element.value = element.value.replace(/\./g, "");
          }
        }
      });
    }

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("submit", handleSubmit, true);

    return () => {
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  return null;
}
