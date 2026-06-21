import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { FoodItem } from '../types';
import { colors, font, spacing, radius, gradients, shadow } from '../theme';
import { daysUntil, urgencyFor } from '../utils/date';
import ItemCard from '../components/ItemCard';

interface Props {
  items: FoodItem[];
  onAdd: () => void;
  onOpenSettings: () => void;
  onSelect: (item: FoodItem) => void;
}

export default function HomeScreen({ items, onAdd, onOpenSettings, onSelect }: Props) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate)),
    [items]
  );

  const stats = useMemo(() => {
    let soon = 0;
    let expired = 0;
    items.forEach((i) => {
      const u = urgencyFor(i);
      if (u === 'expired') expired++;
      else if (u === 'critical' || u === 'soon') soon++;
    });
    return { total: items.length, soon, expired };
  }, [items]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Ionicons name="leaf" size={20} color={colors.onPrimary} />
            </View>
            <Text style={styles.brandName}>Larder</Text>
          </View>
          <Pressable
            onPress={onOpenSettings}
            style={styles.gear}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={22} color={colors.onPrimary} />
          </Pressable>
        </View>

        <Text style={styles.greeting}>Your kitchen at a glance</Text>

        <View style={styles.statsRow}>
          <Stat value={stats.total} label="Items" />
          <Stat value={stats.soon} label="Expiring soon" />
          <Stat value={stats.expired} label="Expired" />
        </View>
      </LinearGradient>

      <FlatList
        data={sorted}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ItemCard item={item} onPress={() => onSelect(item)} />}
        contentContainerStyle={sorted.length === 0 ? styles.emptyWrap : styles.listPad}
        ListHeaderComponent={
          sorted.length > 0 ? <Text style={styles.listTitle}>Sorted by expiry</Text> : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="basket-outline" size={44} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Your larder is empty</Text>
            <Text style={styles.emptyText}>
              Tap the button below to scan a barcode and add your first item.
            </Text>
          </View>
        }
      />

      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.fabWrap, shadow(2), { opacity: pressed ? 0.92 : 1 }]}
        accessibilityLabel="Add food item"
        accessibilityRole="button"
      >
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Ionicons name="add" size={26} color={colors.onPrimary} />
          <Text style={styles.fabText}>Add item</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  logo: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  brandName: { fontSize: font.h2, fontWeight: '800', color: colors.onPrimary, letterSpacing: 0.2 },
  gear: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: { color: 'rgba(255,255,255,0.92)', fontSize: font.body, marginTop: spacing.md },
  statsRow: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  statValue: { color: colors.onPrimary, fontSize: 26, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.9)', fontSize: font.tiny, fontWeight: '600', marginTop: 1 },

  listTitle: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  listPad: { paddingBottom: 120 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: spacing.xl },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { fontSize: font.h2, fontWeight: '800', color: colors.text },
  emptyText: {
    fontSize: font.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 24,
    maxWidth: 300,
  },
  fabWrap: {
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    borderRadius: radius.pill,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  fabText: { color: colors.onPrimary, fontSize: font.title, fontWeight: '800', marginLeft: spacing.xs },
});
