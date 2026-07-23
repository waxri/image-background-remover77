import Link from "next/link";

type LegalPageProps = {
  title: string;
  intro: string;
  children: React.ReactNode;
};

export function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link className="text-xl font-extrabold tracking-[-0.04em]" href="/">
            MainPic
          </Link>
          <Link
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:border-blue-600 hover:text-blue-600"
            href="/"
          >
            Back to the editor
          </Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        <h1 className="text-4xl font-extrabold tracking-[-0.045em] sm:text-5xl">{title}</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">{intro}</p>
        <div className="mt-12 space-y-9 text-[15px] leading-7 text-slate-700 [&_a]:font-semibold [&_a]:text-blue-600 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-950 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
          {children}
        </div>
      </article>
    </main>
  );
}
