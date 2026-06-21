// Core domain types for Larder

export type ExpiryType = 'use_by' | 'best_before';

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  imageUrl?: string;
  category?: string;
  quantity: number;
  /** ISO date string (yyyy-mm-dd) of the printed expiry */
  expiryDate: string;
  expiryType: ExpiryType;
  /** Days before expiry to fire the reminder. Overrides the default. */
  alertLeadDays: number;
  /** Scheduled local-notification id, so we can cancel/reschedule. */
  notificationId?: string | null;
  createdAt: string;
  /** Set when the user marks the item as used/finished. */
  usedAt?: string | null;
}

export interface Settings {
  /** Default days-before-expiry to alert when adding a new item. */
  defaultAlertLeadDays: number;
  soundEnabled: boolean;
  /** Hour of day (0-23) to fire reminders. */
  notificationHour: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultAlertLeadDays: 3,
  soundEnabled: true,
  notificationHour: 9,
};
