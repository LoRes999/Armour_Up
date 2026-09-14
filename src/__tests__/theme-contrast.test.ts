import { Palette, darkPalette, lightPalette } from '../theme';

/** WCAG 2 relative luminance of a #RRGGBB colour. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

/**
 * Button text on a coloured fill (E3): white on dark mode's green was about
 * 2:1, dark text on light mode's green 3.9:1, and white on dark mode's red
 * 2.8:1. Text this size needs 4.5:1.
 */
describe.each([
  ['dark', darkPalette],
  ['light', lightPalette],
] as [string, Palette][])('the %s palette', (_, p) => {
  it('keeps text on the success fill readable', () => {
    expect(contrast(p.onSuccess, p.success)).toBeGreaterThanOrEqual(4.5);
  });

  // Green is also a text colour: PR weights, the JOINED pill.
  it('keeps success text readable on the background', () => {
    expect(contrast(p.success, p.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps text on the danger fill readable', () => {
    expect(contrast(p.onDanger, p.danger)).toBeGreaterThanOrEqual(4.5);
  });

  // Light mode's amber was 3.7:1 under white button text and 3.5:1 as link
  // text on the cream ground. Ryan chose a deeper amber (2026-09-13).
  it('keeps text on the accent fill readable', () => {
    expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps accent text readable on the background', () => {
    expect(contrast(p.accent, p.background)).toBeGreaterThanOrEqual(4.5);
  });
});
