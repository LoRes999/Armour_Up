import NetInfo from '@react-native-community/netinfo';

/**
 * Online or not, as far as uploading is concerned. "Connected to Wi-Fi with no
 * internet behind it" — a gym's captive portal — counts as offline, so the
 * queue waits instead of failing its way through retries.
 */
export function watchConnection(onChange: (online: boolean) => void): () => void {
  const report = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) =>
    onChange(state.isConnected !== false && state.isInternetReachable !== false);
  void NetInfo.fetch().then(report);
  return NetInfo.addEventListener(report);
}
