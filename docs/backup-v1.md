# Backup version 1

The JSON object has `version: 1` and a `data` object. Its fixed table and column projection is declared in `src/training/backup-schema.ts` and shared by export and restore; arrays represent records, including empty tables. Scalar values use the stored text, number, or null representation. The `data` field of saved routines and custom exercises contains their JSON representation; authoring draft `data` contains the exact acknowledged raw text. Array order is significant for routines, custom exercises, and equipment setups.

The routine seed marker is included so an intentionally empty collection remains empty. References, original units and measurements, active and completed workouts, and both remembered-equipment tables are retained. Rest settings are included, but the running rest deadline is deliberately omitted. The file is captured inside the training module's serialized database queue, so it contains acknowledged database state rather than transient UI input.

Restore is a separate feature. It must reject unknown versions and validate the complete structure, fields, values and cross-record references before changing anything. Apply a confirmed replacement in one transaction on the module-owned connection; restore records in array order and set the omitted rest deadline to null. Never treat names from a file as SQL identifiers. Offer export and obtain separate replacement confirmation before modifying live data.

Validation preserves version-one compatibility with older saved routine and workout rest overrides: nonnegative safe integers, including zero and values above today’s authoring limit, remain unchanged. Custom draft text is preserved exactly, while its editor fields and custom identity must be present and structurally usable; unfinished input values can remain incomplete.

Parseable routine drafts must have a usable editor structure, while preserving blank and incomplete input strings. Syntactically incomplete legacy routine drafts remain in the file and can be discarded; the editor reports that they cannot be opened.
