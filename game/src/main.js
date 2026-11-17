// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, upgrade,
// paused, game over and victory.
//
// ?seed=N fixes the random pattern. ?shot=title|play|upgrade|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  EVENT_HIT, EVENT_HURT, EVENT_KILL, EVENT_LANTERN_HIT, EVENT_OVER,
  EVENT_PICKUP, EVENT_SHOOT, EVENT_UPGRADE, EVENT_WIN, createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import {
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN,
  cardRects, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  window.__lanternfall = { world, screen: scene.screen };
  const ui = { best: scene.best, owned: [], muted: false, banner: null, bannerUntil: 0 };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  window.__lanternfall = { world, get screen() { return screen; }, get best() { return best; } };
  let owned = [];
  let banner = null;
  let bannerUntil = 0;
  let muted = false;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function ui() {
    return { best, owned, muted, banner, bannerUntil };
  }

  function startGame() {
    world.startRun();
    owned = [];
    screen = SCREEN_PLAY;
    banner = 'WAVE 1';
    bannerUntil = world.state.time + 2.2;
    audio.unlock();
    audio.waveHorn();
    announce('Playing. Defend the lantern.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) audio.victory();
    else audio.gameOver();
    announce(won
      ? `Dawn breaks. You kept the light. Score ${world.state.score}. Best ${best}.`
      : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function chooseUpgrade(index) {
    const offered = world.state.offered;
    if (index < 0 || index >= offered.length) return;
    const up = offered[index];
    world.applyUpgrade(up.id);
    owned = [...owned, up.name];
    screen = SCREEN_PLAY;
    banner = `WAVE ${world.state.wave}`;
    bannerUntil = world.state.time + 2.2;
    audio.upgrade();
    audio.waveHorn();
    announce(`Upgrade: ${up.name}. Wave ${world.state.wave}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
    }
    const choice = input.takeChoice();
    if (screen === SCREEN_UPGRADE && choice >= 1 && choice <= 3) {
      chooseUpgrade(choice - 1);
      return;
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
        startGame();
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (screen === SCREEN_UPGRADE) {
        // A click on an upgrade card picks it; a click elsewhere does nothing.
        const mouse = renderer.toField(input.mouse().x, input.mouse().y);
        const rects = cardRects();
        for (let i = 0; i < rects.length; i += 1) {
          const r = rects[i];
          if (mouse.x >= r.x && mouse.x <= r.x + r.width && mouse.y >= r.y && mouse.y <= r.y + r.height) {
            chooseUpgrade(i);
            break;
          }
        }
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function playSound(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_KILL) audio.die();
    if (events & EVENT_HURT) audio.hurt();
    if (events & EVENT_LANTERN_HIT) audio.lanternHit();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_UPGRADE) audio.upgrade();
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const mouse = renderer.toField(input.mouse().x, input.mouse().y);
    const events = world.step(STEP, {
      mx: move.x, my: move.y,
      aimX: mouse.x, aimY: mouse.y,
      firing: input.firing(),
    }, false);
    playSound(events);
    if (events & EVENT_UPGRADE) {
      screen = SCREEN_UPGRADE;
      announce(`Wave ${world.state.wave} cleared. Choose an upgrade.`);
    } else if (events & EVENT_WIN) {
      endGame(true);
    } else if (events & EVENT_OVER) {
      endGame(false);
    } else if (events & EVENT_HURT) {
      announce(world.state.player.hp <= 25 ? 'Hurt. Health is low.' : 'Hurt.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, ui());
  }

  // Leaving the tab pauses a running game rather than letting shadows close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  // The first gesture unlocks audio in browsers that block it before one.
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  announce('Lanternfall. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
