import { Platform, Share } from 'react-native';
import { notify } from './confirm';
import { Client, DayType, Workout } from './models';

/**
 * "Export my data" was a row with a chevron and no handler, cited by name in the
 * account-deletion flow. This is the smallest honest implementation: the data is
 * already all in memory, so it is a JSON document, not a job.
 *
 * There is no expo-file-system or expo-sharing in this project, so the two
 * platforms take different routes — a real download in the browser, the share
 * sheet on a device.
 */
export type ExportBundle = {
  exportedAt: string;
  role: 'trainer' | 'client';
  clients: Client[];
  workouts: Workout[];
  dayTypes: DayType[];
};

export function buildExport(bundle: Omit<ExportBundle, 'exportedAt'>): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...bundle }, null, 2);
}

export async function exportData(bundle: Omit<ExportBundle, 'exportedAt'>) {
  const json = buildExport(bundle);
  const filename = `strength-coach-export-${new Date().toISOString().slice(0, 10)}.json`;

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }

  try {
    await Share.share({ message: json, title: filename });
  } catch {
    notify({
      title: 'Could not export',
      message: 'Sharing was unavailable. Try again from Settings.',
    });
  }
}
