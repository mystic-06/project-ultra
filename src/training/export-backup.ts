import { Directory, type File } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import type { Training } from './workout';

export type BackupExportResult = 'success' | 'cancelled' | 'failed' | 'partial' | 'busy';

// Shared across screens so navigation cannot start a second file operation.
let exporting = false;

export async function exportBackupFile(training: Training): Promise<BackupExportResult> {
  if (exporting) return 'busy';
  exporting = true;
  let created: File | undefined;
  try {
    const destination = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!destination.granted) return 'cancelled';
    const backup = await training.exportBackup();
    const directory = new Directory(destination.directoryUri);
    created = directory.createFile(`project-ultra-backup-${Date.now()}.json`, 'application/json');
    await created.write(JSON.stringify(backup));
    return 'success';
  } catch {
    if (created) {
      try { created.delete(); } catch { return 'partial'; }
    }
    return 'failed';
  } finally {
    exporting = false;
  }
}
