type Env = {
  REMOVE_BG_API_KEY?: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.REMOVE_BG_API_KEY) {
    return jsonError("Remove.bg API key is not configured.", 500);
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError("Please upload an image using multipart form data.", 400);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Could not read the uploaded image.", 400);
  }

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return jsonError("Missing image. Please upload a JPG, PNG, or WebP file.", 400);
  }

  if (!ACCEPTED_TYPES.has(image.type)) {
    return jsonError("Please upload a JPG, PNG, or WebP image.", 400);
  }

  if (image.size > MAX_FILE_SIZE) {
    return jsonError("The image is too large. Please upload an image under 10 MB.", 413);
  }

  const removeBgFormData = new FormData();
  removeBgFormData.append("image_file", image, image.name || "upload.png");
  removeBgFormData.append("size", "auto");

  let removeBgResponse: Response;
  try {
    removeBgResponse = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": env.REMOVE_BG_API_KEY,
      },
      body: removeBgFormData,
    });
  } catch {
    return jsonError("Service is temporarily unavailable. Please try again later.", 502);
  }

  if (!removeBgResponse.ok) {
    const body = await removeBgResponse.text().catch(() => "");
    const fallback =
      removeBgResponse.status === 402 || removeBgResponse.status === 429
        ? "Background removal quota is unavailable. Please try again later."
        : "Background removal failed. Please try another image.";

    return jsonError(body || fallback, removeBgResponse.status === 429 ? 429 : 502);
  }

  return new Response(removeBgResponse.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return jsonError("Method not allowed.", 405);
};

export const onRequestPut: PagesFunction<Env> = async () => {
  return jsonError("Method not allowed.", 405);
};

export const onRequestPatch: PagesFunction<Env> = async () => {
  return jsonError("Method not allowed.", 405);
};

export const onRequestDelete: PagesFunction<Env> = async () => {
  return jsonError("Method not allowed.", 405);
};
