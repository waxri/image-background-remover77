"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Status = "idle" | "ready" | "processing" | "success" | "error";

type PreviewState = {
  fileName: string;
  originalUrl: string;
  resultUrl: string | null;
};

const faqItems = [
  {
    question: "Do you store my uploaded images?",
    answer:
      "No. Images are sent only for the current background removal request and are not stored by this website.",
  },
  {
    question: "What image formats are supported?",
    answer: "You can upload JPG, PNG, or WebP images up to 10 MB for the MVP.",
  },
  {
    question: "Can I download a transparent PNG?",
    answer: "Yes. Successful background removals are returned as PNG files with transparency.",
  },
];

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const canDownload = status === "success" && preview?.resultUrl;
  const helperText = useMemo(() => {
    if (status === "processing") return "Removing the background...";
    if (status === "success") return "Your transparent PNG is ready.";
    if (status === "error") return error;
    return "PNG, JPG, WebP up to 10 MB";
  }, [error, status]);

  function resetResult() {
    if (preview?.originalUrl) URL.revokeObjectURL(preview.originalUrl);
    if (preview?.resultUrl) URL.revokeObjectURL(preview.resultUrl);
    setPreview(null);
    setStatus("idle");
    setError("");
  }

  function validateFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Please upload a JPG, PNG, or WebP image.";
    }

    if (file.size > MAX_FILE_SIZE) {
      return "The image is too large. Please upload an image under 10 MB.";
    }

    return "";
  }

  async function processFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      setStatus("error");
      setError(validationError);
      return;
    }

    if (preview?.originalUrl) URL.revokeObjectURL(preview.originalUrl);
    if (preview?.resultUrl) URL.revokeObjectURL(preview.resultUrl);

    const originalUrl = URL.createObjectURL(file);
    setPreview({
      fileName: file.name,
      originalUrl,
      resultUrl: null,
    });
    setError("");
    setStatus("processing");

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/remove-bg", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error || "Background removal failed. Please try again.",
        );
      }

      const blob = await response.blob();
      const resultUrl = URL.createObjectURL(blob);
      setPreview({
        fileName: file.name,
        originalUrl,
        resultUrl,
      });
      setStatus("success");
    } catch (caughtError) {
      setStatus("error");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Service is temporarily unavailable. Please try again later.",
      );
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

  function downloadResult() {
    if (!preview?.resultUrl) return;

    const link = document.createElement("a");
    link.href = preview.resultUrl;
    link.download = `removed-background-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-[#111827]">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a className="flex items-center gap-3 font-semibold" href="/">
            <span className="grid size-9 place-items-center rounded-lg bg-teal-600 text-white shadow-sm">
              <LogoIcon />
            </span>
            <span className="text-lg">BgRemover</span>
          </a>
          <nav className="hidden items-center gap-9 text-sm font-medium text-slate-700 md:flex">
            <a href="#how-it-works">How it works</a>
            <a href="#privacy">Privacy</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="button-secondary hidden md:inline-flex" href="#tool">
            Try it now
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-12 pt-12 sm:pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-balance text-4xl font-bold tracking-normal sm:text-5xl lg:text-6xl">
            Image Background Remover
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Upload an image and get a transparent PNG in seconds.
          </p>
        </div>

        <div
          id="tool"
          className="mt-10 grid gap-4 lg:grid-cols-[0.88fr_1.12fr]"
        >
          <section className="tool-panel p-5 sm:p-6">
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
            />
            <div
              className={`upload-zone ${isDragging ? "upload-zone-active" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
            >
              <ImagePlusIcon />
              <p className="mt-6 text-xl font-semibold">
                Drag & drop an image here
              </p>
              <p className="mt-2 text-sm text-slate-500">or</p>
              <button
                className="button-primary mt-4"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Choose Image
              </button>
              <p className="mt-5 text-sm font-medium text-slate-500">
                {helperText}
              </p>
            </div>

            <div
              id="privacy"
              className="mt-5 flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600"
            >
              <LockIcon />
              <span>Your images are private and not stored on our servers.</span>
            </div>
          </section>

          <section className="tool-panel p-5 sm:p-6">
            <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <PreviewCard
                label="Original"
                imageUrl={preview?.originalUrl}
                emptyText="Your uploaded image will appear here."
              />
              <div className="hidden rounded-full border border-slate-200 bg-white p-3 text-slate-500 shadow-sm md:block">
                <ArrowRightIcon />
              </div>
              <PreviewCard
                label="Result (Transparent PNG)"
                imageUrl={preview?.resultUrl}
                emptyText={
                  status === "processing"
                    ? "Processing your image..."
                    : "The transparent result will appear here."
                }
                checkerboard
                loading={status === "processing"}
              />
            </div>

            <div className="mx-auto mt-7 flex max-w-xl flex-col gap-3">
              <button
                className="button-primary h-12"
                type="button"
                onClick={downloadResult}
                disabled={!canDownload}
              >
                <DownloadIcon />
                Download PNG
              </button>
              <button
                className="button-secondary h-11"
                type="button"
                onClick={resetResult}
                disabled={status === "processing" && !preview}
              >
                Edit Again
              </button>
            </div>

            {status === "error" ? (
              <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}
          </section>
        </div>

        <section
          id="how-it-works"
          className="grid gap-4 py-9 sm:grid-cols-3"
          aria-label="Product benefits"
        >
          <Benefit
            icon={<ShieldIcon />}
            title="100% Private"
            text="Images are not stored by this website."
          />
          <Benefit
            icon={<BoltIcon />}
            title="Fast Processing"
            text="Results are usually ready in seconds."
          />
          <Benefit
            icon={<CheckIcon />}
            title="High Quality"
            text="Powered by Remove.bg API."
          />
        </section>

        <section id="faq" className="tool-panel p-5 sm:p-7">
          <h2 className="text-2xl font-bold">Frequently Asked Questions</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {faqItems.map((item) => (
              <details className="faq-card" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function PreviewCard({
  label,
  imageUrl,
  emptyText,
  checkerboard = false,
  loading = false,
}: {
  label: string;
  imageUrl?: string | null;
  emptyText: string;
  checkerboard?: boolean;
  loading?: boolean;
}) {
  return (
    <div>
      <p
        className={`mb-3 text-center text-sm font-semibold ${
          checkerboard ? "text-teal-700" : "text-slate-800"
        }`}
      >
        {label}
      </p>
      <div className={`preview-frame ${checkerboard ? "checkerboard" : ""}`}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={label} src={imageUrl} />
        ) : (
          <div className="grid place-items-center px-5 text-center text-sm text-slate-500">
            {loading ? <Spinner /> : emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function Benefit({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="text-teal-700">{icon}</div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-slate-600">{text}</p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="grid place-items-center gap-3">
      <span className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      <span>Processing your image...</span>
    </span>
  );
}

function LogoIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M7 4h7.5A5.5 5.5 0 0 1 20 9.5V17a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9 14.5 11.2 12l2.1 2.2 1.2-1.3 2.5 3.1H7l2-1.5Z"
        fill="currentColor"
      />
      <circle cx="9" cy="8.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ImagePlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mx-auto size-14 text-teal-700"
      fill="none"
      viewBox="0 0 48 48"
    >
      <path
        d="M8 12a4 4 0 0 1 4-4h16l12 12v16a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V12Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path d="M28 8v12h12" stroke="currentColor" strokeWidth="3" />
      <path
        d="M15 32l7-8 5 5 3-3 5 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <circle cx="18" cy="17" r="3" fill="currentColor" />
      <path
        d="M36 29v10M31 34h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 size-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6V10Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3 5 6v5c0 4.5 2.8 8.5 7 10 4.2-1.5 7-5.5 7-10V6l-7-3Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="m9 12 2 2 4-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 24 24">
      <path
        d="m13 2-8 12h6l-1 8 9-13h-6l0-7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="m8.5 12.5 2.3 2.3 4.8-5.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
