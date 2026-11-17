// The game world: the player, the lantern, the enemies, bullets, embers and the
// waves. Everything is pure state plus a fixed 1/60 s step; the renderer only
// paints what is here, and the autopilot in shots.js drives it through the same
// step a player does. No drawing and no sound in this file.
import { EMBER, ENEMIES, FIELD, FINAL_WAVE, LANTERN, PLAYER, STEP, UPGRADES, WAVE } from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_HURT = 8;
export const EVENT_LANTERN_HIT = 16;
export const EVENT_PICKUP = 32;
export const EVENT_WAVE = 64;
export const EVENT_OVER = 128;
export const EVENT_WIN = 256;
export const EVENT_UPGRADE = 512;

/** Enemy kinds unlocked by wave, with their pick weights. */
const SPAWN_TABLE = [
  { kind: 'shade', fromWave: 1, weight: 10 },
  { kind: 'skitter', fromWave: 2, weight: 6 },
  { kind: 'brute', fromWave: 3, weight: 3 },
  { kind: 'spitter', fromWave: 2, weight: 4 },
];

function freshMods() {
  return { damage: 1, fireRate: 1, moveSpeed: 1, projectiles: 1, pierce: 0, magnet: 1, maxHpBonus: 0, heal: 0, lanternHeal: 0 };
}

