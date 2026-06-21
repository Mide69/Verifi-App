import AsyncStorage from '@react-native-async-storage/async-storage';
import { FoodItem, Settings, DEFAULT_SETTINGS } from '../types';

/**
 * Storage abstraction. Today this is backed by on-device AsyncStorage
 * (works offline, no account needed). In phase 2 a SupabaseRepository can
 * implement the same interface to power shared household stores + carer access.
 */
export interface FoodRepository {
  getItems(): Promise<FoodItem[]>;
  saveItems(items: FoodItem[]): Promise<void>;
  addItem(item: FoodItem): Promise<void>;
  updateItem(item: FoodItem): Promise<void>;
  deleteItem(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

const ITEMS_KEY = 'larder:items';
const SETTINGS_KEY = 'larder:settings';

export class AsyncStorageRepository implements FoodRepository {
  async getItems(): Promise<FoodItem[]> {
    const raw = await AsyncStorage.getItem(ITEMS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as FoodItem[];
    } catch {
      return [];
    }
  }

  async saveItems(items: FoodItem[]): Promise<void> {
    await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  }

  async addItem(item: FoodItem): Promise<void> {
    const items = await this.getItems();
    items.push(item);
    await this.saveItems(items);
  }

  async updateItem(item: FoodItem): Promise<void> {
    const items = await this.getItems();
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) items[idx] = item;
    else items.push(item);
    await this.saveItems(items);
  }

  async deleteItem(id: string): Promise<void> {
    const items = await this.getItems();
    await this.saveItems(items.filter((i) => i.id !== id));
  }

  async getSettings(): Promise<Settings> {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}

export const repository: FoodRepository = new AsyncStorageRepository();
