import React from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Settings } from '../types';
import { colors, font, spacing, radius, gradients, shadow } from '../theme';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
}

export default function SettingsScreen({ settings, onChange, onBack }: Props) {
  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    onChange({ ...settings, [key]: value });
  }

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
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerBtn} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, shadow(1)]}>
          <Row icon="notifications-outline" label="Remind me before expiry" help="Default for new items. You can override this per item.">
            <Stepper
              value={`${settings.defaultAlertLeadDays} day${settings.defaultAlertLeadDays === 1 ? '' : 's'}`}
              onDec={() => set('defaultAlertLeadDays', Math.max(0, settings.defaultAlertLeadDays - 1))}
              onInc={() => set('defaultAlertLeadDays', Math.min(60, settings.defaultAlertLeadDays + 1))}
            />
          </Row>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.rowIcon}>
              <Ionicons name="volume-high-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Play a sound</Text>
              <Text style={styles.help}>Reminders make a sound as well as showing on screen.</Text>
            </View>
            <Switch
              value={settings.soundEnabled}
              onValueChange={(v) => set('soundEnabled', v)}
              trackColor={{ true: colors.primary }}
            />
          </View>

          <View style={styles.divider} />

          <Row icon="time-outline" label="Reminder time" help="What time of day reminders appear.">
            <Stepper
              value={`${String(settings.notificationHour).padStart(2, '0')}:00`}
              onDec={() => set('notificationHour', Math.max(0, settings.notificationHour - 1))}
              onInc={() => set('notificationHour', Math.min(23, settings.notificationHour + 1))}
            />
          </Row>
        </View>

        <View style={[styles.teaser, shadow(1)]}>
          <Ionicons name="people-outline" size={22} color={colors.primaryDark} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.teaserTitle}>Shared stores & carer alerts</Text>
            <Text style={styles.teaserText}>
              Coming soon — invite family or a carer to help manage your larder.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>Larder · expiry tracking for your kitchen</Text>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  help,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <View style={styles.rowHead}>
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.help}>{help}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function Stepper({ value, onDec, onInc }: { value: string; onDec: () => void; onInc: () => void }) {
  return (
    <View style={styles.stepperRow}>
      <Pressable onPress={onDec} style={styles.stepBtn} accessibilityLabel="Decrease">
        <Ionicons name="remove" size={24} color={colors.primaryDark} />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable onPress={onInc} style={styles.stepBtn} accessibilityLabel="Increase">
        <Ionicons name="add" size={24} color={colors.primaryDark} />
      </Pressable>
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
  content: { padding: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center' },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  label: { fontSize: font.title, fontWeight: '700', color: colors.text },
  help: { fontSize: font.small, color: colors.textMuted, marginTop: 2, lineHeight: 20 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  stepBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.okBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: font.h2, fontWeight: '800', color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  teaser: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  teaserTitle: { fontSize: font.body, fontWeight: '800', color: colors.primaryDark },
  teaserText: { fontSize: font.small, color: colors.primaryDark, opacity: 0.85, marginTop: 2, lineHeight: 19 },
  footer: { textAlign: 'center', color: colors.textFaint, fontSize: font.small, marginTop: spacing.lg },
});
