import { useColorScheme } from 'react-native';
import { useStore } from './store';

/**
 * "Warm Nocturne" — dark-first espresso ground with an amber accent.
 * Both schemes are declared here so no screen hardcodes a colour.
 */
export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  dim: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  coral: string;
  success: string;
  danger: string;
  dangerSoft: string;
  /** Text and icons on a success or danger fill, at 4.5:1 or better. */
  onSuccess: string;
  onDanger: string;
  /** Swatches a trainer picks from when naming a day type. Index-stable across themes. */
  tagColors: string[];
}

export const darkPalette: Palette = {
  background: '#171214',
  surface: '#211A1D',
  surfaceAlt: '#2B2226',
  border: '#382C31',
  text: '#F2E9E4',
  dim: '#9C8B85',
  accent: '#E8A33D',
  accentSoft: '#3A2C18',
  onAccent: '#1A1206',
  coral: '#E4705A',
  success: '#7EC58C',
  danger: '#F0776B',
  dangerSoft: '#3A1E1C',
  // White on these fills was about 2:1 and 2.8:1; dark text reads at 8:1 and 6.8:1.
  onSuccess: '#10240F',
  onDanger: '#2A0D0A',
  tagColors: ['#E8A33D', '#E4705A', '#7EC58C', '#6FA8DC', '#B98CD9', '#D9A05B', '#5FBFB0', '#E0678F'],
};

export const lightPalette: Palette = {
  background: '#FAF6F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F2EBE4',
  border: '#E6DBD1',
  text: '#1E1719',
  dim: '#7C6E68',
  // Deeper than the #B87516 it was, which read at 3.7:1 under white button
  // text and 3.5:1 as link text on the ground (Ryan's call, 2026-09-13).
  accent: '#9E630E',
  accentSoft: '#FCF0DC',
  onAccent: '#FFFFFF',
  coral: '#C9543C',
  // Was #3E8B52: 4.2:1 under white, 3.9:1 as text on the ground.
  success: '#367E4B',
  danger: '#C0392B',
  dangerSoft: '#FBEAE7',
  onSuccess: '#FFFFFF',
  onDanger: '#FFFFFF',
  // Same hues, darkened so they hold contrast against the light ground.
  tagColors: ['#B87516', '#C9543C', '#3E8B52', '#3C7BB8', '#8B5FB0', '#A5701F', '#2E8C7E', '#C24A72'],
};

export const metrics = {
  cardRadius: 18,
  controlRadius: 12,
  buttonRadius: 15,
  /** Nothing tappable goes below this. */
  hitTarget: 44,
  screenPadding: 20,
};

/** Resolves the appearance override against the OS setting. */
export function usePalette(): Palette {
  const system = useColorScheme();
  const { appearance } = useStore();
  const effective = appearance === 'system' ? (system ?? 'dark') : appearance;
  return effective === 'light' ? lightPalette : darkPalette;
}

export function useIsDark(): boolean {
  const system = useColorScheme();
  const { appearance } = useStore();
  const effective = appearance === 'system' ? (system ?? 'dark') : appearance;
  return effective !== 'light';
}

/**
 * The design uses Bricolage Grotesque. Add it with expo-font and set
 * `family` to the loaded name; until then the system face carries the
 * layout, which has close enough metrics that nothing shifts.
 */
export const type = {
  family: undefined as string | undefined,
  title: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -1 },
  heading: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.5 },
  body: { fontSize: 15, fontWeight: '500' as const },
  label: { fontSize: 12, fontWeight: '600' as const },
  eyebrow: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 1.1 },
};

/** Resolves a day type's stored swatch index against the active theme. */
export function tagColor(palette: Palette, colorIndex: number | undefined): string {
  if (colorIndex === undefined) return palette.dim;
  return palette.tagColors[colorIndex % palette.tagColors.length];
}
