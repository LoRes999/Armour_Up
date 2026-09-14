import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { notify } from './confirm';
import { Client, DayType, Workout } from './models';

/**
 * "Export my data" was a row with a chevron and no handler, cited by name in the
 * account-deletion flow. This is the smallest honest implementation: the data is
 * already all in memory, so it is a JSON document, not a job.
 *
 * In the browser it downloads as a file. On a phone it is written to a real
 * .json file and handed to the share sheet — it used to be shared as the text of
 * a message, which Android pasted into a chat as one enormous message and iOS
 * saved as a .txt.
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
  const filename = `armourup-export-${new Date().toISOString().slice(0, 10)}.json`;

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Not straight away: Safari can still be resolving the download when
    // click() returns, and revoking the URL then cancels it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const file = await writeExportFile(filename, json);
  try {
    if (file) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: filename,
      });
    } else {
      // No file to hand over, so share the text itself: it still gets the data out.
      await Share.share({ message: json, title: filename });
    }
  } catch {
    // Not a second share sheet: one that failed to open would likely fail again.
    notify({
      title: 'Could not export',
      // Coaches have a Settings tab, clients a Profile tab, so name neither.
      message: 'Sharing was unavailable. Please try again.',
    });
  }
}

/**
 * Writes the export to the cache folder — it only has to live until the share
 * sheet has taken a copy. Null when files cannot be shared or written here.
 */
async function writeExportFile(filename: string, json: string): Promise<File | null> {
  try {
    if (!(await Sharing.isAvailableAsync())) return null;
    const file = new File(Paths.cache, filename);
    file.create({ overwrite: true });
    file.write(json);
    return file;
  } catch {
    return null;
  }
}
