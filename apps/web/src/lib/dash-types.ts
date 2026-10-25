import type { Booking, FieldType, VenueSummary } from "@/lib/api";

export interface DayPoint { date: string; bookings: number; gross_minor: number }
export interface FieldUtil { field_id: string; field_name: string; venue_name: string; booked_minutes: number; available_minutes: number; occupancy: number }
export interface TodayBooking { id: string; reference: string; status: string; start_at: string; end_at: string; field_name: string; venue_name: string; customer_name: string; total_minor: number }
export interface OwnerAnalytics {
  days: number; start: string; end: string; gross_minor: number; commission_minor: number; net_minor: number; bookings: number; cancelled: number; occupancy: number;
  daily: DayPoint[]; popular_hours: { hour: number; bookings: number }[]; fields: FieldUtil[]; today: TodayBooking[];
}
export interface AdminAnalytics {
  days: number; start: string; end: string; users: Record<string, number>; venues: Record<string, number>; bookings_by_status: Record<string, number>;
  total_bookings: number; total_venues: number; total_users: number; gross_minor: number; commission_minor: number; refunded_minor: number; pending_venues: number;
  daily: DayPoint[]; commission_daily: DayPoint[]; top_venues: { venue_id: string; name: string; bookings: number; gross_minor: number }[];
}
export interface CustomerDashboard { upcoming_count: number; past_count: number; total_spent_minor: number; favorites_count: number; unread_notifications: number; next_bookings: Booking[] }
export interface Notification { id: string; kind: string; title: string; body: string; read_at: string | null; created_at: string }
export interface NotificationPage { items: Notification[]; total: number; unread: number }
export interface ManagedField { id: string; name: string; field_type: FieldType; surface: string; indoor: boolean; base_price_minor: number; currency: string }
export interface ManagedVenue {
  id: string; slug: string; name: string; description: string; city: string; address: string; latitude: number; longitude: number; status: string;
  rejection_reason: string | null; pay_at_venue_enabled: boolean; owner_id: string; facilities: { code: string; name: string }[]; fields: ManagedField[]; created_at: string;
}
export interface Hour { weekday: number; open_minute: number; close_minute: number }
export interface PricingRule { id: string; name: string; weekdays: number[]; start_minute: number; end_minute: number; price_minor: number; priority: number; valid_from: string | null; valid_to: string | null }
export interface Blocked { id: string; start_at: string; end_at: string; reason: string }
export interface AdminUser { id: string; email: string; full_name: string; role: string; is_active: boolean; created_at: string }
export interface Paged<T> { items: T[]; total: number; page: number; page_size: number }
export interface AdminBookingRow { id: string; reference: string; status: string; start_at: string; end_at: string; total_minor: number; commission_minor: number; venue_name: string; field_name: string; customer_name: string; customer_email: string; payment_status: string | null; payment_provider: string | null }
export interface AdminPaymentRow { id: string; booking_reference: string; provider: string; status: string; amount_minor: number; currency: string; created_at: string; refund_id: string | null; refund_status: string | null; refund_failure: string | null }
export interface AuditRow { id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string; data: Record<string, unknown> | null; created_at: string }
export type { VenueSummary };
