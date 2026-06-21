import React from 'react';
import { View, Text, Image, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { FoodItem } from '../types';
import { colors, font, spacing, radius, gradients, shadow } from '../theme';
import { urgencyFor, urgencyColor, urgencyBg, expiryLabel, prettyDate } from '../utils/date';
import Button from '../components/Button';

interface Props {
  item: FoodItem;
  onDelete: (item: FoodItem) => void;
  onMarkUsed: (item: FoodItem) => void;
  onBack: () => void;
}

export default function ItemDetailScreen({ item, onDelete, onMarkUsed, onBack }: Props) {
  const u = urgencyFor(item);
  const accent = urgencyColor(u);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Pressable onPress={onBack} style={styles.headerBtn} accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.onPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Item details</Text>
        <View style={styles.headerBtn} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, shadow(1)]}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Ionicons name="fast-food-outline" size={56} color={colors.textFaint} />
            </View>
          )}
          <Text style={styles.name}>{item.name}</Text>
          {item.brand ? <Text style={styles.brand}>{item.brand}</Text> : null}
          <View style={[styles.badge, { backgroundColor: urgencyBg(u) }]}>
            <Ionicons
              name={u === 'expired' ? 'alert-circle' : 'time-outline'}
              size={16}
              color={accent}
            />
            <Text style={[styles.badgeText, { color: accent }]}>{expiryLabel(item)}</Text>
          </View>
        </View>

        <View style={[styles.card, shadow(1)]}>
          <DetailRow
            icon="calendar-outline"
            label={item.expiryType === 'use_by' ? 'Use by' : 'Best before'}
            value={prettyDate(item.expiryDate)}
          />
          <DetailRow icon="notifications-outline" label="Reminder" value={`${item.alertLeadDays} days before`} />
          {item.barcode ? (
            <DetailRow icon="barcode-outline" label="Barcode" value={item.barcode} last />
          ) : null}
        </View>

        <Button title="Mark as used" icon="checkmark-circle" onPress={() => onMarkUsed(item)} style={{ marginTop: spacing.lg }} />
        <Button
          title="Delete item"
          variant="danger"
          icon="trash-outline"
          onPress={() => onDelete(item)}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: font.h2, fontWeight: '800', color: colors.onPrimary },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  image: { width: 140, height: 140, borderRadius: radius.md, backgroundColor: colors.cardAlt, resizeMode: 'contain' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.h2, fontWeight: '800', color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  brand: { fontSize: font.body, color: colors.textMuted, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  badgeText: { fontSize: font.body, fontWeight: '800', marginLeft: 6 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.md, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: font.body, color: colors.textMuted, flex: 1 },
  rowValue: { fontSize: font.body, color: colors.text, fontWeight: '700' },
});
