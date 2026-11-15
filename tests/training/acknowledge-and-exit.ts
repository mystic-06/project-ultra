import { openTraining } from '../../src/training/workout';
import { upperStarter } from '../../src/training/routines';
import { openNodeDatabase } from './node-database';

async function main() {
  const training = await openTraining(await openNodeDatabase(process.argv[2]));
  await training.start(upperStarter);
  const id = training.getSnapshot().workout!.exercises[0].sets[0].id;
  if (!await training.editSet(id, { load: '40', reps: '6' })) throw new Error('Entry not saved');
  if (!await training.setPerformed(id, true)) throw new Error('Check not saved');
  process.stdout.write('acknowledged\n', () => process.exit(0));
}
void main().catch((error) => { console.error(error); process.exit(1); });
