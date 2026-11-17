// LANTERNFALL — every tuning number, colour and piece of game text in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };
export const LANTERN = { x: 640, y: 360, radius: 30, maxHp: 100 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The last wave: clearing it wins the game. */
export const FINAL_WAVE = 10;

export const PLAYER = {
  radius: 14,
  speed: 300,
  maxHp: 100,
  hurtCooldown: 0.7,
  fireRate: 5, // shots per second
  bulletSpeed: 640,
  bulletDamage: 12,
  bulletRadius: 4,
  bulletLife: 1.1,
  pickupRadius: 26,
};

/** Enemy kinds. cost is the wave budget each one spends; dmg is what it deals to the lantern. */
export const ENEMIES = {
  shade: {
    name: 'Shade',
    radius: 14, hp: 20, speed: 58, dmg: 8, score: 10, cost: 1,
    colour: '#8b7cf6', eye: '#e9e4ff', behaviour: 'lantern',
  },
  skitter: {
    name: 'Skitter',
    radius: 11, hp: 12, speed: 132, dmg: 6, score: 15, cost: 2,
    colour: '#f6685e', eye: '#ffe9e7', behaviour: 'chase',
  },
  brute: {
    name: 'Brute',
    radius: 26, hp: 95, speed: 32, dmg: 25, score: 40, cost: 4,
    colour: '#c94f9e', eye: '#ffd9ef', behaviour: 'lantern',
  },
  spitter: {
    name: 'Spitter',
    radius: 15, hp: 26, speed: 46, dmg: 6, score: 30, cost: 3,
    colour: '#4fc3a1', eye: '#dcfff2', behaviour: 'shoot',
    range: 270, shotInterval: 2.4, globSpeed: 185, globDamage: 10,
  },
};

export const WAVE = {
  /** Points of enemy budget per wave: 4 + 4 per wave number. */
  budget: (n) => 4 + 4 * n,
  /** Seconds between spawns, shrinking with the wave, never below the floor. */
  spawnInterval: (n) => Math.max(0.28, 0.85 - n * 0.05),
  /** Points for clearing a wave. */
  clearBonus: (n) => 50 * n,
  /** Seconds of calm between waves, while the upgrade cards are shown. */
  intermission: 6,
};

export const EMBER = {
  /** Chance an enemy leaves an ember (brutes always leave two). */
  dropChance: 0.7,
  lanternHeal: 6,
  score: 5,
  lifetime: 9,
  magnetRadius: 130,
  collectRadius: 24,
};

/** The three upgrades offered between waves: id, name, flavour, and what it does. */
export const UPGRADES = [
  { id: 'rapid', name: 'Rapid Rounds', desc: '+25% fire rate', apply: (m) => { m.fireRate *= 1.25; } },
  { id: 'heavy', name: 'Heavy Shot', desc: '+30% bullet damage', apply: (m) => { m.damage *= 1.3; } },
  { id: 'swift', name: 'Swift Boots', desc: '+15% move speed', apply: (m) => { m.moveSpeed *= 1.15; } },
  { id: 'twin', name: 'Twin Barrel', desc: '+1 projectile per shot', apply: (m) => { m.projectiles += 1; } },
  { id: 'pierce', name: 'Piercing Rounds', desc: 'Bullets pierce +1 enemy', apply: (m) => { m.pierce += 1; } },
  { id: 'hull', name: 'Reinforced Hull', desc: '+30 max health, heal 30', apply: (m) => { m.maxHpBonus += 30; m.heal += 30; } },
  { id: 'magnet', name: 'Ember Magnet', desc: 'Ember pickup range x2.2', apply: (m) => { m.magnet *= 2.2; } },
  { id: 'mend', name: 'Lantern Mend', desc: 'Restore 40 lantern health', apply: (m) => { m.lanternHeal += 40; } },
];

/** Geometry of the three upgrade cards, shared by the renderer and the click test. */
export const CARD = { width: 300, height: 168, gap: 26, y: 296 };

export const PALETTE = {
  backdrop: '#070a18',
  backdropEdge: '#0d1126',
  star: '#aab4d4',
  grid: 'rgba(120, 140, 220, 0.07)',
  groundRing: 'rgba(140, 160, 255, 0.10)',
  lanternCore: '#ffd166',
  lanternGlow: '#ff9f1c',
  player: '#7ee8fa',
  playerCore: '#eafcff',
  bullet: '#ffe066',
  glob: '#7dffb0',
  ember: '#ff8c42',
  panel: 'rgba(13, 18, 38, 0.92)',
  panelEdge: '#2b3a6e',
  text: '#eef1f5',
  muted: '#9aa5c4',
  danger: '#ff5d5d',
  heal: '#7dffb0',
  gold: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lanternfall.best';
