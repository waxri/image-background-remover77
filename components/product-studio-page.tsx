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
  findAlphaBounds,
  getOutputExtension,
  OutputFormat,
} from "@/lib/image-pipeline";

type Platform = "amazon" | "shopify" | "custom";
type Background = "white" | "transparent" | "color";
type ProcessStatus = "demo" | "processing" | "ready" | "error";

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
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const platformLabels: Record<Platform, string> = {
  amazon: "Amazon",
  shopify: "Shopify",
  custom: "Custom",
};

const pricingPlans = [
  { name: "Free", price: "$0", images: "3 images", cta: "Try it free" },
  {
    name: "Starter",
    price: "$5.90",
    images: "40 images",
    unit: "$0.15 / image",
    cta: "Buy 40 credits",
  },
  {
    name: "Seller",
    price: "$12.90",
    images: "120 images",
    unit: "$0.11 / image",
    cta: "Buy 120 credits",
    featured: true,
  },
  {
    name: "Growth",
    price: "$24.90",
    images: "300 images",
    unit: "$0.08 / image",
    cta: "Buy 300 credits",
  },
];

const faqItems = [
  {
    question: "Do you store my product photos?",
    answer:
      "No. Images are processed for the current request and are not kept in a permanent library.",
  },
  {
    question: "Does this guarantee Amazon approval?",
    answer:
      "No. The checker applies practical tests based on public platform guidelines. Amazon may also review category-specific and listing-level requirements.",
  },
  {
    question: "Can I download a transparent PNG?",
    answer:
      "Yes. Choose Transparent in the background controls and the output automatically switches to PNG.",
  },
  {
    question: "What products work best?",
    answer:
      "Products with clear, opaque outlines work best: home goods, packaged items, tools, toys, and electronics accessories.",
  },
];

