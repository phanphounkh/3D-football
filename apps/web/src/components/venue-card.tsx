import Link from "next/link";
import { MapPin } from "lucide-react";
import type { VenueSummary } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/feedback";

/** Procedural cover: deterministic gradient + pitch outline, so no stock photos are needed until owners upload some. */
export function VenueCover({ seed, className = "" }: { seed: string; className?: string }) {
  const hue = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 40;
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(135deg, hsl(${140 + hue} 55% 22%), hsl(${150 + hue} 60% 12%))` }}>
      <svg viewBox="0 0 160 100" className="absolute inset-0 h-full w-full opacity-30" aria-hidden>
        <g fill="none" stroke="#fff" strokeWidth="1.2">
          <rect x="10" y="10" width="140" height="80" /><line x1="80" y1="10" x2="80" y2="90" />
          <circle cx="80" cy="50" r="13" /><rect x="10" y="30" width="22" height="40" /><rect x="128" y="30" width="22" height="40" />
        </g>
      </svg>
    </div>
  );
}

export function VenueCard({ venue }: { venue: VenueSummary }) {
  return (
    <Link href={`/venues/${venue.slug}`} className="group overflow-hidden rounded-[var(--radius-card)] border border-line bg-ink-900 transition hover:-translate-y-0.5 hover:border-pitch-500/50">
      <VenueCover seed={venue.slug} className="h-40" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-bold leading-tight group-hover:text-pitch-400">{venue.name}</h3>
          <p className="shrink-0 text-right text-sm"><span className="text-mute">from </span><span className="font-semibold text-pitch-400">{formatUsd(venue.from_price_minor)}</span><span className="text-mute">/h</span></p>
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-mute"><MapPin size={14} />{venue.city} · {venue.address}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {venue.field_types.map((t) => <Badge key={t} tone="green">{t}</Badge>)}
        </div>
        <p className="mt-3 line-clamp-1 text-xs text-mute">{venue.facilities.map((f) => f.name).join(" · ")}</p>
      </div>
    </Link>
  );
}

export function VenueCardSkeleton() {
  return <div aria-hidden className="h-[22rem] animate-pulse rounded-[var(--radius-card)] bg-ink-900" />;
}
