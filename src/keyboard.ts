import { Keyboard, Platform } from 'react-native';

/**
 * Whether the on-screen keyboard is up. react-native-web's Keyboard always
 * answers no, so on the web a focused text field stands in for it: tapping a
 * dimmed backdrop there closed the card and threw away what had been typed.
 */
export function keyboardUp(): boolean {
  if (Platform.OS !== 'web') return Keyboard.isVisible();
  if (typeof document === 'undefined') return false;
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/** Puts the keyboard away: on the web, by taking focus off the field. */
export function dismissKeyboard(): void {
  if (Platform.OS !== 'web') {
    Keyboard.dismiss();
    return;
  }
  if (typeof document === 'undefined') return;
  (document.activeElement as HTMLElement | null)?.blur?.();
}