function track(event: string, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = { event, ...properties };
  window.dataLayer?.push(payload);
  window.dispatchEvent(new CustomEvent("listingready:analytics", { detail: payload }));
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
        'script[data-listingready-turnstile="true"]',
      );
      if (existing) {
        existing.addEventListener("load", renderWidget, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.listingreadyTurnstile = "true";
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
  return <div ref={containerRef} className="turnstile-slot" aria-hidden="true" />;
}

export function ProductStudioPage({ variant }: ProductStudioPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const boundsRef = useRef<AlphaBounds | null>(null);
  const originalObjectUrlRef = useRef<string | null>(null);
  const resultObjectUrlRef = useRef<string | null>(null);
  const renderVersionRef = useRef(0);

  const [platform, setPlatform] = useState<Platform>("amazon");
  const [background, setBackground] = useState<Background>("white");
  const [backgroundColor, setBackgroundColor] = useState("#e8f0ff");
  const [coverage, setCoverage] = useState(90);
  const [format, setFormat] = useState<OutputFormat>("image/jpeg");
  const [customWidth, setCustomWidth] = useState(1200);
  const [customHeight, setCustomHeight] = useState(1200);
  const [status, setStatus] = useState<ProcessStatus>("demo");
  const [isDragging, setIsDragging] = useState(false);
  const [sourceName, setSourceName] = useState("drill");
  const [originalUrl, setOriginalUrl] = useState("/sample-before.jpg");
  const [resultUrl, setResultUrl] = useState("/sample-after.jpg");
  const [resultSize, setResultSize] = useState("1.1 MB");
  const [error, setError] = useState("");
  const [cutoutVersion, setCutoutVersion] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [dialogPlan, setDialogPlan] = useState<string | null>(null);

  const outputSize = useMemo(() => {
    if (platform === "amazon") return { width: 1600, height: 1600 };
    if (platform === "shopify") return { width: 2048, height: 2048 };
    return {
      width: Math.min(5000, Math.max(500, customWidth || 500)),
      height: Math.min(5000, Math.max(500, customHeight || 500)),
    };
  }, [customHeight, customWidth, platform]);

  const extension = getOutputExtension(format);
  const downloadName = `${baseFileName(sourceName)}-main-${platform}.${extension}`;
  const hero =
    variant === "background"
      ? {
          title: "Product backgrounds, removed and ready.",
          subtitle:
            "Create a transparent cutout or a marketplace-ready white background image in one short workflow.",
        }
      : {
          title: "Amazon product photos, ready to list.",
          subtitle:
            "Turn an ordinary product shot into a compliant white-background image—centered, sized, and checked.",
        };

  useEffect(() => {
    return () => {
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
      })
        .then((blob) => {
          if (cancelled || renderVersion !== renderVersionRef.current) return;
          const nextUrl = URL.createObjectURL(blob);
          if (resultObjectUrlRef.current) URL.revokeObjectURL(resultObjectUrlRef.current);
          resultObjectUrlRef.current = nextUrl;
          setResultUrl(nextUrl);
          setResultSize(formatBytes(blob.size));
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
  }, [background, backgroundColor, coverage, cutoutVersion, format, outputSize]);

  function validateFile(file: File) {
    if (!ACCEPTED_TYPES.has(file.type)) return "Please upload a JPG, PNG, or WebP image.";
    if (file.size > MAX_FILE_SIZE) return "Please upload an image smaller than 10 MB.";
    return "";
  }

  async function processFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setStatus("error");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Security check is still loading. Please try again in a moment.");
      setStatus("error");
      return;
    }

    track("image_upload_started", { platform, type: file.type, bytes: file.size });
    setError("");
    setStatus("processing");
    setSourceName(file.name);

    if (originalObjectUrlRef.current) URL.revokeObjectURL(originalObjectUrlRef.current);
    const nextOriginalUrl = URL.createObjectURL(file);
    originalObjectUrlRef.current = nextOriginalUrl;
    setOriginalUrl(nextOriginalUrl);
    setResultUrl("");

    const formData = new FormData();
    formData.append("image", file);
    if (turnstileToken) formData.append("turnstileToken", turnstileToken);

    try {
      const response = await fetch("/api/remove-bg", { method: "POST", body: formData });
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Background removal failed. Please try another photo.");
      }

      const cutout = await response.blob();
      const bitmap = await createImageBitmap(cutout);
      const bounds = await findAlphaBounds(bitmap);
      bitmapRef.current?.close();
      bitmapRef.current = bitmap;
      boundsRef.current = bounds;
      setCutoutVersion((version) => version + 1);
      track("background_removal_succeeded", { platform });
    } catch (caught) {
      if (TURNSTILE_SITE_KEY) {
        setTurnstileToken("");
        setTurnstileResetKey((key) => key + 1);
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "The service is temporarily unavailable. Please try again.",
      );
      setStatus("error");
      track("background_removal_failed", { platform });
    }
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
    setCoverage(90);
    if (nextPlatform === "amazon") {
      setBackground("white");
      setFormat("image/jpeg");
    }
    if (nextPlatform === "shopify") setFormat("image/png");
    track("preset_selected", { platform: nextPlatform });
  }

  function chooseBackground(nextBackground: Background) {
    setBackground(nextBackground);
    if (nextBackground === "transparent" && format === "image/jpeg") {
      setFormat("image/png");
    }
  }

  const isResultReady = status === "demo" || status === "ready";
  const complianceItems = [
    {
      label: platform === "amazon" ? "Pure white background" : "Selected background applied",
      pass: platform !== "amazon" || background === "white",
    },
    {
      label: `${outputSize.width} × ${outputSize.height}`,
      pass: platform !== "amazon" || Math.max(outputSize.width, outputSize.height) >= 1000,
    },
    { label: "Product fully visible", pass: isResultReady },
    { label: `${coverage}% frame coverage`, pass: coverage >= 85 && coverage <= 95 },
    { label: `${extension.toUpperCase()} · ${resultSize}`, pass: isResultReady },
    {
      label: background === "transparent" ? "Transparent pixels kept" : "No transparent background",
      pass: platform !== "amazon" || background !== "transparent",
    },
  ];
  const allChecksPass = complianceItems.every((item) => item.pass) && isResultReady;

  return (
    <main>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="/" aria-label="ListingReady home">
            <span className="brand-mark" aria-hidden="true" />
            ListingReady
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#amazon-guide">Amazon image guide</a>
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
              <span>JPG, PNG or WebP · up to 10 MB</span>
              <button
                className="button button-primary choose-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Choose photo
              </button>
            </div>
            <div className="privacy-line" id="privacy"><LockIcon />Your images are processed securely and never stored.</div>
            <TurnstileGate onToken={setTurnstileToken} resetKey={turnstileResetKey} />
          </section>

          <section className="preview-pane" aria-label="Original and result preview">
            <div className="preview-grid">
              <PreviewFrame label="Original" imageUrl={originalUrl} />
              <div className="preview-arrow"><ArrowIcon /></div>
              <PreviewFrame
                label={platform === "amazon" ? "Amazon-ready" : "Listing-ready"}
                note={background === "white" ? "White background" : background === "transparent" ? "Transparent" : "Brand color"}
                imageUrl={resultUrl}
                loading={status === "processing"}
                transparent={background === "transparent"}
              />
            </div>
            <div className={allChecksPass ? "ready-line pass" : "ready-line"} aria-live="polite">
              {status === "processing" ? "Removing background…" : status === "error" ? "Needs attention" : allChecksPass ? `${platformLabels[platform]}-ready` : "Adjust settings"}
              {allChecksPass ? <CheckIcon small /> : null}
            </div>
            {error ? <p className="error-message" role="alert">{error}</p> : null}
          </section>

          <aside className="settings-pane" aria-label="Output settings">
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
                  <input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} />
                </label>
              ) : null}
            </fieldset>

            <label className="control-label" htmlFor="product-size">Product size <span>{coverage}%</span></label>
            <input
              id="product-size"
              className="range-input"
              type="range"
              min="75"
              max="95"
              step="1"
              value={coverage}
              onChange={(event) => setCoverage(Number(event.target.value))}
            />

            <div className="control-block">
              <span className="control-label">Output</span>
              {platform === "custom" ? (
                <div className="custom-size">
                  <input aria-label="Output width" type="number" min="500" max="5000" value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} />
                  <span>×</span>
                  <input aria-label="Output height" type="number" min="500" max="5000" value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} />
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
                    }}
                  >
                    {getOutputExtension(item).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="checklist">
              <strong>Compliance checklist</strong>
              {complianceItems.map((item) => (
                <div className={item.pass ? "check-row pass" : "check-row warn"} key={item.label}>
                  <CheckIcon small />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            {resultUrl && isResultReady ? (
              <a
                className="button button-primary download-button"
                href={resultUrl}
                download={downloadName}
                onClick={() => track("image_downloaded", { platform, format, coverage })}
              >
                <DownloadIcon /> Download {extension.toUpperCase()}
              </a>
            ) : (
              <button className="button button-primary download-button" type="button" disabled>
                <DownloadIcon /> Download
              </button>
            )}
          </aside>
        </div>

        <div className="trust-band">
          <div className="trust-lead">Built for sellers who need<br />compliant images, fast.</div>
          <TrustItem title="Amazon-compliant">Practical checks for the main image requirements.</TrustItem>
          <TrustItem title="Save time">Upload, adjust, check, and download in one place.</TrustItem>
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
              <strong>drill-main-amazon.jpg</strong>
              <span>JPG · 1.1 MB</span>
              <span><CheckIcon small />Pure white · 1600 × 1600</span>
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
        <a className="text-link" href="#tool">Read the Amazon image guide <span>→</span></a>
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
            <span><CheckIcon small />JPG, PNG &amp; WebP downloads</span>
            <span><CheckIcon small />No watermarks</span>
          </div>
        </div>
      </section>

      <section className="faq-section shell" id="faq">
        <h2>Frequently asked questions</h2>
        <div className="faq-list">
          {faqItems.map((item, index) => (
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
        <div><a className="brand" href="/"><span className="brand-mark" aria-hidden="true" />ListingReady</a><p>Built for small ecommerce teams.</p></div>
        <nav aria-label="Footer navigation">
          <a href="/">Amazon Product Photo Maker</a>
          <a href="/image-background-remover">Image Background Remover</a>
          <a href="#privacy">Privacy</a>
          <a href="#faq">Terms</a>
        </nav>
      </footer>

      {dialogPlan ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setDialogPlan(null)}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" type="button" aria-label="Close" onClick={() => setDialogPlan(null)}>×</button>
            <h2 id="dialog-title">{dialogPlan === "Account access" ? "Accounts are coming with checkout." : `${dialogPlan} checkout is next.`}</h2>
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
}: {
  label: string;
  note?: string;
  imageUrl: string;
  loading?: boolean;
  transparent?: boolean;
}) {
  return (
    <figure className="preview-card">
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
