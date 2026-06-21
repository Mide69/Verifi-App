import { Platform, ViewStyle } from 'react-native';

// Modern, friendly palette for a consumer food app. High contrast for accessibility.
export const colors = {
  // surfaces
  page: '#E8ECF1', // page backdrop (visible around the app column on web)
  bg: '#F7F9FB', // app background
  card: '#FFFFFF',
  cardAlt: '#F3F6F9',

  // text
  text: '#0F1B2D',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  border: '#E6EBF1',

  // brand (fresh green → teal)
  primary: '#16A36B',
  primaryDark: '#0E7A4F',
  gradFrom: '#1FB173',
  gradTo: '#0FA39A',
  onPrimary: '#FFFFFF',
  tintBg: '#E7F6EF',

  // urgency
  expired: '#DC2626',
  critical: '#EA580C',
  soon: '#D97706',
  ok: '#16A36B',

  expiredBg: '#FDECEC',
  criticalBg: '#FFF1E8',
  soonBg: '#FEF6E7',
  okBg: '#E7F6EF',
};

export const gradients = {
  brand: [colors.gradFrom, colors.gradTo] as const,
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const font = {
  h1: 28,
  h2: 22,
  title: 18,
  body: 16,
  small: 14,
  tiny: 12,
};

// Cross-platform elevation: CSS box-shadow on web, native shadow props elsewhere.
export function shadow(level: 1 | 2 | 3 = 1): ViewStyle {
  const cfg = {
    1: { y: 2, blur: 8, opacity: 0.08, elev: 2 },
    2: { y: 6, blur: 18, opacity: 0.12, elev: 6 },
    3: { y: 12, blur: 28, opacity: 0.18, elev: 12 },
  }[level];
  if (Platform.OS === 'web') {
    return { boxShadow: `0 ${cfg.y}px ${cfg.blur}px rgba(15,27,45,${cfg.opacity})` } as ViewStyle;
  }
  return {
    shadowColor: '#0F1B2D',
    shadowOffset: { width: 0, height: cfg.y },
    shadowOpacity: cfg.opacity,
    shadowRadius: cfg.blur / 2,
    elevation: cfg.elev,
  };
}
