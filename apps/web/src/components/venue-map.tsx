"use client";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { VenueSummary } from "@/lib/api";
import { formatUsd } from "@/lib/format";

export default function VenueMap({ venues }: { venues: VenueSummary[] }) {
  const center: [number, number] = venues[0] ? [venues[0].latitude, venues[0].longitude] : [11.5564, 104.9282];
  return (
    <MapContainer key={venues.map((v) => v.id).join()} center={center} zoom={venues.length > 1 ? 7 : 13}
      bounds={venues.length > 1 ? venues.map((v) => [v.latitude, v.longitude] as [number, number]) : undefined}
      boundsOptions={{ padding: [40, 40] }} className="h-[560px] w-full rounded-[var(--radius-card)] border border-line">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {venues.map((v) => (
        <CircleMarker key={v.id} center={[v.latitude, v.longitude]} radius={10} pathOptions={{ color: "#07100c", weight: 2, fillColor: "#10d081", fillOpacity: 1 }}>
          <Popup>
            <strong>{v.name}</strong><br />{v.city} · from {formatUsd(v.from_price_minor)}/h<br />
            <Link href={`/venues/${v.slug}`}>View details →</Link>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
