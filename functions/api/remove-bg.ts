type Env = {
  REMOVE_BG_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_BYPASS_HOSTNAMES?: string;
  RATE_LIMIT_SALT?: string;
  MAX_UPLOAD_BYTES?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  RATE_LIMIT?: KVNamespace;
};

type TurnstileResponse = {
  success: boolean;
  action?: string;
  "error-codes"?: string[];
};

type ErrorCode =
  | "invalid_file"
  | "verification_failed"
  | "file_too_large"
  | "rate_limited"
  | "provider_error"
  | "service_unavailable"
  | "method_not_allowed";

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_REQUESTS_PER_MINUTE = 6;
const UPSTREAM_TIMEOUT_MS = 25_000;

function isTurnstileBypassed(hostname: string, configuredHostnames?: string) {
  if (!configuredHostnames) return false;
  return configuredHostnames
    .split(",")
    .map((configuredHostname) => configuredHostname.trim().toLowerCase())
    .filter(Boolean)
    .includes(hostname.toLowerCase());
}

function parseLimit(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function jsonError(
  code: ErrorCode,
  message: string,
  status: number,
  retryAfter?: number,
) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return Response.json(
    { error: code, message, ...(retryAfter ? { retryAfter } : {}) },
    { status, headers },
  );
}

async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string,
) {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp !== "unknown") body.append("remoteip", remoteIp);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as TurnstileResponse;
  return result.success && (!result.action || result.action === "remove-background");
}

async function createRateLimitKey(remoteIp: string, salt?: string) {
  const windowId = Math.floor(Date.now() / 60_000);
  const input = new TextEncoder().encode(`${salt || "listingready-rate-limit"}:${remoteIp}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `remove-bg:${fingerprint}:${windowId}`;
}

async function isRateLimited(env: Env, remoteIp: string) {
  if (!env.RATE_LIMIT || remoteIp === "unknown") return false;
  const key = await createRateLimitKey(remoteIp, env.RATE_LIMIT_SALT);
  const current = Number((await env.RATE_LIMIT.get(key)) || "0");
  const requestLimit = parseLimit(
    env.RATE_LIMIT_PER_MINUTE,
    DEFAULT_REQUESTS_PER_MINUTE,
    60,
  );
  if (current >= requestLimit) return true;
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 120 });
  return false;
}

async function detectImageType(image: File) {
  const bytes = new Uint8Array(await image.slice(0, 12).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function normalizedImageName(name: string, imageType: string) {
  const baseName = (name || "upload").replace(/\.[^.]+$/, "") || "upload";
  const extension = imageType === "image/jpeg" ? "jpg" : imageType.split("/")[1];
  return `${baseName}.${extension}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.REMOVE_BG_API_KEY) {
    return jsonError(
      "service_unavailable",
      "Background removal is not configured yet.",
      503,
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError(
      "invalid_file",
      "Please upload an image using multipart form data.",
      400,
    );
  }

  const remoteIp = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await isRateLimited(env, remoteIp)) {
    return jsonError(
      "rate_limited",
      "Too many requests. Please wait a minute and try again.",
      429,
      60,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("invalid_file", "Could not read the uploaded image.", 400);
  }

  const hostname = new URL(request.url).hostname;
  const isLocalRequest = hostname === "localhost" || hostname === "127.0.0.1";
  const bypassTurnstile = isTurnstileBypassed(
    hostname,
    env.TURNSTILE_BYPASS_HOSTNAMES,
  );
  if (!env.TURNSTILE_SECRET_KEY && !isLocalRequest && !bypassTurnstile) {
    return jsonError(
      "service_unavailable",
      "Security verification is not configured yet.",
      503,
    );
  }

  if (env.TURNSTILE_SECRET_KEY && !bypassTurnstile) {
    const token = formData.get("turnstileToken");
    if (typeof token !== "string" || !token) {
      return jsonError(
        "verification_failed",
        "Security check is required. Please refresh and try again.",
        403,
      );
    }
    try {
      if (!(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, remoteIp))) {
        return jsonError(
          "verification_failed",
          "Security check failed. Please refresh and try again.",
          403,
        );
      }
    } catch {
      return jsonError(
        "service_unavailable",
        "Security check is temporarily unavailable.",
        503,
      );
    }
  }

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return jsonError(
      "invalid_file",
      "Missing image. Please upload a JPG, PNG, or WebP file.",
      400,
    );
  }
  if (!ACCEPTED_TYPES.has(image.type)) {
    return jsonError("invalid_file", "Please upload a JPG, PNG, or WebP image.", 400);
  }
  const maxFileSize = parseLimit(env.MAX_UPLOAD_BYTES, DEFAULT_MAX_FILE_SIZE, 20 * 1024 * 1024);
  if (image.size > maxFileSize) {
    return jsonError(
      "file_too_large",
      `Please upload an image smaller than ${Math.round(maxFileSize / 1024 / 1024)} MB.`,
      413,
    );
  }
  const detectedImageType = await detectImageType(image);
  if (!detectedImageType) {
    return jsonError(
      "invalid_file",
      "The file contents do not match a supported JPG, PNG, or WebP image.",
      400,
    );
  }

  const removeBgFormData = new FormData();
  const normalizedImage =
    image.type === detectedImageType
      ? image
      : new Blob([image], { type: detectedImageType });
  removeBgFormData.append(
    "image_file",
    normalizedImage,
    normalizedImageName(image.name, detectedImageType),
  );
  removeBgFormData.append("size", "auto");
  removeBgFormData.append("type", "product");
  removeBgFormData.append("format", "png");
  removeBgFormData.append("channels", "rgba");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let removeBgResponse: Response;
  try {
    removeBgResponse = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": env.REMOVE_BG_API_KEY },
      body: removeBgFormData,
      signal: controller.signal,
    });
  } catch {
    return jsonError(
      "provider_error",
      "Background removal timed out or is temporarily unavailable.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!removeBgResponse.ok) {
    console.warn("remove.bg request failed", {
      status: removeBgResponse.status,
      requestId: removeBgResponse.headers.get("x-request-id") || "unknown",
    });
    if (removeBgResponse.status === 402 || removeBgResponse.status === 429) {
      return jsonError(
        "service_unavailable",
        "Processing capacity is temporarily unavailable. Please try again later.",
        503,
      );
    }
    return jsonError(
      "provider_error",
      "Background removal failed. Please try another image.",
      502,
    );
  }

  return new Response(removeBgResponse.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

const methodNotAllowed: PagesFunction<Env> = async () =>
  jsonError("method_not_allowed", "Method not allowed. Use POST.", 405);

export const onRequestGet = methodNotAllowed;
export const onRequestPut = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
