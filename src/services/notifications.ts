import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { FoodItem, Settings } from '../types';
import { parseDate, daysUntil } from '../utils/date';

// Show alerts even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    // Web notification scheduling is limited; we degrade gracefully.
    return false;
  }
  // expo's PermissionResponse type mis-resolves in this SDK combo, so read the
  // well-known runtime fields loosely.
  const current = (await Notifications.getPermissionsAsync()) as {
    status: string;
    granted?: boolean;
    canAskAgain?: boolean;
  };
  if (current.status === 'granted' || current.granted) return true;
  if (current.canAskAgain === false) return false;
  const req = (await Notifications.requestPermissionsAsync()) as {
    status: string;
    granted?: boolean;
  };
  return req.status === 'granted' || req.granted === true;
}

/**
 * Schedule a reminder N days before expiry, at the user's preferred hour.
 * Returns the scheduled notification id, or null if not scheduled
 * (past date, web, or no permission).
 */
export async function scheduleExpiryNotification(
  item: FoodItem,
  settings: Settings
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const granted = await requestNotificationPermission();
  if (!granted) return null;

  const expiry = parseDate(item.expiryDate);
  const fireDate = new Date(expiry);
  fireDate.setDate(fireDate.getDate() - item.alertLeadDays);
  fireDate.setHours(settings.notificationHour, 0, 0, 0);

  // If the ideal reminder time is already in the past but the item hasn't
  // expired yet, remind in a minute so the user still gets a heads-up.
  const now = new Date();
  let trigger: Date = fireDate;
  if (fireDate.getTime() <= now.getTime()) {
    if (daysUntil(item.expiryDate) < 0) return null; // already expired
    trigger = new Date(now.getTime() + 60 * 1000);
  }

  const daysLeft = daysUntil(item.expiryDate);
  const body =
    daysLeft <= 0
      ? `${item.name} expires today!`
      : `${item.name} ${item.expiryType === 'use_by' ? 'must be used' : 'is best before'} ${daysLeft} day${daysLeft === 1 ? '' : 's'} from now.`;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⏰ Food expiring soon',
      body,
      sound: settings.soundEnabled,
      data: { itemId: item.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
  return id;
}

export async function cancelNotification(id?: string | null): Promise<void> {
  if (!id || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already fired or removed
  }
}
