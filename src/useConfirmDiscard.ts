import { useCallback, useRef } from 'react';
// Not re-exported from expo-router's entry point. This is the copy of React
// Navigation that expo-router itself runs on; installing @react-navigation/native
// separately would bring a second navigation context that never sees these screens.
import { useNavigation, usePreventRemove } from 'expo-router/build/react-navigation/core';
import { confirm } from './confirm';

/**
 * Asks before a form with unsaved typing is closed — by its Cancel button, a
 * swipe down on iOS, or Android's back button. A form with nothing in it closes
 * straight away.
 *
 * While `dirty` is true, iOS refuses the swipe-to-dismiss natively and hands the
 * decision here instead, so the sheet springs back rather than vanishing with
 * what was typed.
 *
 * Returns `leave`: wrap a deliberate exit (Save, Delete) in it so that exit is
 * not questioned. Those change the store first, so there is nothing to discard.
 */
export function useConfirmDiscard(dirty: boolean, message: string, onDiscard?: () => void) {
  const navigation = useNavigation();
  const leaving = useRef(false);

  usePreventRemove(dirty, ({ data }) => {
    // Re-dispatching the intercepted action does not ask again: React Navigation
    // marks this screen as already asked on the action itself.
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    confirm({
      title: 'Discard changes?',
      message,
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
      // A screen that saves as it goes (the workout builder) undoes here.
      // After leaving, not before: the undo can remove the record the screen
      // is reading, and undoing first rendered it against nothing — a frame
      // of "Workout not found", and a second "Discard changes?" raised by a
      // dirty check recomputed against a record that had just gone.
      onConfirm: () => {
        navigation.dispatch(data.action);
        onDiscard?.();
      },
    });
  });

  return useCallback((exit: () => void) => {
    leaving.current = true;
    exit();
  }, []);
}