export function createWorld(rng) {
  const state = {
    phase: 'title', // title | play | upgrade | over | win
    time: 0,
    wave: 0,
    score: 0,
    kills: 0,
    shake: 0,
    player: null,
    lantern: null,
    enemies: [],
    bullets: [],
    globs: [],
    embers: [],
    particles: [],
    texts: [],
    spawnQueue: [],
    spawnTimer: 0,
    offered: [],
  };

  function resetPlayer() {
    return {
      x: FIELD.width / 2, y: FIELD.height / 2 + 170,
      hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
      angle: -Math.PI / 2, fireCooldown: 0, hurtCooldown: 0,
      mods: freshMods(),
    };
  }

  function reset() {
    state.phase = 'title';
    state.time = 0;
    state.wave = 0;
    state.score = 0;
    state.kills = 0;
    state.shake = 0;
    state.player = resetPlayer();
    state.lantern = { hp: LANTERN.maxHp, maxHp: LANTERN.maxHp, flicker: 0 };
    state.enemies = [];
    state.bullets = [];
    state.globs = [];
    state.embers = [];
    state.particles = [];
    state.texts = [];
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.offered = [];
  }

  function startRun() {
    reset();
    state.phase = 'play';
    startWave(1);
  }

  /** Build the spawn queue for wave `n` from its budget and start it. */
  function startWave(n) {
    state.wave = n;
    let budget = WAVE.budget(n);
    const queue = [];
    const table = SPAWN_TABLE.filter((row) => row.fromWave <= n);
    while (budget > 0) {
      const affordable = table.filter((row) => ENEMIES[row.kind].cost <= budget);
      if (affordable.length === 0) break;
      let total = 0;
      for (const row of affordable) total += row.weight;
      let roll = rng.next() * total;
      let picked = affordable[0];
      for (const row of affordable) {
        roll -= row.weight;
        if (roll <= 0) {
          picked = row;
          break;
        }
      }
      queue.push(picked.kind);
      budget -= ENEMIES[picked.kind].cost;
    }
    // Shuffle so the wave does not arrive in table order.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng.next() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    state.spawnQueue = queue;
    state.spawnTimer = 0.6;
  }

  function edgePoint() {
    const side = rng.int(0, 3);
    const m = 24;
    if (side === 0) return { x: rng.range(m, FIELD.width - m), y: m };
    if (side === 1) return { x: rng.range(m, FIELD.width - m), y: FIELD.height - m };
    if (side === 2) return { x: m, y: rng.range(m, FIELD.height - m) };
    return { x: FIELD.width - m, y: rng.range(m, FIELD.height - m) };
  }

  function spawnEnemy(kind) {
    const def = ENEMIES[kind];
    const hpScale = 1 + 0.08 * (state.wave - 1);
    const speedScale = Math.min(1.3, 1 + 0.02 * (state.wave - 1));
    const at = edgePoint();
    state.enemies.push({
      kind, x: at.x, y: at.y,
      hp: Math.round(def.hp * hpScale), maxHp: Math.round(def.hp * hpScale),
      radius: def.radius, speed: def.speed * speedScale,
      dmg: def.dmg, score: def.score,
      flash: 0, attackCooldown: 0, shootCooldown: rng.range(1, 2),
      zig: rng.range(0, Math.PI * 2), seed: rng.next() * 1000,
    });
  }

  function burst(x, y, colour, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = rng.next() * Math.PI * 2;
      const v = rng.range(speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: rng.range(0.3, 0.7), maxLife: 0.7, size: rng.range(2, 5), colour,
      });
    }
  }

  function addText(x, y, text, colour) {
    state.texts.push({ x, y, vy: -34, life: 0.9, maxLife: 0.9, text, colour });
  }

  function dropEmbers(x, y, kind) {
    const count = kind === 'brute' ? 2 : rng.next() < EMBER.dropChance ? 1 : 0;
    for (let i = 0; i < count; i += 1) {
      state.embers.push({
        x: x + rng.range(-14, 14), y: y + rng.range(-14, 14),
        vx: rng.range(-24, 24), vy: rng.range(-24, 24),
        life: EMBER.lifetime, maxLife: EMBER.lifetime,
      });
    }
  }

  function killEnemy(index) {
    const enemy = state.enemies[index];
    const def = ENEMIES[enemy.kind];
    state.enemies.splice(index, 1);
    state.score += enemy.score;
    state.kills += 1;
    burst(enemy.x, enemy.y, def.colour, 14, 170);
    addText(enemy.x, enemy.y - 10, `+${enemy.score}`, '#eef1f5');
    dropEmbers(enemy.x, enemy.y, enemy.kind);
  }

  function lanternHit(dmg) {
    state.lantern.hp = Math.max(0, state.lantern.hp - dmg);
    state.shake = Math.min(10, state.shake + 5);
    burst(LANTERN.x, LANTERN.y, '#ff9f1c', 10, 150);
  }

  function offerUpgrades() {
    const pool = [...UPGRADES];
    const offered = [];
    while (offered.length < 3 && pool.length > 0) {
      const i = Math.floor(rng.next() * pool.length);
      offered.push(pool.splice(i, 1)[0]);
    }
    return offered;
  }

  function applyUpgrade(id) {
    const up = UPGRADES.find((u) => u.id === id);
    if (!up) return;
    const mods = state.player.mods;
    up.apply(mods);
    state.player.maxHp = PLAYER.maxHp + mods.maxHpBonus;
    if (mods.heal > 0) {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + mods.heal);
      mods.heal = 0;
    }
    if (mods.lanternHeal > 0) {
      state.lantern.hp = Math.min(LANTERN.maxHp, state.lantern.hp + mods.lanternHeal);
      mods.lanternHeal = 0;
    }
    state.phase = 'play';
    state.offered = [];
    startWave(state.wave + 1);
  }

  /** The radius of the lantern's light, shrinking as its health falls. */
  function lightRadius() {
    return 150 + 280 * (state.lantern.hp / state.lantern.maxHp);
  }

  function updateFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - dt * 26);
  }

  /** Title-screen attract mode: shadows drift toward the lantern and fade, never hurting it. */
  function stepAttract(dt) {
    state.time += dt;
    state.lantern.flicker = rng.next();
    if (state.enemies.length < 6 && rng.next() < dt * 0.8) spawnEnemy('shade');
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const dx = LANTERN.x - e.x;
      const dy = LANTERN.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * 0.5 * dt;
      e.y += (dy / d) * e.speed * 0.5 * dt;
      if (d < LANTERN.radius + e.radius + 6) {
        burst(e.x, e.y, ENEMIES.shade.colour, 6, 90);
        state.enemies.splice(i, 1);
      }
    }
    updateFx(dt);
  }

  /**
   * Advance the world one fixed step. `input` is {mx, my, aimX, aimY, firing} in
   * field coordinates (null in attract mode). Returns an EVENT_* bitmask of what
   * happened this step, so the loop can play the matching sounds.
   */
  function step(dt, input, attract) {
    if (attract) {
      stepAttract(dt);
      return 0;
    }
    state.time += dt;
    state.lantern.flicker = rng.next();
    let events = 0;
    updateFx(dt);

    if (state.phase === 'upgrade' || state.phase === 'over' || state.phase === 'win') return events;
    if (state.phase !== 'play' || !input) return events;

    const p = state.player;
    const mods = p.mods;

    // --- player movement and aim ---
    const speed = PLAYER.speed * mods.moveSpeed;
    p.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, p.x + input.mx * speed * dt));
    p.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, p.y + input.my * speed * dt));
    p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    p.fireCooldown -= dt;
    p.hurtCooldown -= dt;

    // --- firing ---
    if (input.firing && p.fireCooldown <= 0) {
      const spread = 0.09;
      const n = mods.projectiles;
      for (let i = 0; i < n; i += 1) {
        const a = p.angle + (i - (n - 1) / 2) * spread;
        state.bullets.push({
          x: p.x + Math.cos(a) * (PLAYER.radius + 6),
          y: p.y + Math.sin(a) * (PLAYER.radius + 6),
          vx: Math.cos(a) * PLAYER.bulletSpeed,
          vy: Math.sin(a) * PLAYER.bulletSpeed,
          dmg: Math.round(PLAYER.bulletDamage * mods.damage),
          pierce: mods.pierce, life: PLAYER.bulletLife,
        });
      }
      p.fireCooldown = 1 / (PLAYER.fireRate * mods.fireRate);
      events |= EVENT_SHOOT;
    }

    // --- spawning ---
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer = WAVE.spawnInterval(state.wave);
      }
    }

    // --- enemies ---
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const def = ENEMIES[e.kind];
      e.flash = Math.max(0, e.flash - dt);
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      e.shootCooldown = Math.max(0, e.shootCooldown - dt);
      const dxL = LANTERN.x - e.x;
      const dyL = LANTERN.y - e.y;
      const distL = Math.hypot(dxL, dyL) || 1;
      const dxP = p.x - e.x;
      const dyP = p.y - e.y;
      const distP = Math.hypot(dxP, dyP) || 1;
      // Close to the player, any shadow turns on the player instead.
      const chasePlayer = distP < 110;
      let tx = dxL / distL;
      let ty = dyL / distL;
      if (def.behaviour === 'chase' || chasePlayer) {
        tx = dxP / distP;
        ty = dyP / distP;
      }
      if (def.behaviour === 'shoot' && distL < def.range && !chasePlayer) {
        // Hold range and spit at the player, or at the lantern when far from the player.
        if (e.shootCooldown <= 0) {
          const target = distP < 380 ? p : { x: LANTERN.x, y: LANTERN.y };
          const a = Math.atan2(target.y - e.y, target.x - e.x);
          state.globs.push({
            x: e.x, y: e.y,
            vx: Math.cos(a) * def.globSpeed, vy: Math.sin(a) * def.globSpeed,
            dmg: def.globDamage, life: 3.5,
          });
          e.shootCooldown = def.shotInterval;
        }
      } else {
        let vx = tx * e.speed;
        let vy = ty * e.speed;
        if (def.behaviour === 'chase') {
          e.zig += dt * 5;
          const px = -ty;
          const py = tx;
          vx += px * Math.sin(e.zig) * e.speed * 0.45;
          vy += py * Math.sin(e.zig) * e.speed * 0.45;
        }
        e.x += vx * dt;
        e.y += vy * dt;
      }
      // Reaching the lantern: the shadow bursts and the flame takes the hit.
      if (distL < LANTERN.radius + e.radius) {
        lanternHit(e.dmg);
        burst(e.x, e.y, def.colour, 12, 160);
        state.enemies.splice(i, 1);
        events |= EVENT_LANTERN_HIT;
        if (state.lantern.hp <= 0) {
          state.phase = 'over';
          return events | EVENT_OVER;
        }
        continue;
      }
      // Touching the player hurts the player, with a per-enemy cooldown.
      if (distP < e.radius + PLAYER.radius && e.attackCooldown <= 0 && p.hurtCooldown <= 0) {
        p.hp = Math.max(0, p.hp - Math.max(4, Math.round(e.dmg * 0.6)));
        p.hurtCooldown = PLAYER.hurtCooldown;
        e.attackCooldown = 0.9;
        const kb = 260;
        p.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, p.x + (dxP / distP) * kb * dt * 8));
        p.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, p.y + (dyP / distP) * kb * dt * 8));
        burst(p.x, p.y, '#ff5d5d', 8, 140);
        state.shake = Math.min(10, state.shake + 4);
        events |= EVENT_HURT;
        if (p.hp <= 0) {
          state.phase = 'over';
          return events | EVENT_OVER;
        }
      }
    }

    // Keep shadows from stacking on one spot.
    for (let i = 0; i < state.enemies.length; i += 1) {
      for (let j = i + 1; j < state.enemies.length; j += 1) {
        const a = state.enemies[i];
        const b = state.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    // --- bullets ---
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const e = state.enemies[j];
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          if (dx * dx + dy * dy < (e.radius + PLAYER.bulletRadius) * (e.radius + PLAYER.bulletRadius)) {
            e.hp -= b.dmg;
            e.flash = 0.12;
            burst(b.x, b.y, '#ffe066', 4, 90);
            events |= EVENT_HIT;
            if (e.hp <= 0) {
              killEnemy(j);
              events |= EVENT_KILL;
            }
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }

    // --- enemy globs ---
    for (let i = state.globs.length - 1; i >= 0; i -= 1) {
      const g = state.globs[i];
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.life -= dt;
      let dead = g.life <= 0 || g.x < -20 || g.x > FIELD.width + 20 || g.y < -20 || g.y > FIELD.height + 20;
      if (!dead) {
        const dxP = p.x - g.x;
        const dyP = p.y - g.y;
        if (dxP * dxP + dyP * dyP < (PLAYER.radius + 7) * (PLAYER.radius + 7)) {
          p.hp = Math.max(0, p.hp - g.dmg);
          p.hurtCooldown = PLAYER.hurtCooldown;
          burst(p.x, p.y, '#7dffb0', 8, 130);
          events |= EVENT_HURT;
          dead = true;
          if (p.hp <= 0) {
            state.phase = 'over';
            return events | EVENT_OVER;
          }
        } else {
          const dxL = LANTERN.x - g.x;
          const dyL = LANTERN.y - g.y;
          if (dxL * dxL + dyL * dyL < (LANTERN.radius + 7) * (LANTERN.radius + 7)) {
            lanternHit(g.dmg);
            events |= EVENT_LANTERN_HIT;
            dead = true;
            if (state.lantern.hp <= 0) {
              state.phase = 'over';
              return events | EVENT_OVER;
            }
          }
        }
      }
      if (dead) state.globs.splice(i, 1);
    }

    // --- embers ---
    for (let i = state.embers.length - 1; i >= 0; i -= 1) {
      const em = state.embers[i];
      em.life -= dt;
      em.x += em.vx * dt;
      em.y += em.vy * dt;
      em.vx *= 0.94;
      em.vy *= 0.94;
      const dx = p.x - em.x;
      const dy = p.y - em.y;
      const d = Math.hypot(dx, dy) || 1;
      const magnetR = EMBER.magnetRadius * mods.magnet;
      if (d < magnetR) {
        em.x += (dx / d) * 420 * dt;
        em.y += (dy / d) * 420 * dt;
      }
      if (d < EMBER.collectRadius + PLAYER.pickupRadius * 0.5) {
        state.lantern.hp = Math.min(LANTERN.maxHp, state.lantern.hp + EMBER.lanternHeal);
        state.score += EMBER.score;
        addText(em.x, em.y - 8, `+${EMBER.lanternHeal} flame`, '#ff9f1c');
        state.embers.splice(i, 1);
        events |= EVENT_PICKUP;
        continue;
      }
      if (em.life <= 0) state.embers.splice(i, 1);
    }

    // --- wave cleared? ---
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      state.score += WAVE.clearBonus(state.wave);
      if (state.wave >= FINAL_WAVE) {
        state.phase = 'win';
        return events | EVENT_WIN;
      }
      state.offered = offerUpgrades();
      state.phase = 'upgrade';
      return events | EVENT_UPGRADE;
    }
    return events;
  }

  reset();
  return {
    state,
    reset,
    startRun,
    startWave,
    step,
    applyUpgrade,
    lightRadius,
  };
}
