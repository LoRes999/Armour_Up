import { Alert, Platform } from 'react-native';

/**
 * A yes/no question, on every platform the app runs on.
 *
 * react-native-web ships `Alert.alert` as an empty function, so every
 * confirmation built on it — sign out, finish session, delete anything — is a
 * button that silently does nothing in a browser. Since the app is reviewed in
 * Safari, that is not a cosmetic gap; it is the flow being untestable.
 */
export function confirm({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  /** For a choice between two actions, where the second button does something too. */
  onCancel?: () => void;
}) {
  if (Platform.OS === 'web') {
    // The browser's own dialog is plain, but it is real, and the labels below
    // are already carried in the title and message.
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line no-alert
    if (window.confirm(text)) onConfirm();
    else onCancel?.();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel', onPress: onCancel },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

/**
 * A pick between a few things, each its own button, plus Cancel. On the web,
 * which has no such dialog, each is offered in turn.
 */
export function choose({
  title,
  message,
  options,
  cancelLabel = 'Cancel',
}: {
  title: string;
  message?: string;
  options: { label: string; onPress: () => void }[];
  cancelLabel?: string;
}) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    for (const option of options) {
      // eslint-disable-next-line no-alert
      if (window.confirm(`${title}\n\n${option.label}?`)) {
        option.onPress();
        return;
      }
    }
    return;
  }

  Alert.alert(title, message, [
    ...options.map((option) => ({ text: option.label, onPress: option.onPress })),
    { text: cancelLabel, style: 'cancel' as const },
  ]);
}

/**
 * A one-button notice, for the same reason as `confirm` above: there is nothing
 * to decide, but the message still has to actually appear in a browser.
 */
export function notify({ title, message }: { title: string; message?: string }) {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined') window.alert(text);
    return;
  }

  Alert.alert(title, message);
}
