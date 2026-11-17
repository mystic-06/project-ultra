import { openTraining } from '../../src/training/workout';
import { openNodeDatabase } from './node-database';

async function main() {
  const database = await openNodeDatabase(process.argv[2]);
  let armed = false;
  const training = await openTraining({
    ...database,
    async run(sql, parameters) {
      await database.run(sql, parameters);
      if (armed && sql === 'DELETE FROM workout_sets') {
        process.stdout.write('interrupted after deletion\n', () => process.exit(0));
        await new Promise(() => {});
      }
    },
  });
  const backup = await training.exportBackup();
  armed = true;
  await training.restoreBackup(backup);
  throw new Error('Restore was not interrupted');
}
void main().catch(error => { console.error(error); process.exit(1); });
