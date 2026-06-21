import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { FoodItem, Settings, ExpiryType } from '../types';
import { colors, font, spacing, radius, gradients } from '../theme';
import { toISODate, prettyDate } from '../utils/date';
import { lookupBarcode } from '../services/productLookup';
import Button from '../components/Button';

interface Props {
  settings: Settings;
  onSave: (item: FoodItem) => void;
  onCancel: () => void;
}

const QUICK_PICKS: { label: string; days: number }[] = [
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
];

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export default function AddItemScreen({ settings, onSave, onCancel }: Props) {
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [looking, setLooking] = useState(false);

  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [expiry, setExpiry] = useState<string>(addDaysISO(7));
  const [expiryType, setExpiryType] = useState<ExpiryType>('use_by');
  const [leadDays, setLeadDays] = useState<number>(settings.defaultAlertLeadDays);

  async function runLookup(code: string) {
    setBarcode(code);
    setLooking(true);
    const info = await lookupBarcode(code);
    setLooking(false);
    if (info) {
      setName(info.name);
      if (info.brand) setBrand(info.brand);
      setImageUrl(info.imageUrl);
      setCategory(info.category);
    }
  }

  function handleScanned(data: string) {
    setScanning(false);
    runLookup(data);
  }

  async function openScanner() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setScanning(true);
  }

  function save() {
    if (!name.trim()) return;
    const item: FoodItem = {
      id: makeId(),
      name: name.trim(),
      brand: brand.trim() || undefined,
      barcode: barcode.trim() || undefined,
      imageUrl,
      category,
      quantity: 1,
      expiryDate: expiry,
      expiryType,
      alertLeadDays: leadDays,
      createdAt: new Date().toISOString(),
      usedAt: null,
    };
    onSave(item);
  }

  if (scanning) {
    return (
      <View style={styles.scannerWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'],
          }}
          onBarcodeScanned={({ data }) => handleScanned(data)}
        />
        <View style={styles.scanOverlay}>
          <Text style={styles.scanHint}>Point the camera at the barcode</Text>
          <View style={styles.scanFrame} />
          <Button title="Cancel" variant="secondary" onPress={() => setScanning(false)} />
        </View>
      </View>
    );
  }

  const validExpiry = /^\d{4}-\d{2}-\d{2}$/.test(expiry);

  return (
    <View style={styles.container}>
      <Header title="Add item" onBack={onCancel} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Step n={1} label="Scan the barcode" icon="barcode-outline" />
        <Button
          title={Platform.OS === 'web' ? 'Scan with camera' : 'Scan barcode'}
          icon="scan-outline"
          onPress={openScanner}
        />
        <Text style={styles.or}>or type the barcode number</Text>
        <View style={styles.barcodeRow}>
          <TextInput
            value={barcode}
            onChangeText={setBarcode}
            placeholder="e.g. 5000169005005"
            keyboardType="number-pad"
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholderTextColor={colors.textFaint}
          />
          <Button
            title="Look up"
            variant="secondary"
            onPress={() => runLookup(barcode)}
            style={{ marginLeft: spacing.sm }}
          />
        </View>
        {looking && (
          <View style={styles.lookingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.lookingText}>Finding product…</Text>
          </View>
        )}

        <Step n={2} label="Product" icon="pricetag-outline" />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Product name"
          style={styles.input}
          placeholderTextColor={colors.textFaint}
        />
        <TextInput
          value={brand}
          onChangeText={setBrand}
          placeholder="Brand (optional)"
          style={styles.input}
          placeholderTextColor={colors.textFaint}
        />

        <Step n={3} label="Expiry date" icon="calendar-outline" />
        <View style={styles.typeRow}>
          {(['use_by', 'best_before'] as ExpiryType[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setExpiryType(t)}
              style={[styles.typeChip, expiryType === t && styles.typeChipActive]}
            >
              <Text style={[styles.typeChipText, expiryType === t && styles.typeChipTextActive]}>
                {t === 'use_by' ? 'Use by' : 'Best before'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chipsRow}>
          {QUICK_PICKS.map((q) => (
            <Pressable key={q.days} onPress={() => setExpiry(addDaysISO(q.days))} style={styles.chip}>
              <Text style={styles.chipText}>{q.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={expiry}
          onChangeText={setExpiry}
          placeholder="YYYY-MM-DD"
          style={styles.input}
          placeholderTextColor={colors.textFaint}
        />
        {validExpiry ? (
          <View style={styles.dateRow}>
            <Ionicons name="calendar" size={16} color={colors.primaryDark} />
            <Text style={styles.datePreview}>{prettyDate(expiry)}</Text>
          </View>
        ) : (
          <Text style={styles.dateError}>Enter a date as YYYY-MM-DD</Text>
        )}

        <Step n={4} label="Remind me before" icon="notifications-outline" />
        <View style={styles.stepperRow}>
          <Pressable onPress={() => setLeadDays((d) => Math.max(0, d - 1))} style={styles.stepBtn}>
            <Ionicons name="remove" size={24} color={colors.primaryDark} />
          </Pressable>
          <Text style={styles.leadText}>
            {leadDays} day{leadDays === 1 ? '' : 's'}
          </Text>
          <Pressable onPress={() => setLeadDays((d) => Math.min(60, d + 1))} style={styles.stepBtn}>
            <Ionicons name="add" size={24} color={colors.primaryDark} />
          </Pressable>
        </View>

        <Button
          title="Save to my larder"
          icon="checkmark-circle"
          onPress={save}
          disabled={!name.trim() || !validExpiry}
          style={{ marginTop: spacing.lg }}
        />
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <Pressable onPress={onBack} style={styles.headerBtn} accessibilityLabel="Back" hitSlop={8}>
        <Ionicons name="chevron-back" size={24} color={colors.onPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerBtn} />
    </LinearGradient>
  );
}

function Step({
  n,
  label,
  icon,
}: {
  n: number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNum}>{n}</Text>
      </View>
      <Ionicons name={icon} size={18} color={colors.primary} style={{ marginRight: 6 }} />
      <Text style={styles.stepLabel}>{label}</Text>
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
  step: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  stepNum: { color: colors.primaryDark, fontWeight: '800', fontSize: font.small },
  stepLabel: { fontSize: font.title, fontWeight: '800', color: colors.text },
  or: { textAlign: 'center', color: colors.textMuted, marginVertical: spacing.sm, fontSize: font.small },
  barcodeRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 54,
    fontSize: font.body,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  lookingRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  lookingText: { color: colors.textMuted, fontSize: font.small, marginLeft: spacing.sm },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  typeChip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  typeChipActive: { borderColor: colors.primary, backgroundColor: colors.okBg },
  typeChipText: { fontSize: font.body, color: colors.textMuted, fontWeight: '700' },
  typeChipTextActive: { color: colors.primaryDark },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    backgroundColor: colors.tintBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipText: { color: colors.primaryDark, fontWeight: '700', fontSize: font.small },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  datePreview: { fontSize: font.body, color: colors.primaryDark, fontWeight: '700', marginLeft: 6 },
  dateError: { fontSize: font.small, color: colors.expired, marginTop: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.okBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadText: { fontSize: font.title, fontWeight: '800', color: colors.text },
  scannerWrap: { flex: 1, backgroundColor: '#000' },
  scanOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  scanHint: { color: '#fff', fontSize: font.title, fontWeight: '700', marginBottom: spacing.lg },
  scanFrame: {
    width: 260,
    height: 160,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: radius.md,
    marginBottom: spacing.xl,
  },
});
