---
status: accepted
---

# Explicit logical backup and atomic restore

The owner approved a versioned JSON backup on 2026-11-16, including saved authoring drafts as well as the previously agreed training data. Unknown versions are rejected before replacement. A confirmed restore replaces data in one SQLite transaction, using the module-owned queue and connection so interrupted or failed replacement leaves recoverable existing data; validation, an export-first offer, and separate replacement confirmation remain required.

Android automatic cloud backup is disabled through app configuration so backup remains an explicit user-controlled file operation. This gives up platform-managed recovery in favor of an inspectable versioned format and the agreed offline privacy model; manual export/restore must clearly expose success, cancellation and failure. Native configuration and file behavior still require an installed Android build to verify.
