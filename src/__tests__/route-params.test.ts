import { routeParam } from '../routeParams';

/**
 * Screens declared their params as `{ id: string }` when expo-router can hand
 * back `string | string[] | undefined`. The wrong type was the defect: an
 * array reached a lookup as an array and matched nothing, which every screen
 * shows as its own "not found" — the same dead end as a real missing record,
 * with nothing to say which it was.
 */

describe('a route parameter', () => {
  it('passes a plain one straight through', () => {
    expect(routeParam('w-1')).toBe('w-1');
  });

  it('takes the first when the router repeats it', () => {
    expect(routeParam(['w-1', 'w-2'])).toBe('w-1');
  });

  it('is empty when there is none', () => {
    expect(routeParam(undefined)).toBe('');
    expect(routeParam([])).toBe('');
  });
});
