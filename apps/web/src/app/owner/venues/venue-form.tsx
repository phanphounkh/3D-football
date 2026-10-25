"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getFacilities } from "@/lib/api";
import { authApi } from "@/lib/auth";
import type { ManagedVenue } from "@/lib/dash-types";
import { Button } from "@/components/ui/button";
import { Chip, Input, Label } from "@/components/ui/form";
import { useToasts } from "@/components/ui/toast";

const schema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(120),
  description: z.string().max(4000),
  city: z.string().trim().min(2, "Enter a city").max(64),
  address: z.string().trim().min(3, "Enter the street address").max(255),
  latitude: z.number({ error: "Enter a latitude" }).min(-90).max(90),
  longitude: z.number({ error: "Enter a longitude" }).min(-180).max(180),
  facility_codes: z.array(z.string()),
  pay_at_venue_enabled: z.boolean(),
});
type Values = z.infer<typeof schema>;
const Err = ({ m }: { m?: string }) => (m ? <p role="alert" className="mt-1 text-xs text-red-400">{m}</p> : null);

export function VenueForm({ venue }: { venue?: ManagedVenue }) {
  const router = useRouter();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const facilities = useQuery({ queryKey: ["facilities"], queryFn: getFacilities, staleTime: Infinity });
  const { register, handleSubmit, watch, setValue, setError, reset, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: venue ? { name: venue.name, description: venue.description, city: venue.city, address: venue.address, latitude: venue.latitude, longitude: venue.longitude, facility_codes: venue.facilities.map((f) => f.code), pay_at_venue_enabled: venue.pay_at_venue_enabled }
      : { name: "", description: "", city: "Phnom Penh", address: "", latitude: 11.5564, longitude: 104.9282, facility_codes: [], pay_at_venue_enabled: false },
  });
  const codes = watch("facility_codes");
  const payAtVenue = watch("pay_at_venue_enabled");

  return (
    <form noValidate className="max-w-2xl space-y-4" onSubmit={handleSubmit(async (v) => {
      try {
        if (venue) {
          const saved = await authApi<ManagedVenue>(`/owner/venues/${venue.id}`, { method: "PATCH", body: JSON.stringify(v) });
          reset({ ...v }); push("Venue saved", "success");
          qc.setQueryData(["owner-venue", venue.id], saved); void qc.invalidateQueries({ queryKey: ["owner-venues"] });
        } else {
          const { pay_at_venue_enabled: _p, ...body } = v; void _p;
          const created = await authApi<ManagedVenue>("/owner/venues", { method: "POST", body: JSON.stringify(body) });
          void qc.invalidateQueries({ queryKey: ["owner-venues"] });
          router.replace(`/owner/venues/${created.id}`);
        }
      } catch (e) {
        if (e instanceof ApiError && e.details.length) e.details.forEach((d) => d.field in v && setError(d.field as keyof Values, { message: d.message }));
        push(e instanceof ApiError ? e.message : "Couldn't save the venue", "error");
      }
    })}>
      <div><Label htmlFor="name">Venue name</Label><Input id="name" aria-invalid={!!errors.name} {...register("name")} /><Err m={errors.name?.message} /></div>
      <div><Label htmlFor="description">Description</Label><textarea id="description" rows={4} className="w-full rounded-xl border border-line bg-ink-800 px-3 py-2 text-sm placeholder:text-mute focus:border-pitch-500" {...register("description")} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="city">City</Label><Input id="city" list="cities" {...register("city")} /><datalist id="cities">{["Phnom Penh", "Siem Reap", "Battambang", "Sihanoukville"].map((c) => <option key={c} value={c} />)}</datalist><Err m={errors.city?.message} /></div>
        <div><Label htmlFor="address">Street address</Label><Input id="address" {...register("address")} /><Err m={errors.address?.message} /></div>
        <div><Label htmlFor="latitude">Latitude</Label><Input id="latitude" type="number" step="any" {...register("latitude", { valueAsNumber: true })} /><Err m={errors.latitude?.message} /></div>
        <div><Label htmlFor="longitude">Longitude</Label><Input id="longitude" type="number" step="any" {...register("longitude", { valueAsNumber: true })} /><Err m={errors.longitude?.message} /></div>
      </div>
      <fieldset>
        <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">Facilities</legend>
        <div className="flex flex-wrap gap-1.5">
          {facilities.data?.map((f) => <Chip key={f.code} active={codes.includes(f.code)} onClick={() => setValue("facility_codes", codes.includes(f.code) ? codes.filter((c) => c !== f.code) : [...codes, f.code], { shouldDirty: true })}>{f.name}</Chip>)}
        </div>
      </fieldset>
      {venue && (
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" checked={payAtVenue} onChange={(e) => setValue("pay_at_venue_enabled", e.target.checked, { shouldDirty: true })} className="mt-0.5 accent-[var(--color-pitch-500)]" />
          <span><span className="font-semibold">Accept pay-at-venue bookings</span><br /><span className="text-mute">Customers reserve online and pay when they arrive. You mark the payment as collected.</span></span>
        </label>
      )}
      <Button type="submit" disabled={isSubmitting || (!!venue && !isDirty)}>{isSubmitting ? "Saving…" : venue ? "Save changes" : "Submit for approval"}</Button>
    </form>
  );
}
