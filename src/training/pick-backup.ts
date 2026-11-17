import { File } from 'expo-file-system';
import { validateBackup, type BackupV1 } from './backup-schema';

export type BackupPickResult = { status: 'selected'; backup: BackupV1 } | { status: 'cancelled' } | { status: 'failed' };

/** SDK 58's options overload maps every native error to cancellation. The
 * positional overload retains Android's PickerCancelledException error code. */
export async function pickBackupFile(): Promise<BackupPickResult> {
  let selected: File | File[];
  try {
    selected = await File.pickFileAsync(undefined, '*/*');
  } catch (error) {
    return { status: typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_PICKER_CANCELLED' ? 'cancelled' : 'failed' };
  }
  try {
    if (Array.isArray(selected)) return { status: 'failed' };
    return { status: 'selected', backup: validateBackup(JSON.parse(await selected.text())) };
  } catch {
    return { status: 'failed' };
  }
}
