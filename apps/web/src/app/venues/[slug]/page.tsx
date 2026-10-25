import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { ApiError, getVenue } from "@/lib/api";
import { ErrorState } from "@/components/ui/feedback";
import { VenueFields } from "./venue-fields";
import { FavoriteButton } from "@/components/favorite-button";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  try {
    return { venue: await getVenue(slug) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  return { title: r.venue ? `${r.venue.name} — Pitchside` : "Venue — Pitchside" };
}

export default async function VenuePage({ params }: Props) {
  const { slug } = await params;
  const r = await load(slug);
  if (!r.venue) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState message={r.error ?? "Failed to load"} /></div>;
  const v = r.venue;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{v.name}</h1>
        <FavoriteButton venueId={v.id} name={v.name} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-mute"><MapPin size={16} />{v.address}, {v.city}</p>
      <div className="mt-8"><VenueFields fields={v.fields} /></div>
      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <section><h2 className="font-display text-2xl font-bold">About</h2><p className="mt-2 text-mute">{v.description}</p></section>
        <section>
          <h2 className="font-display text-2xl font-bold">Facilities</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {v.facilities.map((f) => <li key={f.code} className="rounded-full border border-line px-3 py-1.5 text-sm">{f.name}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
