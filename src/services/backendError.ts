/**
 * Backend failure shaping.
 *
 * Lives in its own module so the adapters can import it without importing
 * `backend.ts` - `backend.ts` imports the adapters to build them, so a
 * back-reference would be a runtime import cycle. Adapters therefore import
 * types from `backend.ts` (`import type`, erased at build) and values from
 * here.
 *
 * The shape matches `schemas/error.schema.json`: `code`, `message`,
 * `details`, `retryable`. Callers must never have to parse free text to
 * decide whether to retry.
 */

import type { BackendFailure } from "./backend";

export function failure(
  code: string,
  message: string,
  options: { retryable?: boolean; details?: Record<string, unknown> } = {},
): BackendFailure {
  return {
    schema_version: 1,
    code,
    message,
    details: options.details ?? {},
    retryable: options.retryable ?? false,
  };
}

export function isFailure(value: unknown): value is BackendFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    "retryable" in value
  );
}

/**
 * Turn anything thrown by `invoke` or a fetch into a shaped failure.
 *
 * `fallbackCode` is used when the value carries no structure of its own.
 */
export function toFailure(error: unknown, fallbackCode: string): BackendFailure {
  if (isFailure(error)) return error;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error) ?? "";

  return failure(fallbackCode, message || "Unknown backend failure", {
    // A native runtime that is not up yet is transient - it may be starting.
    // A command that rejected with a payload usually is not.
    retryable:
      /not found|not available|not connected|ECONNREFUSED|disconnect|starting/i.test(
        message,
      ),
    details: error instanceof Error ? { name: error.name } : {},
  });
}

/** Single-line summary for an error banner or log. */
export function describeFailure(value: unknown): string {
  if (isFailure(value)) return `${value.code}: ${value.message}`;
  if (value instanceof Error) return value.message;
  return String(value);
}
