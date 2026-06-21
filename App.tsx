import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar, Platform, StyleSheet, View, ActivityIndicator } from 'react-native';
import { FoodItem, Settings, DEFAULT_SETTINGS } from './src/types';
import { repository } from './src/storage/repository';
import { colors, radius, shadow } from './src/theme';
import { scheduleExpiryNotification, cancelNotification } from './src/services/notifications';
import HomeScreen from './src/screens/HomeScreen';
import AddItemScreen from './src/screens/AddItemScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ItemDetailScreen from './src/screens/ItemDetailScreen';

type Screen = 'home' | 'add' | 'settings' | 'detail';

const isWeb = Platform.OS === 'web';

export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [items, setItems] = useState<FoodItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState<FoodItem | null>(null);

  useEffect(() => {
    (async () => {
      const [loadedItems, loadedSettings] = await Promise.all([
        repository.getItems(),
        repository.getSettings(),
      ]);
      setItems(loadedItems.filter((i) => !i.usedAt));
      setSettings(loadedSettings);
      setReady(true);
    })();
  }, []);

  const handleSave = useCallback(
    async (item: FoodItem) => {
      const notificationId = await scheduleExpiryNotification(item, settings);
      const withNotif = { ...item, notificationId };
      await repository.addItem(withNotif);
      setItems((prev) => [...prev, withNotif]);
      setScreen('home');
    },
    [settings]
  );

  const handleDelete = useCallback(async (item: FoodItem) => {
    await cancelNotification(item.notificationId);
    await repository.deleteItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSelected(null);
    setScreen('home');
  }, []);

  const handleMarkUsed = useCallback(async (item: FoodItem) => {
    await cancelNotification(item.notificationId);
    await repository.updateItem({ ...item, usedAt: new Date().toISOString() });
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSelected(null);
    setScreen('home');
  }, []);

  const handleSettingsChange = useCallback(async (s: Settings) => {
    setSettings(s);
    await repository.saveSettings(s);
  }, []);

  let content: React.ReactNode = null;
  if (!ready) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  } else if (screen === 'home') {
    content = (
      <HomeScreen
        items={items}
        onAdd={() => setScreen('add')}
        onOpenSettings={() => setScreen('settings')}
        onSelect={(item) => {
          setSelected(item);
          setScreen('detail');
        }}
      />
    );
  } else if (screen === 'add') {
    content = <AddItemScreen settings={settings} onSave={handleSave} onCancel={() => setScreen('home')} />;
  } else if (screen === 'settings') {
    content = (
      <SettingsScreen
        settings={settings}
        onChange={handleSettingsChange}
        onBack={() => setScreen('home')}
      />
    );
  } else if (screen === 'detail' && selected) {
    content = (
      <ItemDetailScreen
        item={selected}
        onDelete={handleDelete}
        onMarkUsed={handleMarkUsed}
        onBack={() => setScreen('home')}
      />
    );
  }

  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.frame, isWeb && styles.frameWeb, isWeb && shadow(3)]}>{content}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  // On web, present as a centered phone-width column that looks like an app.
  frameWeb: {
    flex: 0,
    width: 430,
    maxWidth: '100%',
    height: '100%',
    maxHeight: 920,
    marginVertical: 24,
    borderRadius: radius.xl,
    overflow: 'hidden',
    paddingTop: 0,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
