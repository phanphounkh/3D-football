"use client";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { List, Map as MapIcon, Search } from "lucide-react";
import { getFacilities, searchVenues } from "@/lib/api";
import { VenueCard, VenueCardSkeleton } from "@/components/venue-card";
import { Chip, Input, Label, Select } from "@/components/ui/form";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

const VenueMap = dynamic(() => import("@/components/venue-map"), { ssr: false, loading: () => <Skeleton className="h-[560px]" /> });
const CITIES = ["Phnom Penh", "Siem Reap", "Battambang", "Sihanoukville"];
const TYPES = ["5v5", "7v7", "11v11"];
const SURFACES = [["artificial", "Artificial"], ["natural", "Natural"], ["futsal", "Futsal"]];

export function ExploreClient() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const view = sp.get("view") === "map" ? "map" : "list";
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(false);

  const set = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!keepPage) next.delete("page");
    router.replace(`${path}?${next}`, { scroll: false });
  };
  const toggle = (key: string, val: string) => set({ [key]: sp.get(key) === val ? null : val });

  // debounce text search into the URL
  useEffect(() => {
    if (q === (sp.get("q") ?? "")) return;
    const t = setTimeout(() => set({ q: q || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const facilities = sp.getAll("facility");
  const api = new URLSearchParams();
  for (const k of ["q", "city", "field_type", "surface", "indoor", "sort", "page"]) if (sp.get(k)) api.set(k, sp.get(k)!);
  const maxUsd = sp.get("max_usd");
  if (maxUsd) api.set("max_price", String(Number(maxUsd) * 100));
  facilities.forEach((f) => api.append("facility", f));
  api.set("page_size", view === "map" ? "50" : "9");

  const facilityList = useQuery({ queryKey: ["facilities"], queryFn: getFacilities, staleTime: Infinity });
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["venues", api.toString()], queryFn: () => searchVenues(api), placeholderData: keepPreviousData,
  });
  const page = Number(sp.get("page") ?? 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const clear = () => { setQ(""); router.replace(`${path}${view === "map" ? "?view=map" : ""}`); };

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[18rem_1fr]">
      <div className="lg:sticky lg:top-24 lg:self-start">
      <Button variant="secondary" size="sm" className="mb-4 lg:hidden" aria-expanded={showFilters} aria-controls="filters" onClick={() => setShowFilters(!showFilters)}>
        {showFilters ? "Hide filters" : "Show filters"}
      </Button>
      <aside id="filters" aria-label="Filters" className={`space-y-5 lg:block ${showFilters ? "block" : "hidden"}`}>
        <div>
          <Label htmlFor="q">Search</Label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3.5 text-mute" />
            <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Venue or street" className="pl-9" />
          </div>
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Select id="city" value={sp.get("city") ?? ""} onChange={(e) => set({ city: e.target.value || null })}>
            <option value="">All cities</option>
            {CITIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="ft">Field size</Label>
          <div id="ft" className="flex gap-1.5">{TYPES.map((t) => <Chip key={t} active={sp.get("field_type") === t} onClick={() => toggle("field_type", t)}>{t}</Chip>)}</div>
        </div>
        <div>
          <Label htmlFor="sf">Surface</Label>
          <div id="sf" className="flex flex-wrap gap-1.5">{SURFACES.map(([v, l]) => <Chip key={v} active={sp.get("surface") === v} onClick={() => toggle("surface", v)}>{l}</Chip>)}</div>
        </div>
        <div>
          <Label htmlFor="env">Setting</Label>
          <div id="env" className="flex gap-1.5">
            <Chip active={sp.get("indoor") === "true"} onClick={() => toggle("indoor", "true")}>Indoor</Chip>
            <Chip active={sp.get("indoor") === "false"} onClick={() => toggle("indoor", "false")}>Outdoor</Chip>
          </div>
        </div>
        <div>
          <Label htmlFor="price">Max price / hour {maxUsd ? `· $${maxUsd}` : ""}</Label>
          <input id="price" type="range" min={10} max={150} step={5} value={maxUsd ?? 150} className="w-full accent-[var(--color-pitch-500)]"
            onChange={(e) => set({ max_usd: e.target.value === "150" ? null : e.target.value })} />
        </div>
        <div>
          <Label htmlFor="fac">Facilities</Label>
          <div id="fac" className="flex flex-wrap gap-1.5">
            {facilityList.data?.map((f) => (
              <Chip key={f.code} active={facilities.includes(f.code)}
                onClick={() => {
                  const next = new URLSearchParams(sp.toString());
                  next.delete("facility"); next.delete("page");
                  (facilities.includes(f.code) ? facilities.filter((x) => x !== f.code) : [...facilities, f.code]).forEach((x) => next.append("facility", x));
                  router.replace(`${path}?${next}`, { scroll: false });
                }}>{f.name}</Chip>
            ))}
          </div>
        </div>
        <p className="text-xs text-mute">Date &amp; time availability filters arrive with the booking engine.</p>
      </aside>
      </div>

      <section aria-live="polite">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-mute">{data ? `${data.total} venue${data.total === 1 ? "" : "s"}` : "Loading…"}{isFetching && !isLoading ? " · updating" : ""}</p>
          <div className="flex items-center gap-2">
            <Select aria-label="Sort" className="h-9 w-auto" value={sp.get("sort") ?? "name"} onChange={(e) => set({ sort: e.target.value === "name" ? null : e.target.value })}>
              <option value="name">Name</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
            </Select>
            <Button size="sm" variant={view === "list" ? "primary" : "secondary"} onClick={() => set({ view: null }, true)}><List size={14} />List</Button>
            <Button size="sm" variant={view === "map" ? "primary" : "secondary"} onClick={() => set({ view: "map" }, true)}><MapIcon size={14} />Map</Button>
          </div>
        </div>

        {error ? <ErrorState message={error.message} onRetry={() => refetch()} />
          : isLoading ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <VenueCardSkeleton key={i} />)}</div>
          : !data?.items.length ? <EmptyState title="No fields match" body="Try removing a filter or searching a wider area." action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
          : view === "map" ? <VenueMap venues={data.items} />
          : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{data.items.map((v) => <VenueCard key={v.id} venue={v} />)}</div>
              {pages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => set({ page: String(page - 1) }, true)}>Previous</Button>
                  <span className="text-sm text-mute">Page {page} of {pages}</span>
                  <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => set({ page: String(page + 1) }, true)}>Next</Button>
                </div>
              )}
            </>
          )}
      </section>
    </div>
  );
}
