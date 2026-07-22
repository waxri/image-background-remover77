export type AlphaBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OutputFormat = "image/jpeg" | "image/png" | "image/webp";
export type EdgeRefinement = "natural" | "crisp" | "detail";
export type ShadowStyle = "none" | "soft" | "contact";

export type ComposeOptions = {
  width: number;
  height: number;
  coverage: number;
  background: "white" | "transparent" | "color";
  backgroundColor: string;
  format: OutputFormat;
  edgeRefinement: EdgeRefinement;
  shadow: ShadowStyle;
  quality: number;
};

const ALPHA_THRESHOLD = 10;
const MAX_SCAN_EDGE = 768;
const ALPHA_CHUNK_PIXELS = 2_000_000;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: OutputFormat,
  quality = 0.92,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not create the output image."));
      },
      type,
      quality,
    );
  });
}

export function getOutputExtension(format: OutputFormat) {
  if (format === "image/jpeg") return "jpg";
  if (format === "image/webp") return "webp";
  return "png";
}

export async function findAlphaBounds(image: ImageBitmap): Promise<AlphaBounds> {
  const scanScale = Math.min(1, MAX_SCAN_EDGE / Math.max(image.width, image.height));
  const scanWidth = Math.max(1, Math.round(image.width * scanScale));
  const scanHeight = Math.max(1, Math.round(image.height * scanScale));
  const canvas = document.createElement("canvas");
  canvas.width = scanWidth;
  canvas.height = scanHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available in this browser.");

  context.drawImage(image, 0, 0, scanWidth, scanHeight);
  const pixels = context.getImageData(0, 0, scanWidth, scanHeight).data;
  let minX = scanWidth;
  let minY = scanHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < scanHeight; y += 1) {
    for (let x = 0; x < scanWidth; x += 1) {
      const alpha = pixels[(y * scanWidth + x) * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("No visible product was found in the processed image.");
  }

  const inverse = 1 / scanScale;
  return {
    x: Math.max(0, Math.floor(minX * inverse)),
    y: Math.max(0, Math.floor(minY * inverse)),
    width: Math.min(image.width, Math.ceil((maxX - minX + 1) * inverse)),
    height: Math.min(image.height, Math.ceil((maxY - minY + 1) * inverse)),
  };
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function refineAlphaEdge(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: EdgeRefinement,
) {
  if (mode === "natural") return;

  const rowsPerChunk = Math.max(1, Math.floor(ALPHA_CHUNK_PIXELS / width));
  for (let startY = 0; startY < height; startY += rowsPerChunk) {
    const chunkHeight = Math.min(rowsPerChunk, height - startY);
    const imageData = context.getImageData(0, startY, width, chunkHeight);
    const pixels = imageData.data;

    for (let index = 3; index < pixels.length; index += 4) {
      const normalized = pixels[index] / 255;
      if (mode === "detail") {
        pixels[index] = Math.round(255 * Math.pow(normalized, 0.84));
        continue;
      }

      const contrasted = Math.min(1, Math.max(0, (normalized - 0.06) / 0.88));
      pixels[index] = Math.round(
        255 * contrasted * contrasted * (3 - 2 * contrasted),
      );
    }

    context.putImageData(imageData, 0, startY);
    if (height > rowsPerChunk) await nextFrame();
  }
}

function expandedBounds(image: ImageBitmap, bounds: AlphaBounds) {
  const padding = Math.max(2, Math.ceil(Math.max(bounds.width, bounds.height) * 0.004));
  const x = Math.max(0, bounds.x - padding);
  const y = Math.max(0, bounds.y - padding);
  const right = Math.min(image.width, bounds.x + bounds.width + padding);
  const bottom = Math.min(image.height, bounds.y + bounds.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

function drawProductShadow(
  context: CanvasRenderingContext2D,
  productCanvas: HTMLCanvasElement,
  x: number,
  y: number,
  options: ComposeOptions,
) {
  if (options.shadow === "none") return;

  const outputEdge = Math.min(options.width, options.height);
  context.save();

  if (options.shadow === "contact") {
    const centerX = x + productCanvas.width / 2;
    const centerY = y + productCanvas.height * 0.96;
    context.globalAlpha = 0.2;
    context.filter = `blur(${Math.max(5, outputEdge * 0.006)}px)`;
    context.fillStyle = "#111827";
    context.beginPath();
    context.ellipse(
      centerX,
      centerY,
      productCanvas.width * 0.29,
      Math.max(4, productCanvas.height * 0.026),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();
    return;
  }

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = productCanvas.width;
  shadowCanvas.height = productCanvas.height;
  const shadowContext = shadowCanvas.getContext("2d");
  if (!shadowContext) {
    context.restore();
    return;
  }
  shadowContext.drawImage(productCanvas, 0, 0);
  shadowContext.globalCompositeOperation = "source-in";
  shadowContext.fillStyle = "#172033";
  shadowContext.fillRect(0, 0, shadowCanvas.width, shadowCanvas.height);

  context.globalAlpha = 0.17;
  context.filter = `blur(${Math.max(7, outputEdge * 0.008)}px)`;
  context.drawImage(shadowCanvas, x, y + outputEdge * 0.012);
  context.restore();
}

export async function composeProductImage(
  image: ImageBitmap,
  bounds: AlphaBounds,
  options: ComposeOptions,
) {
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available in this browser.");

  if (options.background === "white" || options.format === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, options.width, options.height);
  } else if (options.background === "color") {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, options.width, options.height);
  } else {
    context.clearRect(0, 0, options.width, options.height);
  }

  const targetWidth = options.width * options.coverage;
  const targetHeight = options.height * options.coverage;
  const scale = Math.min(targetWidth / bounds.width, targetHeight / bounds.height);
  const visibleWidth = bounds.width * scale;
  const visibleHeight = bounds.height * scale;
  const sourceBounds = expandedBounds(image, bounds);
  const productCanvas = document.createElement("canvas");
  productCanvas.width = Math.max(1, Math.round(sourceBounds.width * scale));
  productCanvas.height = Math.max(1, Math.round(sourceBounds.height * scale));
  const productContext = productCanvas.getContext("2d", { willReadFrequently: true });
  if (!productContext) throw new Error("Canvas is not available in this browser.");

  productContext.imageSmoothingEnabled = true;
  productContext.imageSmoothingQuality = "high";
  productContext.drawImage(
    image,
    sourceBounds.x,
    sourceBounds.y,
    sourceBounds.width,
    sourceBounds.height,
    0,
    0,
    productCanvas.width,
    productCanvas.height,
  );
  await refineAlphaEdge(
    productContext,
    productCanvas.width,
    productCanvas.height,
    options.edgeRefinement,
  );

  const offsetX =
    (options.width - visibleWidth) / 2 - (bounds.x - sourceBounds.x) * scale;
  const offsetY =
    (options.height - visibleHeight) / 2 - (bounds.y - sourceBounds.y) * scale;
  drawProductShadow(context, productCanvas, offsetX, offsetY, options);
  context.drawImage(productCanvas, offsetX, offsetY);

  return canvasToBlob(canvas, options.format, options.quality);
}
