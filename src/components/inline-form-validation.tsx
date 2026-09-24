"use client";

import { useEffect } from "react";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isFormControl(value: EventTarget | null): value is FormControl {
  return (
    value instanceof HTMLInputElement ||
    value instanceof HTMLSelectElement ||
    value instanceof HTMLTextAreaElement
  );
}

function fieldLabel(control: FormControl): string {
  const explicit = control.dataset.fieldLabel?.trim();
  if (explicit) return explicit;

  const label = control.closest("label");
  const labelText = label?.querySelector("span")?.textContent?.trim();
  if (labelText) return labelText.replace(/\s*\(opsional\)\s*/i, "");

  return control.name?.replaceAll("_", " ") || "Field ini";
}

function clearConditionalValidity(control: FormControl) {
  if (control.dataset.smptConditionalInvalid === "true") {
    control.setCustomValidity("");
    delete control.dataset.smptConditionalInvalid;
  }
}

function applyConditionalValidity(control: FormControl) {
  clearConditionalValidity(control);

  const dependencyName = control.dataset.requiredIfPositive;
  if (!dependencyName || !control.form) return;

  const dependency = Array.from(control.form.elements).find(
    (element) =>
      isFormControl(element) && element.name === dependencyName,
  );
  if (!dependency || !isFormControl(dependency)) return;

  const dependencyValue = Number(dependency.value);
  const mustBeFilled = Number.isFinite(dependencyValue) && dependencyValue > 0;
  if (mustBeFilled && control.value.trim() === "") {
    const message =
      control.dataset.requiredIfPositiveMessage ||
      `${fieldLabel(control)} wajib diisi karena ${fieldLabel(dependency)} lebih dari 0.`;
    control.setCustomValidity(message);
    control.dataset.smptConditionalInvalid = "true";
  }
}

function validationMessage(control: FormControl): string {
  const customMessage = control.dataset.validationMessage?.trim();
  if (customMessage) return customMessage;

  const label = fieldLabel(control);
  const validity = control.validity;

  if (validity.customError && control.validationMessage) {
    return control.validationMessage;
  }
  if (validity.valueMissing) return `${label} wajib diisi.`;
  if (validity.badInput) return `${label} harus berupa nilai yang valid.`;
  if (validity.typeMismatch) return `Format ${label.toLowerCase()} tidak valid.`;
  if (validity.rangeUnderflow) return `${label} minimal ${control.getAttribute("min") ?? "nilai minimum"}.`;
  if (validity.rangeOverflow) return `${label} maksimal ${control.getAttribute("max") ?? "nilai maksimum"}.`;
  if (validity.stepMismatch) return `${label} tidak sesuai kelipatan nilai yang diperbolehkan.`;
  if (validity.patternMismatch) return `Format ${label.toLowerCase()} tidak sesuai.`;
  if (validity.tooShort) return `${label} terlalu pendek.`;
  if (validity.tooLong) return `${label} terlalu panjang.`;

  return `${label} belum valid.`;
}

function removeInlineError(control: FormControl) {
  control.removeAttribute("data-smpt-invalid");
  control.removeAttribute("aria-invalid");

  const next = control.nextElementSibling;
  if (next instanceof HTMLElement && next.dataset.smptFieldError === "true") {
    const errorId = next.id;
    next.remove();
    if (control.getAttribute("aria-describedby") === errorId) {
      control.removeAttribute("aria-describedby");
    }
  }
}

function showInlineError(control: FormControl) {
  control.dataset.smptInvalid = "true";
  control.setAttribute("aria-invalid", "true");

  let error: HTMLElement | null =
    control.nextElementSibling instanceof HTMLElement ? control.nextElementSibling : null;
  if (!error || error.dataset.smptFieldError !== "true") {
    error = document.createElement("span");
    error.dataset.smptFieldError = "true";
    error.className = "smpt-inline-field-error";
    error.id = `smpt-field-error-${Math.random().toString(36).slice(2, 10)}`;
    control.insertAdjacentElement("afterend", error);
  }

  error.textContent = validationMessage(control);
  error.setAttribute("role", "alert");
  control.setAttribute("aria-describedby", error.id);
}

function prepareForm(form: HTMLFormElement) {
  for (const element of Array.from(form.elements)) {
    if (isFormControl(element)) applyConditionalValidity(element);
  }
}

function focusFirstInvalid(form: HTMLFormElement) {
  const firstInvalid = Array.from(form.elements).find(
    (element) => isFormControl(element) && !element.validity.valid,
  );
  if (!firstInvalid || !isFormControl(firstInvalid)) return;

  firstInvalid.focus({ preventScroll: true });
  firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * Lightweight delegated validation for every app form.
 * It keeps validation close to the field without adding React state/listeners
 * to every input. Native HTML constraints remain the source of truth, while
 * data-required-if-positive handles the small set of conditional rules.
 */
export function InlineFormValidation() {
  useEffect(() => {
    const initialConditionalFields = document.querySelectorAll<HTMLElement>(
      "[data-required-if-positive]",
    );
    for (const element of Array.from(initialConditionalFields)) {
      if (isFormControl(element)) applyConditionalValidity(element);
    }

    const handleInvalid = (event: Event) => {
      if (!isFormControl(event.target)) return;
      event.preventDefault();
      applyConditionalValidity(event.target);
      showInlineError(event.target);
    };

    const handleInput = (event: Event) => {
      if (!isFormControl(event.target)) return;
      const control = event.target;
      applyConditionalValidity(control);

      if (control.form && control.name) {
        const conditionalFields = control.form.querySelectorAll<HTMLElement>(
          "[data-required-if-positive]",
        );
        for (const element of Array.from(conditionalFields)) {
          if (
            isFormControl(element) &&
            element.dataset.requiredIfPositive === control.name
          ) {
            applyConditionalValidity(element);
            if (element.dataset.smptInvalid === "true") {
              if (element.validity.valid) removeInlineError(element);
              else showInlineError(element);
            }
          }
        }
      }

      if (control.dataset.smptInvalid === "true") {
        if (control.validity.valid) removeInlineError(control);
        else showInlineError(control);
      }
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const submitter = target.closest("button, input[type='submit']");
      if (!(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement)) return;
      if (submitter.type !== "submit" || submitter.formNoValidate) return;

      const form = submitter.form;
      if (!form || form.noValidate) return;
      prepareForm(form);

      if (!form.checkValidity()) {
        event.preventDefault();
        focusFirstInvalid(form);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !isFormControl(event.target)) return;
      const form = event.target.form;
      if (form && !form.noValidate) prepareForm(form);
    };

    document.addEventListener("invalid", handleInvalid, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("change", handleInput, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("invalid", handleInvalid, true);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("change", handleInput, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return null;
}
