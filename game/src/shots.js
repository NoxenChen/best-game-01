// The screenshot scenes behind ?shot=title|play|upgrade|end. Each one plays the
// real rules forward from a fresh world, steered by a simple autopilot (kite away
// from the nearest shadow, chase embers when it is safe, always shoot the nearest
// shadow), so the frame is what a short game really looks like and the same seed
// always gives the same frame. The end scene's pilot never fires, so the night
// takes the lantern, as a careless player would.
import { FIELD, LANTERN, STEP } from './config.js';
import { EVENT_OVER, EVENT_UPGRADE, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';

const TITLE_SECONDS = 6;
const PLAY_SECONDS = 20;
const LIMIT_SECONDS = 300;

/** The autopilot's input for one step: move toward embers when safe, kite the nearest shadow, shoot it. */
function autopilot(state, coward) {
  const p = state.player;
  let nearest = null;
  let nearestD = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < nearestD) {
      nearestD = d;
      nearest = e;
    }
  }
  let ember = null;
  let emberD = Infinity;
  for (const em of state.embers) {
    const d = Math.hypot(em.x - p.x, em.y - p.y);
    if (d < emberD) {
      emberD = d;
      ember = em;
    }
  }
  let mx = 0;
  let my = 0;
  let aimX = p.x + Math.cos(p.angle) * 100;
  let aimY = p.y + Math.sin(p.angle) * 100;
  let firing = false;
  if (nearest) {
    aimX = nearest.x;
    aimY = nearest.y;
    firing = !coward;
    if (coward) {
      // Drift in a slow circle near the lantern and never shoot.
      const a = state.time * 0.4;
      mx = Math.cos(a) * 0.3;
      my = Math.sin(a) * 0.3;
    } else if (nearestD < 170) {
      // Too close: back away from the shadow.
      mx = (p.x - nearest.x) / nearestD;
      my = (p.y - nearest.y) / nearestD;
    } else if (ember && emberD < 260 && nearestD > 130) {
      mx = (ember.x - p.x) / emberD;
      my = (ember.y - p.y) / emberD;
    } else if (nearestD > 380) {
      // Close the distance so the shots land.
      mx = (nearest.x - p.x) / nearestD;
      my = (nearest.y - p.y) / nearestD;
    } else {
      // Hold a firing orbit around the lantern, 230-330 px out: close enough
      // to guard it, far enough to read the whole scene.
      const dx = LANTERN.x - p.x;
      const dy = LANTERN.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const radial = d < 230 ? -0.7 : d > 330 ? 0.5 : 0;
      mx = (-dy / d) * 0.6 + (dx / d) * radial;
      my = (dx / d) * 0.6 + (dy / d) * radial;
    }
  } else if (ember && emberD < 400) {
    mx = (ember.x - p.x) / emberD;
    my = (ember.y - p.y) / emberD;
  } else {
    // Nothing to fight: drift back toward the lantern.
    const dx = LANTERN.x - p.x;
    const dy = LANTERN.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 220) {
      mx = dx / d;
      my = dy / d;
    }
  }
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  return { mx, my, aimX, aimY, firing };
}

function runSteps(world, seconds, coward, stopAt) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = autopilot(world.state, coward);
    const events = world.step(STEP, input, false);
    if (stopAt && (events & stopAt)) return events;
    if (events & (EVENT_OVER | EVENT_WIN)) return events;
  }
  return 0;
}

/**
 * Set `world` to the named scene (title, play, upgrade or end; any other name is
 * title) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.step(STEP, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.startRun();
  if (name === 'play') {
    // Play until the frame is busy — several kills banked and several shadows
    // still closing in — or the time cap, whichever comes first. If a wave
    // clears mid-scene, take the first upgrade and keep going.
    let elapsed = 0;
    while (elapsed < PLAY_SECONDS) {
      const input = autopilot(world.state, false);
      const events = world.step(STEP, input, false);
      elapsed += STEP;
      if (events & (EVENT_OVER | EVENT_WIN)) break;
      if (events & EVENT_UPGRADE) world.applyUpgrade(world.state.offered[0].id);
      if (world.state.kills >= 4 && world.state.enemies.length >= 4) break;
    }
    const over = world.state.phase === 'over';
    const won = world.state.phase === 'win';
    return { screen: over ? SCREEN_OVER : won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'upgrade') {
    const events = runSteps(world, LIMIT_SECONDS, false, EVENT_UPGRADE);
    if (events & EVENT_UPGRADE) return { screen: SCREEN_UPGRADE, best: world.state.score };
    const over = world.state.phase === 'over';
    const won = world.state.phase === 'win';
    return { screen: over ? SCREEN_OVER : won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score };
  }
  // end: the coward never fires, so the lantern falls. If a wave clears first
  // (the lantern outlasted it), take an upgrade and keep standing still.
  let elapsed = 0;
  while (elapsed < LIMIT_SECONDS) {
    const input = autopilot(world.state, true);
    const events = world.step(STEP, input, false);
    elapsed += STEP;
    if (events & EVENT_OVER) break;
    if (events & EVENT_UPGRADE) world.applyUpgrade(world.state.offered[0].id);
  }
  return { screen: SCREEN_OVER, best: world.state.score };
}
