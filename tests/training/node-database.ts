import { DatabaseSync } from 'node:sqlite';

import type { TrainingDatabase } from '../../src/training/database';

export async function openNodeDatabase(path: string): Promise<TrainingDatabase> {
  const database = new DatabaseSync(path);
  return {
    async exec(sql) { database.exec(sql); },
    async run(sql, parameters) { database.prepare(sql).run(...parameters); },
    async all<T>(sql: string, parameters = []) {
      return database.prepare(sql).all(...parameters) as T[];
    },
    async close() { database.close(); },
  };
}

/** Delays/failures live at the persistence seam; statements still use real SQLite. */
export function controlCommits(database: TrainingDatabase) {
  let nextCommit: (() => Promise<void>) | undefined;
  return {
    database: {
      ...database,
      async exec(sql: string) {
        if (sql === 'COMMIT' && nextCommit) {
          const intercept = nextCommit;
          nextCommit = undefined;
          await intercept();
        }
        await database.exec(sql);
      },
    },
    failNextCommit() {
      nextCommit = async () => { throw new Error('Simulated storage failure'); };
    },
    holdNextCommit({ fail = false } = {}) {
      let release!: () => void;
      let arrived!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const entered = new Promise<void>((resolve) => { arrived = resolve; });
      nextCommit = async () => {
        arrived();
        await held;
        if (fail) throw new Error('Simulated delayed storage failure');
      };
      return { entered, release };
    },
  };
}
