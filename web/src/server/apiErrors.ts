import { NextResponse } from "next/server";
import type { ZodError } from "zod";

type ApiErrorBody = {
  error: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
};

type ApiErrorConfig = {
  status: number;
  message: string;
  retryable?: boolean;
};

const ERROR_MAP: Record<string, ApiErrorConfig> = {
  address_autocomplete_failed: {
    status: 503,
    message: "Address lookup is temporarily unavailable. You can continue with manual address entry.",
    retryable: true,
  },
  address_place_lookup_failed: {
    status: 503,
    message: "Address lookup is temporarily unavailable. You can continue with manual address entry.",
    retryable: true,
  },
  address_validation_failed: {
    status: 503,
    message: "Address validation is temporarily unavailable. You can continue with manual address entry.",
    retryable: true,
  },
  confirm_details_failed: {
    status: 503,
    message: "Checkout details could not be saved right now. Please try again.",
    retryable: true,
  },
  create_order_failed: {
    status: 503,
    message: "The order could not be created right now. Please try again.",
    retryable: true,
  },
  cron_secret_missing: {
    status: 503,
    message: "Cron security is not configured in this environment yet.",
  },
  customer_create_failed: {
    status: 503,
    message: "Customer data could not be prepared right now. Please try again.",
    retryable: true,
  },
  database_env_missing: {
    status: 503,
    message: "The database connection is not configured in this environment yet.",
  },
  fetch_cart_failed: {
    status: 503,
    message: "Checkout could not be started right now. Please try again.",
    retryable: true,
  },
  google_maps_not_configured: {
    status: 503,
    message: "Google address services are not configured. Manual address entry is still available.",
  },
  invalid_auth: {
    status: 401,
    message: "Your session is no longer valid. Please sign in again.",
  },
  invalid_cron_secret: {
    status: 401,
    message: "This scheduled report request is not authorized.",
  },
  invalid_request: {
    status: 400,
    message: "The request payload is invalid.",
  },
  invalid_south_african_id: {
    status: 422,
    message: "Please enter a valid 13-digit South African ID number.",
  },
  missing_auth: {
    status: 401,
    message: "Please sign in before continuing.",
  },
  manual_review_not_found: {
    status: 404,
    message: "This manual review case could not be found.",
  },
  manual_review_resolve_failed: {
    status: 503,
    message: "Manual review could not be updated right now. Please try again.",
    retryable: true,
  },
  otp_expired: {
    status: 410,
    message: "The OTP code has expired. Please request a new code.",
  },
  otp_invalid: {
    status: 400,
    message: "The OTP code is incorrect. Please try again.",
  },
  otp_not_found: {
    status: 404,
    message: "The OTP request could not be found. Please request a new code.",
  },
  otp_send_failed: {
    status: 503,
    message: "The OTP service is temporarily unavailable. Please try again.",
    retryable: true,
  },
  otp_verify_failed: {
    status: 503,
    message: "OTP verification is temporarily unavailable. Please try again.",
    retryable: true,
  },
  payment_declined: {
    status: 402,
    message: "The payment was declined.",
  },
  resend_api_key_missing: {
    status: 503,
    message: "The reporting email provider is not configured yet.",
  },
  resend_from_email_missing: {
    status: 503,
    message: "The reporting sender email is not configured yet.",
  },
  risk_assessment_failed: {
    status: 503,
    message: "Risk checks are temporarily unavailable. Please try again.",
    retryable: true,
  },
  session_create_failed: {
    status: 503,
    message: "The checkout session could not be created right now. Please try again.",
    retryable: true,
  },
  session_not_found: {
    status: 404,
    message: "This checkout session was not found. Please restart checkout.",
  },
  terms_required: {
    status: 400,
    message: "Please accept the terms before continuing.",
  },
  underage_customer: {
    status: 422,
    message: "Customers under 18 cannot place orders on the PONDO platform.",
  },
  unsupported_partner: {
    status: 400,
    message: "That partner is not supported in this environment.",
  },
  verification_case_failed: {
    status: 503,
    message: "Verification could not be started right now. Please try again.",
    retryable: true,
  },
};

function humanizeErrorCode(code: string) {
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isObjectWithCode(error: unknown): error is { code?: unknown; message?: unknown } {
  return typeof error === "object" && error !== null;
}

function isInfrastructureError(error: unknown, code: string) {
  if (code.startsWith("google_request_failed_")) return true;
  if (code.startsWith("ip2location_failed_")) return true;
  if (code.startsWith("ipapi_failed_")) return true;

  if (!isObjectWithCode(error)) return false;

  const infraCodes = new Set(["08001", "08006", "57P01", "57P03", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"]);
  const errorCode = typeof error.code === "string" ? error.code : "";
  if (infraCodes.has(errorCode)) return true;

  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return message.includes("connect") || message.includes("connection terminated") || message.includes("server closed the connection");
}

function normalizeApiError(error: unknown, fallbackError: string) {
  const code = error instanceof Error && error.message ? error.message : fallbackError;
  const mapped = ERROR_MAP[code];

  if (mapped) {
    return {
      status: mapped.status,
      body: {
        error: code,
        message: mapped.message,
        retryable: mapped.retryable,
      } satisfies ApiErrorBody,
    };
  }

  if (isInfrastructureError(error, code)) {
    return {
      status: 503,
      body: {
        error: code,
        message: "A required backend service is temporarily unavailable. Please try again shortly.",
        retryable: true,
      } satisfies ApiErrorBody,
    };
  }

  return {
    status: 500,
    body: {
      error: fallbackError,
      message: code.includes("_") ? humanizeErrorCode(code) : "Unexpected server error. Please try again.",
    } satisfies ApiErrorBody,
  };
}

export function invalidRequest(error: ZodError) {
  return NextResponse.json(
    {
      error: "invalid_request",
      message: ERROR_MAP.invalid_request.message,
      details: error.flatten(),
    } satisfies ApiErrorBody,
    { status: ERROR_MAP.invalid_request.status },
  );
}

export function apiErrorResponse(error: unknown, fallbackError: string) {
  const normalized = normalizeApiError(error, fallbackError);
  return NextResponse.json(normalized.body, { status: normalized.status });
}
