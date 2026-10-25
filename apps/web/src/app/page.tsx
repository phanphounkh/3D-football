import Link from "next/link";
import { searchVenues } from "@/lib/api";
import { VenueCard } from "@/components/venue-card";
import { FieldViewerLazy } from "@/components/field3d/field-viewer-lazy";

const steps = [
  { n: "01", t: "Find a venue", d: "Search by area, surface, size and price." },
  { n: "02", t: "Explore in 3D", d: "Walk the pitch before you pay for it." },
  { n: "03", t: "Lock your slot", d: "Live availability, held while you check out." },
];

export default async function Home() {
  const featured = await searchVenues(new URLSearchParams({ page_size: "3", sort: "price_desc" })).then((p) => p.items).catch(() => []);
  return (
    <>
      <section className="relative overflow-hidden bg-[radial-gradient(60%_60%_at_80%_0%,rgba(16,208,129,0.18),transparent)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:items-center lg:py-20">
          <div>
            <p className="mb-4 inline-block rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-widest text-pitch-400">Phnom Penh · Siem Reap · Battambang</p>
            <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
              Your pitch. <span className="text-pitch-400">Your time.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-mute">Discover football fields near you, inspect them in interactive 3D, and book in seconds.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/explore" className="rounded-full bg-pitch-500 px-6 py-3 font-semibold text-ink-950 transition hover:bg-pitch-400">Explore fields</Link>
              <Link href="/register?role=owner" className="rounded-full border border-line px-6 py-3 font-semibold transition hover:bg-ink-800">List your venue</Link>
            </div>
          </div>
          <FieldViewerLazy className="h-[420px] sm:h-[520px] lg:h-[560px]" />
        </div>
      </section>
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-3xl font-bold">Featured venues</h2>
            <Link href="/explore" className="text-sm text-pitch-400 hover:underline">See all →</Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">{featured.map((v) => <VenueCard key={v.id} venue={v} />)}</div>
        </section>
      )}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="rounded-[var(--radius-card)] border border-line bg-ink-900 p-6">
              <span className="font-display text-3xl font-bold text-pitch-500">{s.n}</span>
              <h2 className="mt-2 text-lg font-semibold">{s.t}</h2>
              <p className="mt-1 text-sm text-mute">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
