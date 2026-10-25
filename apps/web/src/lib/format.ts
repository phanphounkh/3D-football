export const formatUsd = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);

export const surfaceLabel: Record<string, string> = { artificial: "Artificial turf", natural: "Natural grass", futsal: "Futsal court" };

/** Everything the customer sees is in the venue's business timezone, regardless of where their browser is. */
export const BIZ_TZ = "Asia/Phnom_Penh";
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: BIZ_TZ, ...o });
export const formatTime = (iso: string) => fmt({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
export const formatDay = (iso: string) => fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
export const bizDateKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: BIZ_TZ }).format(d); // YYYY-MM-DD

export const statusLabel: Record<string, string> = {
  pending: "Pending", awaiting_payment: "Awaiting payment", confirmed: "Confirmed", cancelled: "Cancelled",
  completed: "Completed", expired: "Expired", refunded: "Refunded",
};

export const compactUsd = (minor: number) => {
  const d = minor / 100;
  return d >= 1000 ? `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(d)}` : formatUsd(minor);
};
export const pct = (ratio: number) => `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.1 ? 1 : 0)}%`;
export const hhmm = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const parseHhmm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
export const shortDate = (isoDate: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(isoDate + "T00:00:00Z"));
export const dateTime = (iso: string) => `${formatDay(iso)} ${formatTime(iso)}`;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** <input type="datetime-local"> values are wall-clock time in the venue's timezone (Phnom Penh is UTC+7, no DST). */
export const bizLocalToIso = (v: string) => `${v.length === 16 ? `${v}:00` : v}+07:00`;
export const usdToMinor = (s: string) => Math.round(Number(s) * 100);
export const minorToUsdInput = (m: number) => (m / 100).toString();
