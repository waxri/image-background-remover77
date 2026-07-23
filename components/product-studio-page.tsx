"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlphaBounds,
  composeProductImage,
  EdgeRefinement,
  findAlphaBounds,
  getOutputExtension,
  OutputFormat,
  ShadowStyle,
} from "@/lib/image-pipeline";
import { FAQ_ITEMS } from "@/lib/site-content";

type Platform = "amazon" | "shopify" | "custom";
type Background = "white" | "transparent" | "color";
type OutputQuality = "standard" | "high";
type QuickRecipe = "amazon-clean" | "soft-shadow" | "transparent";
type ProcessStatus = "demo" | "validating" | "processing" | "ready" | "error";
type ComplianceStatus = "pass" | "warning" | "fail" | "manual";
type TurnstileMode = "disabled" | "checking" | "required" | "bypassed";
type ExportPresetId = "amazon" | "shopify" | "transparent";

type ComplianceItem = {
  label: string;
  detail: string;
  status: ComplianceStatus;
};

type ApiErrorBody = {
  error?: string;
  message?: string;
  retryAfter?: number;
};

type CutoutInfo = {
  width: number;
  height: number;
  boundsWidth: number;
  boundsHeight: number;
};

type ProductStudioPageProps = {
  variant: "amazon" | "background";
};

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: "flexible";
      appearance: "interaction-only";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FREE_IMAGE_LIMIT = 3;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_BYPASS_HOSTNAMES = new Set(
  (process.env.NEXT_PUBLIC_TURNSTILE_BYPASS_HOSTNAMES || "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean),
);
const EXPORT_PRESETS = [
  {
    id: "amazon",
    label: "Amazon main",
    detail: "1600 × 1600 · white · JPG",
    suffix: "main-amazon",
    width: 1600,
    height: 1600,
    coverage: 0.9,
    background: "white",
    format: "image/jpeg",
  },
  {
    id: "shopify",
    label: "Shopify square",
    detail: "2048 × 2048 · white · PNG",
    suffix: "shopify",
    width: 2048,
    height: 2048,
    coverage: 0.86,
    background: "white",
    format: "image/png",
  },
  {
    id: "transparent",
    label: "Transparent cutout",
    detail: "2048 × 2048 · transparent · PNG",
    suffix: "transparent",
    width: 2048,
    height: 2048,
    coverage: 0.86,
    background: "transparent",
    format: "image/png",
  },
] as const;

const platformLabels: Record<Platform, string> = {
  amazon: "Amazon",
  shopify: "Shopify",
  custom: "Custom",
};

const edgeLabels: Record<EdgeRefinement, string> = {
  natural: "Natural",
  crisp: "Crisp",
  detail: "Fine detail",
};

const shadowLabels: Record<ShadowStyle, string> = {
  none: "None",
  contact: "Contact",
  soft: "Soft",
};

const pricingPlans = [
  { name: "Free", price: "$0", images: "3 images", cta: "Try it free" },
  {
    name: "Starter",
    price: "$5.90",
    images: "40 images",
    unit: "$0.15 / image",
    cta: "Join early access",
  },
  {
    name: "Seller",
    price: "$12.90",
    images: "120 images",
    unit: "$0.11 / image",
    cta: "Join early access",
    featured: true,
  },
  {
    name: "Growth",
    price: "$24.90",
    images: "300 images",
    unit: "$0.08 / image",
    cta: "Join early access",
  },
];

function track(event: string, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = { event, ...properties };
  window.dataLayer?.push(payload);
  window.dispatchEvent(new CustomEvent("mainpic:analytics", { detail: payload }));
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function baseFileName(name: string) {
  return (
    name
      .replace(/\.[^/.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "product"
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function CheckIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={small ? "icon icon-small" : "icon"}
      viewBox="0 0 24 24"
    >
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

function StatusIcon({ status }: { status: ComplianceStatus }) {
  if (status === "pass") return <CheckIcon small />;
  if (status === "manual") {
    return (
      <svg aria-hidden="true" className="status-icon" viewBox="0 0 24 24">
        <path d="M2.7 12s3.4-5.3 9.3-5.3 9.3 5.3 9.3 5.3-3.4 5.3-9.3 5.3S2.7 12 2.7 12Z" />
        <circle cx="12" cy="12" r="2.4" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="status-icon" viewBox="0 0 24 24">
      <path d="M12 3.5 21 20H3L12 3.5Z" />
      <path d="M12 9v5m0 3h.01" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="upload-icon" viewBox="0 0 48 48">
      <path d="M24 32V10m0 0-8 8m8-8 8 8" />
      <path d="M9 31v6a3 3 0 0 0 3 3h24a3 3 0 0 0 3-3v-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className="lock-icon" viewBox="0 0 24 24">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="arrow-icon" viewBox="0 0 24 24">
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="download-icon" viewBox="0 0 24 24">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" />
      <path d="M5 18v2h14v-2" />
    </svg>
  );
}

function PlatformMark({ platform }: { platform: Platform }) {
  if (platform === "amazon") return <span className="platform-mark amazon-mark">a</span>;
  if (platform === "shopify") return <span className="platform-mark shopify-mark">S</span>;
  return <span className="platform-mark custom-mark" />;
}

function TurnstileGate({
  onToken,
  resetKey,
}: {
  onToken: (token: string) => void;
  resetKey: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "remove-background",
        size: "flexible",
        appearance: "interaction-only",
        callback: (token) => onTokenRef.current(token),
        "error-callback": () => onTokenRef.current(""),
        "expired-callback": () => onTokenRef.current(""),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-mainpic-turnstile="true"]',
      );
      if (existing) {
        existing.addEventListener("load", renderWidget, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.mainpicTurnstile = "true";
        script.addEventListener("load", renderWidget, { once: true });
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="turnstile-slot" aria-label="Security verification" />;
}

export function ProductStudioPage({ variant }: ProductStudioPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const boundsRef = useRef<AlphaBounds | null>(null);
  const originalObjectUrlRef = useRef<string | null>(null);
  const resultObjectUrlRef = useRef<string | null>(null);
  const renderVersionRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const secondImageTrackedRef = useRef(false);

  const [platform, setPlatform] = useState<Platform>("amazon");
  const [background, setBackground] = useState<Background>("white");
  const [backgroundColor, setBackgroundColor] = useState("#e8f0ff");
  const [coverage, setCoverage] = useState(90);
  const [format, setFormat] = useState<OutputFormat>("image/jpeg");
  const [edgeRefinement, setEdgeRefinement] = useState<EdgeRefinement>("crisp");
  const [shadow, setShadow] = useState<ShadowStyle>("none");
  const [outputQuality, setOutputQuality] = useState<OutputQuality>("high");
  const [customSize, setCustomSize] = useState(1600);
  const [status, setStatus] = useState<ProcessStatus>("demo");
  const [isDragging, setIsDragging] = useState(false);
  const [sourceName, setSourceName] = useState("drill");
  const [originalUrl, setOriginalUrl] = useState("/sample-before.jpg");
  const [resultUrl, setResultUrl] = useState("/sample-after.jpg");
  const [resultSize, setResultSize] = useState("1.1 MB");
  const [resultBytes, setResultBytes] = useState(1.1 * 1024 * 1024);
  const [error, setError] = useState("");
  const [cutoutVersion, setCutoutVersion] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [turnstileMode, setTurnstileMode] = useState<TurnstileMode>(
    TURNSTILE_SITE_KEY ? "checking" : "disabled",
  );
  const [skuName, setSkuName] = useState("drill");
  const [selectedPackExports, setSelectedPackExports] = useState<ExportPresetId[]>(
    EXPORT_PRESETS.map((preset) => preset.id),
  );
  const [isExportingPack, setIsExportingPack] = useState(false);
  const [packMessage, setPackMessage] = useState("");
  const [dialogPlan, setDialogPlan] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"original" | "result">("result");
  const [successfulImages, setSuccessfulImages] = useState(0);
  const [cutoutInfo, setCutoutInfo] = useState<CutoutInfo | null>(null);

  const outputSize = useMemo(() => {
    if (platform === "amazon") return { width: 1600, height: 1600 };
    if (platform === "shopify") return { width: 2048, height: 2048 };
    const size = Math.min(5000, Math.max(500, customSize || 500));
    return {
      width: size,
      height: size,
    };
  }, [customSize, platform]);

  const extension = getOutputExtension(format);
  const safeSkuName = baseFileName(skuName || sourceName);
  const downloadName = `${safeSkuName}-main-${platform}.${extension}`;
  const hero =
    variant === "background"
      ? {
          title: "Product backgrounds, removed and ready.",
          subtitle:
            "Remove once, then deliver white, transparent, Amazon, and Shopify-ready files without opening a design canvas.",
        }
      : {
          title: "Amazon product photos, ready to list.",
          subtitle:
            "Turn one ordinary product shot into a checked Amazon main image and a ready-named multi-channel delivery pack.",
        };

  useEffect(() => {
    const savedColor = window.sessionStorage.getItem("mainpic:background-color");
    if (savedColor && /^#[0-9a-f]{6}$/i.test(savedColor)) setBackgroundColor(savedColor);
    const savedUsage = Number(window.sessionStorage.getItem("mainpic:successful-images"));
    if (Number.isFinite(savedUsage) && savedUsage > 0) {
      setSuccessfulImages(Math.min(savedUsage, FREE_IMAGE_LIMIT));
    }
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    setTurnstileMode(
      TURNSTILE_BYPASS_HOSTNAMES.has(window.location.hostname.toLowerCase())
        ? "bypassed"
        : "required",
    );
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      bitmapRef.current?.close();
      if (originalObjectUrlRef.current) URL.revokeObjectURL(originalObjectUrlRef.current);
      if (resultObjectUrlRef.current) URL.revokeObjectURL(resultObjectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const bitmap = bitmapRef.current;
    const bounds = boundsRef.current;
    if (!bitmap || !bounds || cutoutVersion === 0) return;

    const renderVersion = ++renderVersionRef.current;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void composeProductImage(bitmap, bounds, {
        ...outputSize,
        coverage: coverage / 100,
        background,
        backgroundColor,
        format,
        edgeRefinement,
        shadow,
        quality: outputQuality === "high" ? 0.96 : 0.88,
      })
        .then((blob) => {
          if (cancelled || renderVersion !== renderVersionRef.current) return;
          const nextUrl = URL.createObjectURL(blob);
          if (resultObjectUrlRef.current) URL.revokeObjectURL(resultObjectUrlRef.current);
          resultObjectUrlRef.current = nextUrl;
          setResultUrl(nextUrl);
          setResultSize(formatBytes(blob.size));
          setResultBytes(blob.size);
          setStatus("ready");
        })
        .catch((caught) => {
          if (cancelled) return;
          setError(caught instanceof Error ? caught.message : "Could not create the output image.");
          setStatus("error");
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [
    background,
    backgroundColor,
    coverage,
    cutoutVersion,
    edgeRefinement,
    format,
    outputQuality,
    outputSize,
    shadow,
  ]);

  async function validateFile(file: File) {
    if (!ACCEPTED_TYPES.has(file.type)) return "Please upload a JPG, PNG, or WebP image.";
    if (file.size > MAX_FILE_SIZE) return "Please upload an image smaller than 10 MB.";
    try {
      const decoded = await createImageBitmap(file);
      const invalidDimensions = decoded.width < 1 || decoded.height < 1;
      decoded.close();
      if (invalidDimensions) return "The image has invalid dimensions. Please choose another file.";
    } catch {
      return "This image could not be decoded. Please export it again as JPG, PNG, or WebP.";
    }
    return "";
  }

  async function processFile(file: File) {
    abortControllerRef.current?.abort();
    setError("");
    setStatus("validating");
    const validationError = await validateFile(file);
    if (validationError) {
      setError(validationError);
      setStatus("error");
      track("image_upload_rejected", { reason: "invalid_file" });
      return;
    }
    if (successfulImages >= FREE_IMAGE_LIMIT) {
      setError("You have used the three free test images in this browser session.");
      setStatus("error");
      setDialogPlan("Free limit");
      track("image_upload_rejected", { reason: "free_limit" });
      return;
    }
    if (
      turnstileMode === "checking" ||
      (turnstileMode === "required" && !turnstileToken)
    ) {
      setError("Security check is still loading. Please try again in a moment.");
      setStatus("error");
      track("image_upload_rejected", { reason: "verification_not_ready" });
      return;
    }

    if (successfulImages > 0 && !secondImageTrackedRef.current) {
      secondImageTrackedRef.current = true;
      track("second_image_started", { platform });
    }

    track("image_upload_started", {
      platform,
      type: file.type,
      sizeBucket: file.size < 1024 * 1024 ? "under_1mb" : file.size < 5 * 1024 * 1024 ? "1_to_5mb" : "5_to_10mb",
    });
    setError("");
    setStatus("processing");
    setSourceName(file.name);
    setSkuName(baseFileName(file.name));
    setPackMessage("");
    setPreviewMode("result");

    if (originalObjectUrlRef.current) URL.revokeObjectURL(originalObjectUrlRef.current);
    const nextOriginalUrl = URL.createObjectURL(file);
    originalObjectUrlRef.current = nextOriginalUrl;
    setOriginalUrl(nextOriginalUrl);
    setResultUrl("");

    const formData = new FormData();
    formData.append("image", file);
    if (turnstileToken) formData.append("turnstileToken", turnstileToken);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/remove-bg", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        const retryCopy = body?.retryAfter ? ` Try again in ${body.retryAfter} seconds.` : "";
        throw new Error(
          `${body?.message || "Background removal failed. Please try another photo."}${retryCopy}`,
        );
      }

      const cutout = await response.blob();
      const bitmap = await createImageBitmap(cutout);
      let bounds: AlphaBounds;
      try {
        bounds = await findAlphaBounds(bitmap);
      } catch (caught) {
        bitmap.close();
        throw caught;
      }
      bitmapRef.current?.close();
      bitmapRef.current = bitmap;
      boundsRef.current = bounds;
      setCutoutInfo({
        width: bitmap.width,
        height: bitmap.height,
        boundsWidth: bounds.width,
        boundsHeight: bounds.height,
      });
      setCutoutVersion((version) => version + 1);
      setSuccessfulImages((previous) => {
        const next = Math.min(previous + 1, FREE_IMAGE_LIMIT);
        window.sessionStorage.setItem("mainpic:successful-images", String(next));
        return next;
      });
      track("background_removal_succeeded", { platform });
    } catch (caught) {
      if (turnstileMode === "required") {
        setTurnstileToken("");
        setTurnstileResetKey((key) => key + 1);
      }
      const cancelled = caught instanceof DOMException && caught.name === "AbortError";
      setError(cancelled ? "Processing cancelled. Your original photo is still available." : caught instanceof Error ? caught.message : "The service is temporarily unavailable. Please try again.");
      setStatus("error");
      track(cancelled ? "background_removal_cancelled" : "background_removal_failed", { platform });
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }

  function cancelProcessing() {
    abortControllerRef.current?.abort();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  function choosePlatform(nextPlatform: Platform) {
    setPlatform(nextPlatform);
    setCoverage(nextPlatform === "shopify" ? 86 : 90);
    if (nextPlatform === "amazon") {
      setBackground("white");
      setFormat("image/jpeg");
      setEdgeRefinement("crisp");
      setShadow("none");
    }
    if (nextPlatform === "shopify") {
      setBackground("white");
      setFormat("image/png");
      setEdgeRefinement("natural");
    }
    track("preset_selected", { platform: nextPlatform });
  }

  function chooseBackground(nextBackground: Background) {
    setBackground(nextBackground);
    if (nextBackground === "transparent" && format === "image/jpeg") {
      setFormat("image/png");
    }
    track("settings_changed", { setting: "background", value: nextBackground, platform });
  }

  function chooseBackgroundColor(nextColor: string) {
    setBackgroundColor(nextColor);
    window.sessionStorage.setItem("mainpic:background-color", nextColor);
    track("settings_changed", { setting: "background_color", platform });
  }

  function chooseEdgeRefinement(nextEdge: EdgeRefinement) {
    setEdgeRefinement(nextEdge);
    track("settings_changed", { setting: "edge_refinement", value: nextEdge, platform });
  }

  function chooseShadow(nextShadow: ShadowStyle) {
    setShadow(nextShadow);
    track("settings_changed", { setting: "shadow", value: nextShadow, platform });
  }

  function chooseOutputQuality(nextQuality: OutputQuality) {
    setOutputQuality(nextQuality);
    track("settings_changed", { setting: "output_quality", value: nextQuality, platform });
  }

  function applyQuickRecipe(recipe: QuickRecipe) {
    if (recipe === "amazon-clean") {
      setPlatform("amazon");
      setBackground("white");
      setCoverage(90);
      setFormat("image/jpeg");
      setEdgeRefinement("crisp");
      setShadow("none");
      setOutputQuality("high");
    }
    if (recipe === "soft-shadow") {
      setBackground("white");
      setCoverage(platform === "shopify" ? 86 : 88);
      setFormat("image/jpeg");
      setEdgeRefinement("natural");
      setShadow("soft");
      setOutputQuality("high");
    }
    if (recipe === "transparent") {
      setBackground("transparent");
      setFormat("image/png");
      setEdgeRefinement("detail");
      setShadow("none");
      setOutputQuality("high");
    }
    track("quick_recipe_selected", { recipe, platform });
  }

  function togglePackExport(presetId: ExportPresetId) {
    setSelectedPackExports((selected) =>
      selected.includes(presetId)
        ? selected.filter((id) => id !== presetId)
        : [...selected, presetId],
    );
    setPackMessage("");
  }

  async function downloadMarketplacePack() {
    const image = bitmapRef.current;
    const bounds = boundsRef.current;
    const selectedPresets = EXPORT_PRESETS.filter((preset) =>
      selectedPackExports.includes(preset.id),
    );
    if (!image || !bounds || selectedPresets.length === 0) return;

    setIsExportingPack(true);
    setPackMessage(`Building ${selectedPresets.length} export${selectedPresets.length === 1 ? "" : "s"}…`);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      for (const preset of selectedPresets) {
        const blob = await composeProductImage(image, bounds, {
          width: preset.width,
          height: preset.height,
          coverage: preset.coverage,
          background: preset.background,
          backgroundColor,
          format: preset.format,
          edgeRefinement,
          shadow: preset.id === "amazon" || preset.id === "transparent" ? "none" : shadow,
          quality: outputQuality === "high" ? 0.96 : 0.88,
        });
        zip.file(
          `${safeSkuName}-${preset.suffix}.${getOutputExtension(preset.format)}`,
          blob,
        );
      }

      zip.file(
        `${safeSkuName}-readme.txt`,
        [
          "MainPic marketplace export pack",
          "",
          `SKU: ${safeSkuName}`,
          ...selectedPresets.map((preset) => `${preset.label}: ${preset.detail}`),
          "",
          "Marketplace checks are based on public guidance and do not guarantee approval.",
        ].join("\n"),
      );
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      downloadBlob(zipBlob, `${safeSkuName}-marketplace-pack.zip`);
      setPackMessage(
        `${selectedPresets.length} image${selectedPresets.length === 1 ? "" : "s"} packaged locally.`,
      );
      track("marketplace_pack_downloaded", {
        exportCount: selectedPresets.length,
        presets: selectedPresets.map((preset) => preset.id).join(","),
      });
    } catch (caught) {
      setPackMessage(
        caught instanceof Error
          ? caught.message
          : "The browser could not create the export pack.",
      );
    } finally {
      setIsExportingPack(false);
    }
  }

  const isResultReady = status === "demo" || status === "ready";
  const hasProcessedCutout = cutoutVersion > 0 && status === "ready";
  const isAmazon = platform === "amazon";
  const longestEdge = Math.max(outputSize.width, outputSize.height);
  const cutoutScale = cutoutInfo
    ? Math.min(
        (outputSize.width * (coverage / 100)) / cutoutInfo.boundsWidth,
        (outputSize.height * (coverage / 100)) / cutoutInfo.boundsHeight,
      )
    : null;
  const activeRecipe: QuickRecipe | null =
    platform === "amazon" &&
    background === "white" &&
    coverage === 90 &&
    format === "image/jpeg" &&
    edgeRefinement === "crisp" &&
    shadow === "none"
      ? "amazon-clean"
      : background === "white" && shadow === "soft"
        ? "soft-shadow"
        : background === "transparent" &&
            format === "image/png" &&
            edgeRefinement === "detail" &&
            shadow === "none"
          ? "transparent"
          : null;
  const complianceItems: ComplianceItem[] = [
    {
      label: platform === "amazon" ? "Pure white background" : "Selected background applied",
      detail: isAmazon && background !== "white" ? "Amazon main images should use pure white." : "Background preset applied.",
      status: isAmazon && background !== "white" ? "fail" : "pass",
    },
    {
      label: `${outputSize.width} × ${outputSize.height}`,
      detail: !isAmazon || longestEdge >= 1600 ? "Recommended output size." : longestEdge >= 1000 ? "Meets the minimum; 1600px is recommended." : "Increase the longest edge to at least 1000px.",
      status: !isAmazon || longestEdge >= 1600 ? "pass" : longestEdge >= 1000 ? "warning" : "fail",
    },
    {
      label: "Product fully visible",
      detail: isResultReady ? "Alpha bounds remain inside the canvas." : "Waiting for a finished result.",
      status: isResultReady ? "pass" : "warning",
    },
    {
      label: cutoutInfo
        ? `Cutout ${cutoutInfo.width} × ${cutoutInfo.height}`
        : "Edge resolution check",
      detail:
        cutoutScale === null
          ? "Upload an image to measure edge enlargement."
          : cutoutScale <= 1.25
            ? "Source pixels are sufficient for this output size."
            : `${cutoutScale.toFixed(1)}× enlargement may soften fine edges. Try a larger source photo.`,
      status:
        cutoutScale === null
          ? "manual"
          : cutoutScale <= 1.25
            ? "pass"
            : "warning",
    },
    {
      label: `${coverage}% frame coverage`,
      detail: coverage >= 85 && coverage <= 95 ? "Within the suggested Amazon range." : "Aim for roughly 85%–95% frame coverage.",
      status: !isAmazon || (coverage >= 85 && coverage <= 95) ? "pass" : "warning",
    },
    {
      label: `${extension.toUpperCase()} · ${resultSize}`,
      detail: resultBytes <= 10 * 1024 * 1024 ? "Supported format and manageable file size." : "Reduce dimensions or quality before uploading.",
      status: !isResultReady ? "warning" : resultBytes <= 10 * 1024 * 1024 ? "pass" : "warning",
    },
    {
      label: background === "transparent" ? "Transparent pixels kept" : "No transparent background",
      detail: isAmazon && background === "transparent" ? "Amazon exports should convert transparency to white." : "Transparency matches the selected preset.",
      status: isAmazon && background === "transparent" ? "fail" : "pass",
    },
    ...(shadow === "none"
      ? []
      : [
          {
            label: shadow === "contact" ? "Contact shadow applied" : "Soft shadow applied",
            detail: "Artificial shadows should be reviewed against marketplace image rules.",
            status: "manual" as const,
          },
        ]),
    {
      label: "Text, border, and watermark review",
      detail: "Confirm these visually before publishing.",
      status: "manual",
    },
  ];
  const hasFailedCheck = complianceItems.some((item) => item.status === "fail");
  const readinessScore = Math.max(
    0,
    100 -
      complianceItems.filter((item) => item.status === "fail").length * 25 -
      complianceItems.filter((item) => item.status === "warning").length * 8,
  );
  const isPresetReady = isResultReady && !hasFailedCheck;

  return (
    <main>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="/" aria-label="MainPic home">
            <span className="brand-mark" aria-hidden="true" />
            MainPic
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <button className="button button-quiet" type="button" onClick={() => setDialogPlan("Account access")}>Sign in</button>
        </div>
      </header>

      <section className="hero shell">
        <div className="hero-copy">
          <h1>{hero.title}</h1>
          <p>{hero.subtitle}</p>
        </div>

        <div className="studio" id="tool">
          <section className="setup-pane" aria-label="Upload and platform preset">
            <div className="platform-tabs" role="tablist" aria-label="Sales platform">
              {(Object.keys(platformLabels) as Platform[]).map((item) => (
                <button
                  className={platform === item ? "platform-tab active" : "platform-tab"}
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={platform === item}
                  onClick={() => choosePlatform(item)}
                >
                  <PlatformMark platform={item} />
                  {platformLabels[item]}
                </button>
              ))}
            </div>

            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
            />
            <div
              className={isDragging ? "dropzone dragging" : "dropzone"}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <span className="upload-icon-wrap"><UploadIcon /></span>
              <strong>Drop a product photo here</strong>
              <span>{status === "validating" ? "Checking image…" : "JPG, PNG or WebP · up to 10 MB"}</span>
              <button
                className="button button-primary choose-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                {isResultReady && status !== "demo" ? "Choose another photo" : "Choose photo"}
              </button>
            </div>
            <div className="privacy-line" id="privacy"><LockIcon />Your images are processed securely and never stored.</div>
            <p className="free-usage" aria-live="polite">
              {successfulImages === 0
                ? `${FREE_IMAGE_LIMIT} free full-resolution test images in this session.`
                : `${successfulImages} of ${FREE_IMAGE_LIMIT} free test ${successfulImages === 1 ? "image" : "images"} used.`}
            </p>
            {turnstileMode === "required" ? (
              <TurnstileGate onToken={setTurnstileToken} resetKey={turnstileResetKey} />
            ) : null}
          </section>

          <section className="preview-pane" aria-label="Original and result preview">
            <div className="mobile-preview-toggle" role="group" aria-label="Preview image">
              <button className={previewMode === "original" ? "active" : ""} type="button" onClick={() => setPreviewMode("original")}>Original</button>
              <button className={previewMode === "result" ? "active" : ""} type="button" onClick={() => setPreviewMode("result")}>Result</button>
            </div>
            <div className="preview-grid">
              <PreviewFrame label="Original" imageUrl={originalUrl} mobileHidden={previewMode !== "original"} />
              <div className="preview-arrow"><ArrowIcon /></div>
              <PreviewFrame
                label={platform === "amazon" ? "Amazon-ready" : "Listing-ready"}
                note={`${background === "white" ? "White" : background === "transparent" ? "Transparent" : "Brand color"} · ${edgeLabels[edgeRefinement]} edge`}
                imageUrl={resultUrl}
                loading={status === "processing"}
                transparent={background === "transparent"}
                mobileHidden={previewMode !== "result"}
              />
            </div>
            <div className={isPresetReady ? "ready-line pass" : "ready-line"} aria-live="polite">
              {status === "validating" ? "Checking image…" : status === "processing" ? "Removing background…" : status === "error" ? "Needs attention" : isPresetReady ? `${platformLabels[platform]} preset ready` : "Review the failed checks"}
              {isPresetReady ? <CheckIcon small /> : null}
            </div>
            {status === "processing" ? <button className="cancel-button" type="button" onClick={cancelProcessing}>Cancel processing</button> : null}
            {error ? <p className="error-message" role="alert">{error}</p> : null}
          </section>

          <aside className="settings-pane" aria-label="Output settings">
            <div className="quick-recipes control-block">
              <span className="control-label">Quick tasks</span>
              <div className="recipe-options" aria-label="Quick task presets">
                <button
                  type="button"
                  className={activeRecipe === "amazon-clean" ? "active" : ""}
                  aria-pressed={activeRecipe === "amazon-clean"}
                  onClick={() => applyQuickRecipe("amazon-clean")}
                >
                  Amazon clean
                </button>
                <button
                  type="button"
                  className={activeRecipe === "soft-shadow" ? "active" : ""}
                  aria-pressed={activeRecipe === "soft-shadow"}
                  onClick={() => applyQuickRecipe("soft-shadow")}
                >
                  Soft shadow
                </button>
                <button
                  type="button"
                  className={activeRecipe === "transparent" ? "active" : ""}
                  aria-pressed={activeRecipe === "transparent"}
                  onClick={() => applyQuickRecipe("transparent")}
                >
                  Transparent
                </button>
              </div>
            </div>

            <fieldset>
              <legend>Background</legend>
              <div className="choice-stack">
                {(["white", "transparent", "color"] as Background[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={background === item ? "choice-row active" : "choice-row"}
                    onClick={() => chooseBackground(item)}
                  >
                    <span>{item === "white" ? "White" : item === "transparent" ? "Transparent" : "Brand color"}</span>
                    {item === "color" ? (
                      <span className="color-swatch" style={{ backgroundColor }} />
                    ) : null}
                  </button>
                ))}
              </div>
              {background === "color" ? (
                <label className="color-input-label">Color
                  <input type="color" value={backgroundColor} onChange={(event) => chooseBackgroundColor(event.target.value)} />
                </label>
              ) : null}
            </fieldset>

            <div className="size-control control-block">
              <label className="control-label" htmlFor="product-size">Product size <span>{coverage}%</span></label>
              <input
                id="product-size"
                className="range-input"
                type="range"
                min="70"
                max="95"
                step="1"
                value={coverage}
                onChange={(event) => setCoverage(Number(event.target.value))}
                onPointerUp={() => track("settings_changed", { setting: "coverage", value: coverage, platform })}
                onKeyUp={() => track("settings_changed", { setting: "coverage", value: coverage, platform })}
              />
            </div>

            <div className="enhance-block control-block">
              <span className="control-label">Edge & detail</span>
              <div className="segmented-setting" aria-label="Edge refinement">
                {(Object.keys(edgeLabels) as EdgeRefinement[]).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={edgeRefinement === item ? "active" : ""}
                    aria-pressed={edgeRefinement === item}
                    onClick={() => chooseEdgeRefinement(item)}
                  >
                    {edgeLabels[item]}
                  </button>
                ))}
              </div>

              <span className="control-label compact-label">Shadow</span>
              <div className="segmented-setting" aria-label="Product shadow">
                {(Object.keys(shadowLabels) as ShadowStyle[]).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={shadow === item ? "active" : ""}
                    aria-pressed={shadow === item}
                    onClick={() => chooseShadow(item)}
                  >
                    {shadowLabels[item]}
                  </button>
                ))}
              </div>

              <span className="control-label compact-label">Export quality</span>
              <div className="segmented-setting two-up" aria-label="Export quality">
                {(["standard", "high"] as OutputQuality[]).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={outputQuality === item ? "active" : ""}
                    aria-pressed={outputQuality === item}
                    onClick={() => chooseOutputQuality(item)}
                  >
                    {item === "standard" ? "Standard" : "High"}
                  </button>
                ))}
              </div>

              <div
                className={
                  cutoutScale === null
                    ? "quality-diagnostic"
                    : cutoutScale <= 1.25
                      ? "quality-diagnostic pass"
                      : "quality-diagnostic warning"
                }
                aria-live="polite"
              >
                <strong>{cutoutScale === null ? "Quality check ready" : cutoutScale <= 1.25 ? "Source resolution looks strong" : "Source enlargement detected"}</strong>
                <span>
                  {cutoutInfo && cutoutScale !== null
                    ? `${cutoutInfo.width} × ${cutoutInfo.height} cutout · ${cutoutScale.toFixed(1)}× render scale`
                    : "Upload a photo to measure edge sharpness."}
                </span>
              </div>
            </div>

            <div className="control-block">
              <span className="control-label">Output</span>
              {platform === "custom" ? (
                <div className="custom-size">
                  <input aria-label="Square output size" type="number" min="500" max="5000" value={customSize} onChange={(event) => setCustomSize(Number(event.target.value))} />
                  <span>× {outputSize.height}</span>
                </div>
              ) : (
                <div className="static-select">{outputSize.width} × {outputSize.height}</div>
              )}
              <div className="format-options" aria-label="Download format">
                {(["image/jpeg", "image/png", "image/webp"] as OutputFormat[]).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={format === item ? "active" : ""}
                    onClick={() => {
                      setFormat(item);
                      if (item === "image/jpeg" && background === "transparent") setBackground("white");
                      track("settings_changed", { setting: "format", value: item, platform });
                    }}
                  >
                    {getOutputExtension(item).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="checklist">
              <div className="checklist-heading">
                <strong>{isAmazon ? "Amazon readiness" : "Export readiness"}</strong>
                <span>{readinessScore}/100</span>
              </div>
              {complianceItems.map((item) => (
                <div className={`check-row ${item.status}`} key={item.label} title={item.detail}>
                  <StatusIcon status={item.status} />
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </div>
              ))}
            </div>

          </aside>

          <section className="download-dock" aria-label="Download images">
            <div className="download-dock-heading">
              <div>
                <span className="feature-kicker">Ready to export</span>
                <strong>Download your listing images</strong>
              </div>
              <span className="local-badge">Processed locally</span>
            </div>

            <div className="download-dock-controls">
              <label className="sku-field">
                <span>SKU / filename</span>
                <input
                  type="text"
                  value={skuName}
                  maxLength={64}
                  placeholder="sku-123"
                  onChange={(event) => {
                    setSkuName(event.target.value);
                    setPackMessage("");
                  }}
                />
              </label>

              <div className="pack-options" aria-label="Marketplace pack contents">
                {EXPORT_PRESETS.map((preset) => (
                  <label className="pack-option" key={preset.id}>
                    <input
                      type="checkbox"
                      checked={selectedPackExports.includes(preset.id)}
                      onChange={() => togglePackExport(preset.id)}
                    />
                    <span>
                      <strong>{preset.label}</strong>
                      <small>{preset.detail}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="download-actions">
              {resultUrl && isResultReady ? (
                <a
                  className="button button-primary download-button"
                  href={resultUrl}
                  download={downloadName}
                  onClick={() =>
                    track("image_downloaded", {
                      platform,
                      format,
                      coverage,
                      edgeRefinement,
                      shadow,
                      outputQuality,
                    })
                  }
                >
                  <DownloadIcon /> Download current {extension.toUpperCase()}
                </a>
              ) : (
                <button className="button button-primary download-button" type="button" disabled>
                  <DownloadIcon /> Download current image
                </button>
              )}

              <button
                className="button button-pack"
                type="button"
                disabled={
                  !hasProcessedCutout ||
                  selectedPackExports.length === 0 ||
                  isExportingPack
                }
                onClick={() => void downloadMarketplacePack()}
              >
                <DownloadIcon />
                {isExportingPack ? "Building ZIP…" : "Download marketplace ZIP"}
              </button>
            </div>

            <p className="pack-note" aria-live="polite">
              {packMessage ||
                (hasProcessedCutout
                  ? "One cutout, every selected size. No extra API credits."
                  : "Upload a photo to unlock both download options.")}
            </p>
          </section>
        </div>

        <div className="trust-band">
          <div className="trust-lead">Built for sellers who need<br />compliant images, fast.</div>
          <TrustItem title="Amazon-focused">Practical checks for the main image requirements.</TrustItem>
          <TrustItem title="Multi-channel pack">Amazon, Shopify, and transparent files from one cutout.</TrustItem>
          <TrustItem title="Secure and private">Images are processed for the request, not archived.</TrustItem>
        </div>
      </section>

      <section className="workflow-section shell" id="how-it-works">
        <div className="section-heading">
          <h2>No canvas. No guesswork.</h2>
          <p>Choose where you sell. We apply the crop, background, sizing, and checks for you.</p>
        </div>
        <div className="workflow-steps">
          <WorkflowStep number="1" title="Upload your photo">Use a phone shot in JPG, PNG, or WebP.</WorkflowStep>
          <WorkflowStep number="2" title="Choose a preset">
            <div className="mini-presets">
              <span className="selected"><PlatformMark platform="amazon" />Amazon <CheckIcon small /></span>
              <span><PlatformMark platform="shopify" />Shopify</span>
              <span><PlatformMark platform="custom" />Custom</span>
            </div>
          </WorkflowStep>
          <WorkflowStep number="3" title="Download and list">
            <div className="file-receipt">
              <strong>sku-104-marketplace-pack.zip</strong>
              <span>Amazon · Shopify · transparent</span>
              <span><CheckIcon small />Ready-named files · one click</span>
            </div>
          </WorkflowStep>
        </div>

        <div className="comparison">
          <figure>
            <figcaption>Before</figcaption>
            <img src="/sample-before.jpg" alt="A cordless drill photographed on a kitchen counter" />
          </figure>
          <span className="comparison-handle" aria-hidden="true">‹ ›</span>
          <figure>
            <figcaption>After</figcaption>
            <img src="/sample-after.jpg" alt="The same cordless drill centered on a white background" />
          </figure>
        </div>
        <p className="guideline-note" id="amazon-guide">Checks are based on public platform guidelines and do not guarantee listing approval.</p>
        <a className="text-link" href="#tool">Make an Amazon-ready image <span>→</span></a>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="shell">
          <div className="section-heading centered">
            <h2>Simple pricing. Pay only for what you need.</h2>
            <p>Every credit makes one listing-ready product image. No subscription required.</p>
          </div>
          <div className="pricing-rail">
            {pricingPlans.map((plan) => (
              <article className={plan.featured ? "price-column featured" : "price-column"} key={plan.name}>
                <h3>{plan.name}</h3>
                <div className="price">{plan.price}</div>
                <div className="price-rule" />
                <strong>{plan.images}</strong>
                <span>{plan.unit || "Full-resolution trial"}</span>
                <button
                  className={plan.featured ? "button button-primary" : "button button-outline"}
                  type="button"
                  onClick={() => {
                    if (plan.name === "Free") document.getElementById("tool")?.scrollIntoView({ behavior: "smooth" });
                    else setDialogPlan(plan.name);
                  }}
                >
                  {plan.cta}
                </button>
              </article>
            ))}
          </div>
          <p className="credit-note">A credit is used only when an image is processed successfully. Failed jobs are automatically refunded.</p>
          <div className="included-row">
            <span><CheckIcon small />Amazon &amp; Shopify presets</span>
            <span><CheckIcon small />SKU naming &amp; local ZIP packs</span>
            <span><CheckIcon small />JPG, PNG &amp; WebP · no watermarks</span>
          </div>
        </div>
      </section>

      <section className="faq-section shell" id="faq">
        <h2>Frequently asked questions</h2>
        <div className="faq-list">
          {FAQ_ITEMS.map((item, index) => (
            <details key={item.question} open={index === 0}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="closing shell">
        <h2>Your next listing starts with one photo.</h2>
        <button className="button button-primary" type="button" onClick={() => document.getElementById("tool")?.scrollIntoView({ behavior: "smooth" })}>Make an Amazon-ready image</button>
      </section>

      <footer className="site-footer shell">
        <div><a className="brand" href="/"><span className="brand-mark" aria-hidden="true" />MainPic</a><p>Marketplace image delivery for small ecommerce teams.</p></div>
        <nav aria-label="Footer navigation">
          <a href="/">Amazon Product Photo Maker</a>
          <a href="/image-background-remover">Image Background Remover</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
        </nav>
      </footer>

      {dialogPlan ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setDialogPlan(null)}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" type="button" aria-label="Close" onClick={() => setDialogPlan(null)}>×</button>
            <h2 id="dialog-title">{dialogPlan === "Account access" ? "Accounts are coming with checkout." : dialogPlan === "Free limit" ? "Your free test is complete." : `${dialogPlan} early access`}</h2>
            <p>The editor is ready to test now. Email login, credit packs, and automatic refunds belong to the paid milestone and are intentionally not simulated in this P0 build.</p>
            <button className="button button-primary" type="button" onClick={() => {
              setDialogPlan(null);
              document.getElementById("tool")?.scrollIntoView({ behavior: "smooth" });
            }}>Try the free editor</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function PreviewFrame({
  label,
  note,
  imageUrl,
  loading = false,
  transparent = false,
  mobileHidden = false,
}: {
  label: string;
  note?: string;
  imageUrl: string;
  loading?: boolean;
  transparent?: boolean;
  mobileHidden?: boolean;
}) {
  return (
    <figure className={mobileHidden ? "preview-card mobile-hidden" : "preview-card"}>
      <figcaption><strong>{label}</strong>{note ? <span>{note}</span> : null}</figcaption>
      <div className={transparent ? "preview-image checkerboard" : "preview-image"}>
        <span className="ruler ruler-top" aria-hidden="true" />
        <span className="ruler ruler-left" aria-hidden="true" />
        {loading ? <span className="processing-spinner" aria-label="Processing image" /> : imageUrl ? <img src={imageUrl} alt={`${label} product preview`} /> : <span className="empty-preview">Result will appear here</span>}
      </div>
    </figure>
  );
}

function TrustItem({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="trust-item"><span className="trust-dot"><CheckIcon small /></span><div><strong>{title}</strong><p>{children}</p></div></div>;
}

function WorkflowStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <article className="workflow-step"><span className="step-number">{number}</span><h3>{title}</h3>{typeof children === "string" ? <p>{children}</p> : children}</article>;
}
