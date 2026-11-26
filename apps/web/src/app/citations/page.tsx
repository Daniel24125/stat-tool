import Link from "next/link";

// Placeholder: Phase 6 builds this from the stats service's /v1/meta/versions
// and the methods each analysis run actually used.
export default function CitationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800">← Dashboard</Link>
      <h1 className="mt-2 text-2xl font-semibold">Citing StatTool</h1>
      <p className="mt-2 text-slate-600">
        A full citation page with BibTeX/APA entries for every library and an auto-generated methods paragraph is coming in a later phase.
      </p>
    </main>
  );
}
