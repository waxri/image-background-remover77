export type AlphaBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OutputFormat = "image/jpeg" | "image/png" | "image/webp";

export type ComposeOptions = {
  width: number;
  height: number;
  coverage: number;
  background: "white" | "transparent" | "color";
  backgroundColor: string;
  format: OutputFormat;
};

const ALPHA_THRESHOLD = 10;
const MAX_SCAN_EDGE = 768;

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
  const offsetX = (options.width - visibleWidth) / 2 - bounds.x * scale;
  const offsetY = (options.height - visibleHeight) / 2 - bounds.y * scale;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    offsetX,
    offsetY,
    image.width * scale,
    image.height * scale,
  );

  return canvasToBlob(canvas, options.format);
}
