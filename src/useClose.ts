import { useCallback } from 'react';
import { type Href, useRouter } from 'expo-router';

/**
 * Closes the current screen.
 *
 * `router.back()` does nothing when there is nothing to go back to — a screen
 * opened straight from a link, or a browser page that was reloaded — so Cancel,
 * Close and Save on those screens silently did nothing and left no way out.
 * With no history, this goes to `fallback` instead. The root route is a safe
 * default: it redirects to whichever home the signed-in role has.
 */
export function useClose(fallback: Href = '/') {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
