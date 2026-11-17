export type EntryMode = 'weighted' | 'unilateral' | 'bodyweight' | 'assisted' | 'unilateral-bodyweight' | 'unilateral-assisted';
export const entryModes: EntryMode[] = ['weighted', 'unilateral', 'bodyweight', 'assisted', 'unilateral-bodyweight', 'unilateral-assisted'];
export const isUnilateral = (mode: EntryMode) => mode === 'unilateral' || mode.startsWith('unilateral-');
export const isBodyweight = (mode: EntryMode) => mode === 'bodyweight' || mode === 'unilateral-bodyweight';
export const isAssisted = (mode: EntryMode) => mode === 'assisted' || mode === 'unilateral-assisted';
export const bodyParts = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'glutes', 'quads', 'hamstrings', 'calves', 'full body'] as const;
export interface CustomExercise extends CatalogueExercise { bodyParts: string[]; fraction: number | null; archived: boolean }
export interface CatalogueExercise {
  id: string; name: string; equipment: string; entryMode: EntryMode; loadConvention: string;
  sourceId: string | null; aliases: string[];
}
// Curated metadata from Free Exercise DB (Unlicense) plus documented Project Ultra variants.
// See docs/catalogue.md and assets/licenses/free-exercise-db-Unlicense.txt.
const catalogue: CatalogueExercise[] = [
  {
    "id": "pull-up",
    "name": "Pull-up",
    "equipment": "bodyweight",
    "entryMode": "bodyweight",
    "loadConvention": "Bodyweight",
    "sourceId": "Pullups",
    "aliases": [
      "Pull Up",
      "Pullups"
    ]
  },
  {
    "id": "assisted-pull-up",
    "name": "Pull-up \u00b7 assisted machine",
    "equipment": "machine",
    "entryMode": "assisted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": null,
    "aliases": [
      "Pull Up (Assisted)"
    ]
  },
  {
    "id": "lat-pulldown",
    "name": "Lat pulldown \u00b7 cable",
    "equipment": "cable",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Wide-Grip_Lat_Pulldown",
    "aliases": [
      "Lat Pulldown (Cable)",
      "Wide-Grip Lat Pulldown"
    ]
  },
  {
    "id": "chest-press-machine",
    "name": "Chest press \u00b7 machine",
    "equipment": "machine",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Machine_Bench_Press",
    "aliases": [
      "Machine Bench Press"
    ]
  },
  {
    "id": "seated-cable-row",
    "name": "Seated cable row \u00b7 V grip",
    "equipment": "cable",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Seated_Cable_Rows",
    "aliases": [
      "Seated Cable Row - V Grip (Cable)",
      "Seated Cable Rows"
    ]
  },
  {
    "id": "overhead-press-barbell",
    "name": "Overhead press \u00b7 barbell",
    "equipment": "barbell",
    "entryMode": "weighted",
    "loadConvention": "Combined external load, including the bar",
    "sourceId": "Standing_Military_Press",
    "aliases": [
      "Overhead Press (Barbell)",
      "Standing Military Press"
    ]
  },
  {
    "id": "rear-delt-machine",
    "name": "Rear delt reverse fly \u00b7 machine",
    "equipment": "machine",
    "entryMode": "unilateral",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Reverse_Machine_Flyes",
    "aliases": [
      "Reverse Machine Flyes"
    ]
  },
  {
    "id": "preacher-curl-machine",
    "name": "Preacher curl \u00b7 machine",
    "equipment": "machine",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Machine_Preacher_Curls",
    "aliases": [
      "Preacher Curl (Machine)",
      "Machine Preacher Curls"
    ]
  },
  {
    "id": "triceps-pushdown",
    "name": "Triceps pushdown",
    "equipment": "cable",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Triceps_Pushdown",
    "aliases": [
      "Triceps Pushdown"
    ]
  },
  {
    "id": "bulgarian-split-squat",
    "name": "Bulgarian split squat \u00b7 dumbbell",
    "equipment": "dumbbell",
    "entryMode": "unilateral",
    "loadConvention": "Working-side external load",
    "sourceId": "Split_Squat_with_Dumbbells",
    "aliases": [
      "Bulgarian Split Squat (Dumbbell)",
      "Split Squat with Dumbbells"
    ]
  },
  {
    "id": "seated-leg-curl",
    "name": "Seated leg curl \u00b7 machine",
    "equipment": "machine",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Seated_Leg_Curl",
    "aliases": [
      "Seated Leg Curl (Machine)",
      "Seated Leg Curl"
    ]
  },
  {
    "id": "leg-extension",
    "name": "Leg extension \u00b7 machine",
    "equipment": "machine",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Leg_Extensions",
    "aliases": [
      "Leg Extension (Machine)",
      "Leg Extensions"
    ]
  },
  {
    "id": "bench-press-barbell",
    "name": "Bench press \u00b7 barbell",
    "equipment": "barbell",
    "entryMode": "weighted",
    "loadConvention": "Combined external load, including the bar",
    "sourceId": "Barbell_Bench_Press_-_Medium_Grip",
    "aliases": [
      "Bench Press (Barbell)",
      "Barbell Bench Press - Medium Grip"
    ]
  },
  {
    "id": "chest-fly-machine",
    "name": "Chest fly \u00b7 machine",
    "equipment": "machine",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Butterfly",
    "aliases": [
      "Chest Fly (Machine)",
      "Butterfly"
    ]
  },
  {
    "id": "chest-dip",
    "name": "Chest dip",
    "equipment": "bodyweight",
    "entryMode": "bodyweight",
    "loadConvention": "Bodyweight",
    "sourceId": "Dips_-_Chest_Version",
    "aliases": [
      "Dips - Chest Version"
    ]
  },
  {
    "id": "single-arm-lateral-raise",
    "name": "Single arm lateral raise \u00b7 cable",
    "equipment": "cable",
    "entryMode": "unilateral",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Standing_Low-Pulley_Deltoid_Raise",
    "aliases": [
      "Single Arm Lateral Raise (Cable)",
      "Standing Low-Pulley Deltoid Raise"
    ]
  },
  {
    "id": "face-pull",
    "name": "Face pull",
    "equipment": "cable",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Face_Pull",
    "aliases": [
      "Face Pull"
    ]
  },
  {
    "id": "bicep-curl-cable",
    "name": "Bicep curl \u00b7 cable",
    "equipment": "cable",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Standing_Biceps_Cable_Curl",
    "aliases": [
      "Bicep Curl (Cable)",
      "Standing Biceps Cable Curl"
    ]
  },
  {
    "id": "smith-squat",
    "name": "Squat \u00b7 Smith machine",
    "equipment": "machine",
    "entryMode": "weighted",
    "loadConvention": "Displayed machine/cable load",
    "sourceId": "Smith_Machine_Squat",
    "aliases": [
      "Squat (Smith Machine)",
      "Smith Machine Squat"
    ]
  }
];

export function searchExercises(query = '', custom: CustomExercise[] = []): CatalogueExercise[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...catalogue, ...custom.filter((item) => !item.archived)].filter((exercise) => {
    const text = [exercise.name, exercise.equipment, ...exercise.aliases, ...('bodyParts' in exercise ? (exercise as CustomExercise).bodyParts : [])].join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  }).map((exercise) => ({ ...exercise, aliases: [...exercise.aliases], ...('bodyParts' in exercise ? { bodyParts: [...(exercise as CustomExercise).bodyParts] } : {}) }));
}

export function catalogueExercise(id: string): CatalogueExercise {
  const exercise = catalogue.find((item) => item.id === id);
  if (!exercise) throw new Error('Exercise not found in the offline catalogue.');
  return { ...exercise, aliases: [...exercise.aliases] };
}

export function exerciseDefinition(item: CatalogueExercise): string {
  return JSON.stringify([item.id, item.name, item.equipment, item.entryMode, item.loadConvention, 'fraction' in item ? item.fraction : null, 'bodyParts' in item ? item.bodyParts : null]);
}
