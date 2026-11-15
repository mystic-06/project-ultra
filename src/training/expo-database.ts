import { openDatabaseAsync } from 'expo-sqlite';

import type { TrainingDatabase } from './database';

export async function openExpoDatabase(name = 'ultra-training.db'): Promise<TrainingDatabase> {
  // A private handle prevents unrelated callers from joining this module's transactions.
  const database = await openDatabaseAsync(name, { useNewConnection: true });
  return {
    exec: (sql) => database.execAsync(sql),
    async run(sql, parameters) { await database.runAsync(sql, parameters); },
    all: (sql, parameters = []) => database.getAllAsync(sql, parameters),
    close: () => database.closeAsync(),
  };
}
