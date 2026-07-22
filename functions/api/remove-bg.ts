type Env = {
  REMOVE_BG_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  RATE_LIMIT_SALT?: string;
  RATE_LIMIT?: KVNamespace;
};

type TurnstileResponse = {
  success: boolean;
  action?: string;
  "error-codes"?: string[];
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REQUESTS_PER_MINUTE = 6;

function jsonError(message: string, status: number, retryAfter?: number) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return Response.json({ error: message }, { status, headers });
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
  if (!salt) return `remove-bg:${remoteIp}:${windowId}`;

  const input = new TextEncoder().encode(`${salt}:${remoteIp}`);
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
  if (current >= REQUESTS_PER_MINUTE) return true;
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 120 });
  return false;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.REMOVE_BG_API_KEY) {
    return jsonError("Background removal is not configured yet.", 503);
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError("Please upload an image using multipart form data.", 400);
  }

  const remoteIp = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await isRateLimited(env, remoteIp)) {
    return jsonError("Too many requests. Please wait a minute and try again.", 429, 60);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Could not read the uploaded image.", 400);
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const token = formData.get("turnstileToken");
    if (typeof token !== "string" || !token) {
      return jsonError("Security check is required. Please refresh and try again.", 403);
    }
    try {
      if (!(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, remoteIp))) {
        return jsonError("Security check failed. Please refresh and try again.", 403);
      }
    } catch {
      return jsonError("Security check is temporarily unavailable.", 503);
    }
  }

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return jsonError("Missing image. Please upload a JPG, PNG, or WebP file.", 400);
  }
  if (!ACCEPTED_TYPES.has(image.type)) {
    return jsonError("Please upload a JPG, PNG, or WebP image.", 400);
  }
  if (image.size > MAX_FILE_SIZE) {
    return jsonError("Please upload an image smaller than 10 MB.", 413);
  }

  const removeBgFormData = new FormData();
  removeBgFormData.append("image_file", image, image.name || "upload.png");
  removeBgFormData.append("size", "auto");

  let removeBgResponse: Response;
  try {
    removeBgResponse = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": env.REMOVE_BG_API_KEY },
      body: removeBgFormData,
    });
  } catch {
    return jsonError("Background removal is temporarily unavailable.", 502);
  }

  if (!removeBgResponse.ok) {
    if (removeBgResponse.status === 402 || removeBgResponse.status === 429) {
      return jsonError("Processing capacity is temporarily unavailable. Please try again later.", 503);
    }
    return jsonError("Background removal failed. Please try another image.", 502);
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
  jsonError("Method not allowed.", 405);

export const onRequestGet = methodNotAllowed;
export const onRequestPut = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
