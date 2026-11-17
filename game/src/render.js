// The renderer: paints the world on a full-window canvas. The playfield is a
// fixed 1280x720 logical area scaled to the window; all drawing is canvas 2D
// shapes and gradients, no images, so the game loads nothing over the network.
import { CARD, ENEMIES, FIELD, FONT, LANTERN, PALETTE, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Fixed starfield, so the backdrop is the same every run and every screenshot. */
const STARS = (() => {
  let a = 1337;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stars = [];
  for (let i = 0; i < 110; i += 1) {
    stars.push({ x: next() * FIELD.width, y: next() * FIELD.height, r: 0.5 + next() * 1.4, a: 0.25 + next() * 0.55 });
  }
  return stars;
})();

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, frac, fill, back) {
  ctx.fillStyle = back;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
    ctx.fill();
  }
}

/** The three upgrade card rectangles in field coordinates, shared with the click test. */
export function cardRects() {
  const total = CARD.width * 3 + CARD.gap * 2;
  const x0 = (FIELD.width - total) / 2;
  return [0, 1, 2].map((i) => ({
    x: x0 + i * (CARD.width + CARD.gap), y: CARD.y, width: CARD.width, height: CARD.height,
  }));
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    scale = Math.min(w / FIELD.width, h / FIELD.height);
    offsetX = (w - FIELD.width * scale) / 2;
    offsetY = (h - FIELD.height * scale) / 2;
  }

  /** A canvas CSS-pixel point to field coordinates. */
  function toField(cx, cy) {
    return { x: (cx - offsetX) / scale, y: (cy - offsetY) / scale };
  }

  function drawBackground(state) {
    const bg = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    bg.addColorStop(0, PALETTE.backdrop);
    bg.addColorStop(1, PALETTE.backdropEdge);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const s of STARS) {
      ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(state.time * 1.3 + s.x));
      ctx.fillStyle = PALETTE.star;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Faint ground ring where the lantern stands.
    ctx.strokeStyle = PALETTE.groundRing;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(LANTERN.x, LANTERN.y, 74, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(LANTERN.x, LANTERN.y, 130, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawLantern(state) {
    const flicker = 0.9 + state.lantern.flicker * 0.2;
    const glowR = 300 * flicker;
    const g = ctx.createRadialGradient(LANTERN.x, LANTERN.y, 8, LANTERN.x, LANTERN.y, glowR);
    g.addColorStop(0, 'rgba(255, 209, 102, 0.55)');
    g.addColorStop(0.4, 'rgba(255, 159, 28, 0.18)');
    g.addColorStop(1, 'rgba(255, 159, 28, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(LANTERN.x, LANTERN.y, glowR, 0, Math.PI * 2);
    ctx.fill();
    // Stone base and the flame.
    ctx.fillStyle = '#3a4157';
    ctx.beginPath();
    ctx.arc(LANTERN.x, LANTERN.y, LANTERN.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6d3b';
    ctx.lineWidth = 3;
    ctx.stroke();
    const flameH = 26 * flicker * (0.4 + 0.6 * (state.lantern.hp / state.lantern.maxHp));
    ctx.fillStyle = PALETTE.lanternCore;
    ctx.beginPath();
    ctx.moveTo(LANTERN.x, LANTERN.y - flameH);
    ctx.quadraticCurveTo(LANTERN.x + 11, LANTERN.y - 2, LANTERN.x, LANTERN.y + 8);
    ctx.quadraticCurveTo(LANTERN.x - 11, LANTERN.y - 2, LANTERN.x, LANTERN.y - flameH);
    ctx.fill();
  }

  function drawEnemy(e, def) {
    const wobble = Math.sin(e.seed + e.x * 0.01) * 1.5;
    ctx.fillStyle = def.colour;
    ctx.beginPath();
    ctx.arc(e.x + wobble, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    if (e.kind === 'skitter') {
      ctx.beginPath();
      ctx.moveTo(e.x - e.radius, e.y);
      ctx.lineTo(e.x - e.radius - 9, e.y - 6);
      ctx.lineTo(e.x - e.radius - 9, e.y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(e.x + e.radius, e.y);
      ctx.lineTo(e.x + e.radius + 9, e.y - 6);
      ctx.lineTo(e.x + e.radius + 9, e.y + 6);
      ctx.closePath();
      ctx.fill();
    }
    if (e.kind === 'brute') {
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(e.x + i * 12 - 6, e.y - e.radius + 4);
        ctx.lineTo(e.x + i * 12, e.y - e.radius - 12);
        ctx.lineTo(e.x + i * 12 + 6, e.y - e.radius + 4);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (e.kind === 'spitter') {
      ctx.fillStyle = '#123b30';
      ctx.beginPath();
      ctx.arc(e.x, e.y + 4, e.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // Glowing eyes, looking toward their target.
    ctx.fillStyle = def.eye;
    const eyeDx = e.kind === 'brute' ? 9 : 5;
    const eyeDy = -3;
    ctx.beginPath();
    ctx.arc(e.x - eyeDx, e.y + eyeDy, 2.6, 0, Math.PI * 2);
    ctx.arc(e.x + eyeDx, e.y + eyeDy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    // A white flash on a fresh hit, and a health bar on the tough ones.
    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(1, e.flash / 0.12) * 0.75;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.kind === 'brute' && e.hp < e.maxHp) {
      bar(ctx, e.x - 24, e.y - e.radius - 14, 48, 5, e.hp / e.maxHp, '#ff5d8a', 'rgba(0,0,0,0.5)');
    }
  }

  function drawPlayer(p) {
    // Soft glow, then the wisp body, hood and the barrel that shows the aim.
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 46);
    g.addColorStop(0, 'rgba(126, 232, 250, 0.5)');
    g.addColorStop(1, 'rgba(126, 232, 250, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.player;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * (PLAYER.radius + 12), p.y + Math.sin(p.angle) * (PLAYER.radius + 12));
    ctx.stroke();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    // Two eyes along the aim direction.
    const ex = Math.cos(p.angle + Math.PI / 2);
    const ey = Math.sin(p.angle + Math.PI / 2);
    ctx.fillStyle = '#062a33';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 5 + ex * 5, p.y + Math.sin(p.angle) * 5 + ey * 5, 2.4, 0, Math.PI * 2);
    ctx.arc(p.x + Math.cos(p.angle) * 5 - ex * 5, p.y + Math.sin(p.angle) * 5 - ey * 5, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDarkness(state, lightR) {
    // One pool of light around the lantern: the field darkens toward the edges.
    const g = ctx.createRadialGradient(LANTERN.x, LANTERN.y, lightR * 0.35, LANTERN.x, LANTERN.y, lightR);
    g.addColorStop(0, 'rgba(3, 5, 14, 0)');
    g.addColorStop(1, 'rgba(3, 5, 14, 0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawHud(state, ui) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 22px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`WAVE ${Math.max(1, state.wave)} / 10`, 24, 40);
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(`SCORE ${state.score}`, 24, 70);
    ctx.font = `400 15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`BEST ${ui.best}`, 24, 94);
    // Lantern flame bar, centred on top.
    const bw = 280;
    const bx = (FIELD.width - bw) / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText('LANTERN', FIELD.width / 2, 26);
    const frac = state.lantern.hp / state.lantern.maxHp;
    const flameColour = frac > 0.5 ? '#ff9f1c' : frac > 0.25 ? '#ff7a1c' : '#ff4d4d';
    bar(ctx, bx, 32, bw, 14, frac, flameColour, 'rgba(255,255,255,0.14)');
    if (frac <= 0.25) {
      ctx.fillStyle = Math.sin(state.time * 8) > 0 ? '#ff5d5d' : PALETTE.muted;
      ctx.font = `700 14px ${FONT}`;
      ctx.fillText('THE FLAME IS DYING', FIELD.width / 2, 66);
    }
    // Player health, top right, with the upgrades owned underneath.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText('HEALTH', FIELD.width - 24, 26);
    bar(ctx, FIELD.width - 24 - 170, 32, 170, 14, state.player.hp / state.player.maxHp, '#7ee8fa', 'rgba(255,255,255,0.14)');
    if (ui.owned.length > 0) {
      ctx.font = `400 12px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText(ui.owned.join('  ·  '), FIELD.width - 24, 68);
    }
    if (ui.muted) {
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `400 13px ${FONT}`;
      ctx.fillText('muted (M)', 24, FIELD.height - 18);
    }
  }

  function panel(width, height) {
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, x, y, width, height, 16);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    return { x, y };
  }

  function titleText(text, y, size, colour, weight = 700) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = colour;
    ctx.fillText(text, FIELD.width / 2, y);
  }

  function drawTitle(state, ui) {
    ctx.fillStyle = 'rgba(3, 5, 14, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.save();
    ctx.shadowColor = '#ff9f1c';
    ctx.shadowBlur = 34;
    titleText('LANTERNFALL', 218, 76, '#ffd166');
    ctx.restore();
    titleText('Defend the last lantern. Ten waves of night are coming.', 268, 24, PALETTE.text, 400);
    titleText('WASD move  ·  Mouse aim  ·  Hold click to shoot', 330, 20, PALETTE.muted, 400);
    titleText('Shadows that reach the lantern eat its flame — gather their embers to feed it.', 360, 20, PALETTE.muted, 400);
    titleText('Between waves, choose one upgrade. Survive all ten waves and dawn breaks.', 390, 20, PALETTE.muted, 400);
    if (ui.best > 0) titleText(`BEST SCORE  ${ui.best}`, 448, 22, PALETTE.gold);
    titleText('CLICK OR PRESS SPACE TO BEGIN', 520, 26, '#7ee8fa');
  }

  function drawUpgrade(state) {
    ctx.fillStyle = 'rgba(3, 5, 14, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    titleText(`WAVE ${state.wave} CLEARED`, 168, 46, '#ffd166');
    titleText('Choose an upgrade — click a card or press 1, 2 or 3', 214, 22, PALETTE.text, 400);
    const rects = cardRects();
    state.offered.forEach((up, i) => {
      const r = rects[i];
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, r.x, r.y, r.width, r.height, 14);
      ctx.fill();
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, r.x + r.width / 2, r.y + 36);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(up.name, r.x + r.width / 2, r.y + 76);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `400 17px ${FONT}`;
      ctx.fillText(up.desc, r.x + r.width / 2, r.y + 112);
    });
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(3, 5, 14, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    titleText('PAUSED', 330, 52, PALETTE.text);
    titleText('Press P or click to keep playing', 384, 20, PALETTE.muted, 400);
  }

  function drawEnd(state, ui, won) {
    ctx.fillStyle = won ? 'rgba(10, 20, 8, 0.62)' : 'rgba(14, 3, 8, 0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const { y } = panel(620, 330);
    if (won) {
      titleText('DAWN BREAKS', y + 78, 52, '#ffd166');
      titleText('You kept the light through all ten waves.', y + 122, 20, PALETTE.text, 400);
    } else {
      titleText('THE LIGHT HAS FALLEN', y + 78, 46, '#ff5d5d');
      titleText(`The night took the lantern on wave ${Math.max(1, state.wave)}.`, y + 122, 20, PALETTE.text, 400);
    }
    titleText(`SCORE  ${state.score}`, y + 178, 30, PALETTE.text);
    titleText(`BEST  ${ui.best}`, y + 216, 20, PALETTE.muted, 400);
    if (state.score > 0 && state.score >= ui.best) titleText('NEW BEST!', y + 248, 20, PALETTE.gold);
    titleText('SPACE OR CLICK — PLAY AGAIN', y + 292, 22, '#7ee8fa');
  }

  function draw(state, screen, ui) {
    resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    if (state.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD.width, FIELD.height);
    ctx.clip();
    drawBackground(state);
    // Embers under the lantern's glow so they read as sparks in the dark.
    for (const em of state.embers) {
      const alpha = Math.min(1, em.life / 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PALETTE.ember;
      ctx.beginPath();
      ctx.arc(em.x, em.y, 5 + Math.sin(state.time * 6 + em.x) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawLantern(state);
    // The night darkens everything outside the lantern's light — but the
    // shadows, shots and player are painted after it, so they stay readable.
    drawDarkness(state, 150 + 280 * (state.lantern.hp / state.lantern.maxHp));
    for (const e of state.enemies) drawEnemy(e, ENEMIES[e.kind]);
    ctx.fillStyle = '#7dffb0';
    for (const g of state.globs) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = PALETTE.bullet;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    drawPlayer(state.player);
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'center';
    for (const t of state.texts) {
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.fillStyle = t.colour;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_PAUSED) {
      drawHud(state, ui);
    }
    if (ui.banner && ui.bannerUntil > state.time) {
      ctx.font = `700 44px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, (ui.bannerUntil - state.time) / 0.6);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(ui.banner, FIELD.width / 2, 200);
      ctx.globalAlpha = 1;
    }
    if (screen === SCREEN_TITLE) drawTitle(state, ui);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawEnd(state, ui, false);
    else if (screen === SCREEN_WIN) drawEnd(state, ui, true);
    ctx.restore();
  }

  return { draw, toField, cardRects };
}
