# Navigation update 1 for Bellatrix

For Rahma, from Sebastian, 16 November 2026.

One fix to the navigation package of 15 November. When a corridor is blocked, Bellatrix blocks a circle on its map
and plans another way. The circle often landed in the wrong place: by the time Bellatrix gives up on a leg, the
robot's own navigation has often driven the robot away from the obstacle already. We fixed this in Vergil on
15 November, just after the package went out. The circle now goes where the robot met the obstacle.

Copy everything in this folder into the root of the Bellatrix Care Lab repo. Nothing in it overwrites an existing
file. Then give your agent the text of `PROMPT-NAV-UPDATE-1.md`.

| Path | What |
|---|---|
| `PLAN-NAV-UPDATE-1.md` | what changes, why, the numbers, the check, one more point for the device test |
| `PROMPT-NAV-UPDATE-1.md` | the prompt for your agent |
| `reference/vergil/BlockSpot.java` | the fix in Java 8, ready to copy into `android/src` |
| `reference/vergil/BlockSpotCheck.java` | its check on the desktop, with two real blockades from Vergil's robot |
| `reference/vergil/Barriers.kt` | the Kotlin original from Vergil |

Checked on 16 November: `BlockSpot.java` compiles with `javac --release 8`, and `BlockSpotCheck` passes all eight
cases. It has not run on your robot yet. If the device test has already passed point 4 (the box in the corridor),
run that point again after the update.

Questions to Sebastian.
