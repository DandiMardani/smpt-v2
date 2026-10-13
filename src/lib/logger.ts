/**
 * Centralized safe action logger for server actions and API mutations.
 * Outputs structured diagnostic logs to server console (stdout/stderr)
 * without leaking sensitive data and without throwing exceptions.
 */

function sanitizeValue(value: unknown): unknown {
  if (typeof File !== "undefined" && value instanceof File) {
    return {
      _type: "File",
      name: value.name,
      size: value.size,
      mimeType: value.type,
    };
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

function sanitizePayload(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;

  try {
    // Handle FormData
    if (typeof FormData !== "undefined" && raw instanceof FormData) {
      const result: Record<string, unknown> = {};
      raw.forEach((val, key) => {
        if (/password|token|secret|pin/i.test(key)) {
          result[key] = "[REDACTED]";
        } else {
          result[key] = sanitizeValue(val);
        }
      });
      return result;
    }

    // Handle plain objects & arrays
    if (typeof raw === "object") {
      const seen = new WeakSet();
      const stringified = JSON.stringify(
        raw,
        (key, val) => {
          if (/password|token|secret|pin/i.test(key)) {
            return "[REDACTED]";
          }
          if (typeof val === "object" && val !== null) {
            if (seen.has(val)) return "[CIRCULAR]";
            seen.add(val);
          }
          return sanitizeValue(val);
        },
      );
      return JSON.parse(stringified);
    }

    return String(raw);
  } catch {
    return "[Payload Unserializable]";
  }
}

export function logActionFailure(context: string, payload: unknown, error: unknown): void {
  try {
    const timestamp = new Date().toISOString();

    let errorMessage = "Unknown error";
    let errorCode: string | undefined;
    let errorDetails: string | undefined;
    let errorHint: string | undefined;
    let stack: string | undefined;

    if (error instanceof Error) {
      errorMessage = error.message;
      stack = error.stack;
    }

    if (typeof error === "object" && error !== null) {
      const errObj = error as Record<string, unknown>;
      if (typeof errObj.message === "string") errorMessage = errObj.message;
      if (typeof errObj.code === "string") errorCode = errObj.code;
      if (typeof errObj.details === "string") errorDetails = errObj.details;
      if (typeof errObj.hint === "string") errorHint = errObj.hint;
    } else if (typeof error === "string") {
      errorMessage = error;
    }

    const logEntry = {
      timestamp,
      context,
      error: {
        message: errorMessage,
        ...(errorCode ? { code: errorCode } : {}),
        ...(errorDetails ? { details: errorDetails } : {}),
        ...(errorHint ? { hint: errorHint } : {}),
        ...(stack ? { stack } : {}),
      },
      payload: sanitizePayload(payload),
    };

    console.error(`❌ [ACTION_FAILURE] [${context}]`, JSON.stringify(logEntry, null, 2));
  } catch (loggingError) {
    // Failsafe: logger must never throw
    try {
      console.error(`❌ [ACTION_FAILURE_FALLBACK] [${context}]:`, error);
    } catch {
      // noop
    }
  }
}
