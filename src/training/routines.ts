export interface Routine {
  id: string;
  title: string;
  exercises: {
    exerciseId: string;
    name: string;
    loadConvention: string;
    entryMode?: import('./catalogue').EntryMode;
    restSeconds?: number;
    sets: { type: 'normal' | 'warmup' | 'drop'; targetMin: number; targetMax: number }[];
  }[];
}

// Weighted bilateral subset of the owner's UPPER prescription. Other modes follow later.
export const upperStarter: Routine = {
  id: 'upper-weighted-starter',
  title: 'UPPER · weighted starter',
  exercises: [
    {
      exerciseId: 'lat-pulldown', name: 'Lat pulldown', loadConvention: 'Displayed machine load',
      sets: Array.from({ length: 2 }, () => ({ type: 'normal', targetMin: 5, targetMax: 7 })),
    },
    {
      exerciseId: 'chest-press-machine', name: 'Chest press · machine', loadConvention: 'Displayed machine load',
      sets: Array.from({ length: 2 }, () => ({ type: 'normal', targetMin: 7, targetMax: 9 })),
    },
    {
      exerciseId: 'overhead-press-barbell', name: 'Overhead press · barbell', loadConvention: 'Combined load, including the bar',
      sets: [
        { type: 'warmup', targetMin: 4, targetMax: 6 },
        { type: 'normal', targetMin: 4, targetMax: 6 },
        { type: 'normal', targetMin: 4, targetMax: 6 },
      ],
    },
  ],
};
