export type FieldType = "5v5" | "7v7" | "11v11";
export interface Facility { code: string; name: string }
export interface VenueSummary {
  id: string; slug: string; name: string; city: string; address: string;
  latitude: number; longitude: number; from_price_minor: number;
  field_types: FieldType[]; facilities: Facility[]; field_count: number;
}
export interface FieldOut {
  id: string; name: string; field_type: FieldType; surface: string; indoor: boolean; base_price_minor: number; currency: string;
}
export interface VenueDetail extends VenueSummary { description: string; fields: FieldOut[] }
export interface Page { items: VenueSummary[]; total: number; page: number; page_size: number }

export interface FieldError { field: string; message: string }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: FieldError[] = []) { super(message); }
}

const base = () =>
  typeof window === "undefined"
    ? process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api/v1"
    : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api/v1";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base() + path, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Please try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? res.statusText, body?.error?.details);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const searchVenues = (params: URLSearchParams) => api<Page>(`/venues?${params}`);
export const getVenue = (slug: string) => api<VenueDetail>(`/venues/${encodeURIComponent(slug)}`);
export const getFacilities = () => api<Facility[]>("/venues/meta/facilities");

export interface Slot { start_at: string; end_at: string; price_minor: number; available: boolean; reason: "booked" | "blocked" | "past" | null }
export interface Availability { field_id: string; date: string; timezone: string; duration_minutes: number; currency: string; slots: Slot[] }
export interface PaymentInfo {
  id: string; provider: string; status: "pending" | "succeeded" | "failed" | "cancelled" | "refunded"; amount_minor: number; currency: string;
  action: { type: "qr"; payload: string; expires_at: string; demo?: boolean } | null;
  refund: { status: string; amount_minor: number; failure_reason: string | null } | null;
}
export interface Booking {
  id: string; reference: string; status: string; start_at: string; end_at: string; total_minor: number; currency: string;
  hold_expires_at: string | null; created_at: string; cancelled_at: string | null; cancellable: boolean; customer_name: string | null;
  field: { id: string; name: string; field_type: FieldType };
  venue: { id: string; slug: string; name: string; city: string; address: string; pay_at_venue_enabled: boolean };
  payment: PaymentInfo | null;
}
export interface BookingPage { items: Booking[]; total: number; page: number; page_size: number }

export const getAvailability = (fieldId: string, date: string, duration: number) =>
  api<Availability>(`/fields/${fieldId}/availability?date=${date}&duration=${duration}`);
