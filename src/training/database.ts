export type SqlValue = string | number | null;

/** Owned by the workout module; callers must not reuse the connection. */
export interface TrainingDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, parameters: SqlValue[]): Promise<void>;
  all<T>(sql: string, parameters?: SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}
