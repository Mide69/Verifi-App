import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FoodItem } from '../types';
import { colors, radius, font, spacing, shadow } from '../theme';
import { urgencyFor, urgencyColor, urgencyBg, expiryLabel, daysUntil } from '../utils/date';

interface Props {
  item: FoodItem;
  onPress: () => void;
}

export default function ItemCard({ item, onPress }: Props) {
  const u = urgencyFor(item);
  const accent = urgencyColor(u);
  const days = daysUntil(item.expiryDate);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, shadow(1), { opacity: pressed ? 0.95 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${expiryLabel(item)}`}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="fast-food-outline" size={26} color={colors.textFaint} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {item.brand ? (
          <Text style={styles.brand} numberOfLines={1}>
            {item.brand}
          </Text>
        ) : null}
        <View style={[styles.pill, { backgroundColor: urgencyBg(u) }]}>
          <Ionicons
            name={u === 'expired' ? 'alert-circle' : 'time-outline'}
            size={13}
            color={accent}
          />
          <Text style={[styles.pillText, { color: accent }]}>{expiryLabel(item)}</Text>
        </View>
      </View>

      <View style={[styles.chip, { backgroundColor: urgencyBg(u) }]}>
        {days < 0 ? (
          <Ionicons name="warning" size={22} color={accent} />
        ) : (
          <>
            <Text style={[styles.chipNum, { color: accent }]}>{days}</Text>
            <Text style={[styles.chipUnit, { color: accent }]}>
              {days === 1 ? 'day' : 'days'}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: spacing.sm + 2,
    alignItems: 'center',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: spacing.md },
  name: { fontSize: font.title, fontWeight: '700', color: colors.text },
  brand: { fontSize: font.small, color: colors.textMuted, marginTop: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.sm,
  },
  pillText: { fontSize: font.tiny, fontWeight: '700', marginLeft: 4 },
  chip: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipNum: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  chipUnit: { fontSize: 10, fontWeight: '700', marginTop: -1 },
});
