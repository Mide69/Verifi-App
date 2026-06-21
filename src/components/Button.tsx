import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, font, spacing, gradients, shadow } from '../theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: Props) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const fg = isPrimary ? colors.onPrimary : isDanger ? colors.expired : colors.primaryDark;

  const inner = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={fg} style={styles.icon} /> : null}
          <Text style={[styles.label, { color: fg }]}>{title}</Text>
        </>
      )}
    </View>
  );

  if (isPrimary) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.wrap,
          shadow(1),
          { opacity: disabled ? 0.5 : pressed ? 0.92 : 1 },
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.wrap,
        styles.btn,
        styles.outline,
        isDanger && { borderColor: colors.expired },
        { opacity: disabled ? 0.5 : pressed ? 0.9 : 1 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: 'hidden' },
  btn: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  outline: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: spacing.sm },
  label: { fontSize: font.body, fontWeight: '700' },
});
