import { renderHook } from '@testing-library/react-native';
import { useConfirmDiscard } from '../useConfirmDiscard';

/**
 * The order the discard hook does its two jobs in.
 *
 * A screen that saves as it goes undoes its changes here, and that undo can
 * remove the very record the screen is reading. Undoing before the screen has
 * gone renders it against nothing: one frame of "Workout not found", and a
 * `dirty` recomputed against a record that is no longer there — which asked
 * "Discard changes?" a second time, on top of the delete just confirmed.
 */

const dispatch = jest.fn();
let intercept: ((event: { data: { action: unknown } }) => void) | undefined;
let asked: { onConfirm: () => void } | undefined;

jest.mock('expo-router/build/react-navigation/core', () => ({
  useNavigation: () => ({ dispatch: mockDispatch() }),
  usePreventRemove: (_dirty: boolean, handler: (event: { data: { action: unknown } }) => void) => {
    mockSetIntercept(handler);
  },
}));

jest.mock('../confirm', () => ({
  confirm: (options: { onConfirm: () => void }) => mockSetAsked(options),
}));

// Referenced from the factories above, which may not close over locals.
function mockDispatch() {
  return dispatch;
}
function mockSetIntercept(handler: (event: { data: { action: unknown } }) => void) {
  intercept = handler;
}
function mockSetAsked(options: { onConfirm: () => void }) {
  asked = options;
}

beforeEach(() => {
  dispatch.mockReset();
  intercept = undefined;
  asked = undefined;
});

describe('discarding changes', () => {
  it('leaves the screen before undoing what it would read', async () => {
    const order: string[] = [];
    dispatch.mockImplementation(() => order.push('left'));
    await renderHook(() => useConfirmDiscard(true, 'Lost.', () => order.push('undone')));

    intercept?.({ data: { action: { type: 'POP' } } });
    asked?.onConfirm();

    expect(order).toEqual(['left', 'undone']);
  });

  it('asks nothing of a deliberate exit', async () => {
    const onDiscard = jest.fn();
    const { result } = await renderHook(() => useConfirmDiscard(true, 'Lost.', onDiscard));

    result.current(() => undefined);
    intercept?.({ data: { action: { type: 'POP' } } });

    expect(asked).toBeUndefined();
    expect(dispatch).toHaveBeenCalledWith({ type: 'POP' });
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
