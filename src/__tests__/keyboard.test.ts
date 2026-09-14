import { Platform } from 'react-native';
import { dismissKeyboard, keyboardUp } from '../keyboard';

/**
 * Tapping the dimmed backdrop hides the keyboard first, and only a second tap
 * closes the card. On the web Keyboard.isVisible() always said no, so the
 * first tap closed the day-type editor or the weight keypad and threw away
 * what had been typed (D6). There, a focused text field is the keyboard.
 */
describe('the keyboard on the web', () => {
  const blur = jest.fn();
  const focus = (tagName: string) => {
    (globalThis as { document?: unknown }).document = { activeElement: { tagName, blur } };
  };

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web');
    blur.mockClear();
  });

  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
    jest.restoreAllMocks();
  });

  it('is up while a text field has focus', () => {
    focus('INPUT');
    expect(keyboardUp()).toBe(true);
    focus('TEXTAREA');
    expect(keyboardUp()).toBe(true);
  });

  it('is down when nothing is being typed in', () => {
    focus('BODY');
    expect(keyboardUp()).toBe(false);
  });

  it('is put away by taking focus off the field', () => {
    focus('INPUT');
    dismissKeyboard();
    expect(blur).toHaveBeenCalledTimes(1);
  });
});
