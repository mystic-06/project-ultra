---
status: accepted
---

# Measurement edits, unit conversion, and catalogue identity

Approved by the owner on 2026-11-16 while scheduling the remaining release tickets. Invalid edits to a checked result immediately uncheck it, retain raw text in memory, and require an explicit check after correction; valid corrections continue to retain the check. Clearing required reps remains immediate, as already agreed. Durable saves must acknowledge the uncheck without replacing the latest visible raw input with older values; incomplete text after process death remains outside the guarantee in ADR 0001.

Unit conversions display up to two decimals without trailing zeros, while repeated display-unit toggles preserve the original recorded measurement and precision. Editing a converted value records a new measurement in the displayed unit. Assistance is a separate nonnegative magnitude with at most two input decimals, required for assisted-set completion (zero allowed), and rendered with exactly one minus prefix; no combined effective load is calculated.

Custom exercises use chest, back, shoulders, biceps, triceps, forearms, abs, glutes, quads, hamstrings, calves, and full body as body-part choices. Archival hides exercises from new selections but leaves them usable in existing routines. Measurement-definition changes apply to future selections; existing plans and historical records retain their earlier definition. This trades implicit updates for stable meaning in saved plans and results.
