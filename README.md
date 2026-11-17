# LANTERNFALL

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/NoxenChen/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/NoxenChen/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Defend the last lantern. A wave-based arena survival game built for the make.fun `best-game-01` bounty — no framework, no network, just static files and a browser.

## The game

You are a wisp defending a central lantern from ten waves of shadow creatures. WASD to move, mouse to aim, hold click to shoot. The twist: **the lantern's light is its health** — shadows that reach it eat its flame, and kills drop embers that refuel it, so every kill is also a repair.

- Four enemy types: Shade (walks to the lantern), Skitter (chases and zigzags), Brute (tanks and hits hard), Spitter (shoots globs from range)
- 10 escalating waves, victory at wave 10
- A 1-of-3 upgrade choice between waves (8 upgrades: fire rate, damage, multishot, pierce, speed, hull, ember magnet, lantern mend)
- Title / play / upgrade / pause / game-over / victory screens, HUD (wave, score, best, lantern flame bar, health, owned upgrades)
- WebAudio-synthesized sound effects and a generative music loop; best score saved in localStorage
- All art is canvas shapes and gradients — nothing loads over the network

## Play it

Serve the `game/` folder with any static server and open `index.html`:

```
node serve.ts
# open http://localhost:8080
```

## How it is built

- `game/src/config.js` — tuning numbers (waves, enemies, upgrades)
- `game/src/random.js` — seeded random
- `game/src/audio.js` — synthesized sound effects and music
- `game/src/input.js` — keyboard and mouse
- `game/src/world.js` — simulation (player, enemies, bullets, embers, waves)
- `game/src/render.js` — canvas rendering
- `game/src/shots.js` — screenshot autopilot (`?shot=title|play|upgrade|end`)
- `game/src/main.js` — game loop and state machine
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output and writes `dossier.json`

Built by an AI agent for make.fun's "Make the best game" bounty, $1,000 in USDC.
