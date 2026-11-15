# Navigation package for Bellatrix

For Rahma, from Sebastian, 15 November 2026.

Copy everything in this folder into the root of the Bellatrix Care Lab repo. Nothing in it overwrites an
existing file. Then give your agent the text of `PROMPT.md`.

| Path | What |
|---|---|
| `PLAN-NAV.md` | the build plan: what the agent builds, the numbers, the device test for Monday |
| `PROMPT.md` | the prompt for your agent |
| `android/vendor/vergil-navigation.jar` | Vergil's route planner, ready to use from Java 8 |
| `android/vendor/kotlin-stdlib-2.0.20.jar` | the runtime the planner needs |
| `android/vendor/vergil-navigation-src/` | the planner's source, tests and build files, to see or rebuild the jar |
| `reference/vergil/` | the Kotlin original of the drive, a working Java example and LabLand's notes on the robots |

Checked on 15 November: the jar compiles with your `javac --release 8`, goes through your `d8`, and plans a route
from Java. It has not run on your robot yet: that is Monday's test (`PLAN-NAV.md`, "Device test on Monday").

Questions to Sebastian.
