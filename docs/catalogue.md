# Offline starter catalogue

Selected for issue #5 before implementation: [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), revision `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`, `dist/exercises.json`, retrieved 2026-11-16. Upstream uses the [Unlicense](https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/LICENSE.md); its full notice is bundled under `assets/licenses/`. Only selected names/equipment metadata are adapted. No upstream images or instructional text are shipped. Application names, aliases, load conventions and entry modes are curated here; no bodyweight fractions are inferred.

This catalogue contains 19 built-in records independent of custom exercises. The following mapping covers all 16 distinct names in `docs/training-examples.md` and the additional UPPER movements in `context.md`. Renamed records are searchable using the export names.

| Project Ultra exercise | Upstream record / adaptation |
| --- | --- |
| Pull-up | `Pullups` |
| Pull-up · assisted machine | Original Project Ultra assisted-machine variant; not equated to band assistance |
| Lat pulldown · cable | `Wide-Grip_Lat_Pulldown` |
| Chest press · machine | `Machine_Bench_Press` |
| Seated cable row · V grip | `Seated_Cable_Rows` |
| Overhead press · barbell | `Standing_Military_Press` |
| Rear delt reverse fly · machine | `Reverse_Machine_Flyes` |
| Preacher curl · machine | `Machine_Preacher_Curls` |
| Triceps pushdown | `Triceps_Pushdown` |
| Bulgarian split squat · dumbbell | `Split_Squat_with_Dumbbells` |
| Seated leg curl · machine | `Seated_Leg_Curl` |
| Leg extension · machine | `Leg_Extensions` |
| Bench press · barbell | `Barbell_Bench_Press_-_Medium_Grip` |
| Chest fly · machine | `Butterfly` |
| Chest dip | `Dips_-_Chest_Version` |
| Single arm lateral raise · cable | `Standing_Low-Pulley_Deltoid_Raise` |
| Face pull | `Face_Pull` |
| Bicep curl · cable | `Standing_Biceps_Cable_Curl` |
| Squat · Smith machine | `Smith_Machine_Squat` |

V-grip rows, rear-foot-elevated Bulgarian split squats, and unilateral rear-delt execution are explicit Project Ultra variants of the listed movement families, rather than claims that the upstream records prescribe those details. Pull-up and assisted pull-up retain distinct identities. Existing starter exercise IDs are retained for matching. The UPPER option “pull-up or assisted pull-up” has both choices available.

Coverage means offline discovery and selection in issue #5. Unilateral logging is issue #7, bodyweight logging is #9, and assistance logging is #10. Until those entry modes are implemented, their workouts can be arranged but their numeric logging is disabled with an explanatory message. Weighted bilateral exercises retain the existing logging path.
