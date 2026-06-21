import { FoodItem } from '../types';
import { colors } from '../theme';

/** Parse a yyyy-mm-dd string as a local date at midnight. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Format a Date as yyyy-mm-dd (local). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days from today (local midnight) until the given expiry date. */
export function daysUntil(expiryISO: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = parseDate(expiryISO);
  const ms = expiry.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export type Urgency = 'expired' | 'critical' | 'soon' | 'ok';

export function urgencyFor(item: FoodItem): Urgency {
  const days = daysUntil(item.expiryDate);
  if (days < 0) return 'expired';
  if (days <= item.alertLeadDays) return 'critical';
  if (days <= 7) return 'soon';
  return 'ok';
}

export function urgencyColor(u: Urgency): string {
  return colors[u];
}

export function urgencyBg(u: Urgency): string {
  const map = {
    expired: colors.expiredBg,
    critical: colors.criticalBg,
    soon: colors.soonBg,
    ok: colors.okBg,
  } as const;
  return map[u];
}

/** Friendly, plain-English summary of time left — tuned for older users. */
export function expiryLabel(item: FoodItem): string {
  const days = daysUntil(item.expiryDate);
  const word = item.expiryType === 'use_by' ? 'Use by' : 'Best before';
  if (days < -1) return `Expired ${Math.abs(days)} days ago`;
  if (days === -1) return 'Expired yesterday';
  if (days === 0) return `${word} today`;
  if (days === 1) return `${word} tomorrow`;
  return `${word} in ${days} days`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function prettyDate(iso: string): string {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
