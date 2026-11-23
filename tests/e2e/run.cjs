// Tests d'appareils (8.11) : émulation Playwright, scénario menu → jeu → pause → fin, au toucher, au clavier,
// puis les deux mélangés (non-régression PC). Hors Vitest : il faut un navigateur.
//
//   NODE_PATH=<dossier de node_modules contenant playwright> npm run e2e
//
// Lance lui-même `vite` (mode dev : le crochet `window.__game` n'existe qu'en dev) sur un port libre.
const { spawn } = require('node:child_process');
const { chromium, devices } = require('playwright');

const PORT = 5199;
const URL = `http://localhost:${PORT}`;
const failures = [];
let checks = 0;

function check(name, ok, detail = '') {
  checks++;
  if (!ok) failures.push(`${name} ${detail}`);
  console.log(`${ok ? '  ok ' : '  KO '} ${name}${ok ? '' : ` ${detail}`}`);
}
const eq = (name, got, want) =>
  check(
    name,
    JSON.stringify(got) === JSON.stringify(want),
    `(obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)})`,
  );

async function startServer() {
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL)).ok) return server;
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  server.kill();
  throw new Error('serveur vite injoignable');
}

/** Helpers de page : lecture de l'état du jeu et conversion de coordonnées du jeu (480×270) en pixels CSS. */
function helpers(page) {
  const scene = (name, fn) =>
    page.evaluate(
      `(() => { const s = window.__game.scene.getScene('${name}'); return (${fn})(s); })()`,
    );
  return {
    async toCss(x, y) {
      const r = await page.evaluate(() => {
        const b = document.querySelector('canvas').getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width };
      });
      const s = r.w / 480;
      return { x: r.x + x * s, y: r.y + y * s };
    },
    active: (name) => page.evaluate((n) => window.__game.scene.isActive(n), name),
    intent: () =>
      scene('GameScene', 's => s.world.ships[0].intent && { ...s.world.ships[0].intent }'),
    paused: () => scene('GameScene', 's => s.pause.paused'),
    source: () =>
      page.evaluate(async () => (await import('/src/systems/inputSource.js')).getSource()),
    muted: () => page.evaluate(async () => (await import('/src/audio/mute.js')).isMuted()),
    worldId: () => scene('GameScene', 's => s.world.seed ?? s.world.tick'),
    forceOutcome: async (kind) => {
      await page.waitForFunction(() => window.__game.scene.getScene('GameScene')?.world);
      return page.evaluate(async (k) => {
        const { OUTCOME } = await import('/src/core/faction.js');
        window.__game.scene.getScene('GameScene').world.outcome = OUTCOME[k];
      }, kind);
    },
  };
}

async function newPage(browser, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__game?.scene.isActive('MenuScene'));
  return { context, page, errors, g: helpers(page), cdp: await context.newCDPSession(page) };
}

const touchStart = (cdp, points) =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
const touchEnd = (cdp) =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const settle = (page, ms = 250) => page.waitForTimeout(ms);

async function touchScenario(browser, label, device) {
  console.log(`\n# Tactile — ${label}`);
  const { context, page, errors, g, cdp } = await newPage(browser, { ...devices[device] });
  const pt = async (id, x, y) => ({ id, ...(await g.toCss(x, y)) });
  const tap = async (x, y) => {
    const p = await g.toCss(x, y);
    await page.touchscreen.tap(p.x, p.y);
    await settle(page);
  };

  eq('démarre au tactile (pointeur grossier)', await g.source(), 'touch');
  await tap(135, 208); // JOUER
  check('JOUER au doigt lance la partie', await g.active('GameScene'));

  // Trois doigts : rotation gauche + poussée + tir.
  await touchStart(cdp, [await pt(1, 34, 232), await pt(2, 366, 236), await pt(3, 430, 222)]);
  await settle(page, 400);
  eq('3 doigts : rotation, poussée et tir', await g.intent(), {
    rotate: -1,
    thrust: true,
    fire: true,
    missile: false,
  });
  await touchEnd(cdp);
  await settle(page);
  eq('doigts levés : plus aucune intention', await g.intent(), {
    rotate: 0,
    thrust: false,
    fire: false,
    missile: false,
  });

  // Pause et reprise au doigt.
  await tap(26, 26);
  check('bouton II met en pause', await g.paused());
  await tap(135, 194); // REPRENDRE
  check('REPRENDRE relance', !(await g.paused()));
  // Pause puis MENU.
  await tap(26, 26);
  await tap(345, 194);
  check('MENU depuis la pause', await g.active('MenuScene'));

  // Fin de partie : REJOUER puis MENU.
  await tap(135, 208);
  await g.forceOutcome('DEFEAT');
  await page.waitForTimeout(2600);
  const before = await g.worldId();
  await tap(170, 194); // REJOUER
  check(
    'REJOUER relance une nouvelle partie',
    (await g.active('GameScene')) && (await g.worldId()) !== before,
  );
  await g.forceOutcome('VICTORY');
  await page.waitForTimeout(2600);
  await tap(310, 194); // MENU
  check('MENU depuis l’écran de fin', await g.active('MenuScene'));

  // Portrait : invite « tournez l'appareil » et pause.
  await tap(135, 208);
  await page.setViewportSize({ width: 412, height: 915 });
  await settle(page, 500);
  check('portrait : invite affichée', await page.locator('#rotate').isVisible());
  check('portrait : partie en pause', await g.paused());
  eq('aucune erreur de page', errors, []);
  await context.close();
}

async function keyboardScenario(browser) {
  console.log('\n# Clavier — PC 1280×720');
  const { context, page, errors, g } = await newPage(browser, {
    viewport: { width: 1280, height: 720 },
  });
  eq('démarre au clavier', await g.source(), 'keyboard');
  await page.keyboard.press('o');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await settle(page, 200);
  check('options : ECHAP ferme sans quitter le menu', await g.active('MenuScene'));
  eq(
    'options : la difficulté se règle',
    await page.evaluate(async () =>
      (await import('/src/systems/difficultySetting.js')).getDifficultyMode(),
    ),
    'easy',
  );
  await page.keyboard.press('h');
  await page.keyboard.press('Space');
  await settle(page, 500);
  check('ESPACE lance la partie', await g.active('GameScene'));

  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Space');
  await page.keyboard.down('Control');
  await settle(page);
  eq('flèches, espace et ctrl', await g.intent(), {
    rotate: -1,
    thrust: true,
    fire: true,
    missile: true,
  });
  for (const k of ['ArrowLeft', 'ArrowUp', 'Space', 'Control']) await page.keyboard.up(k);
  await settle(page);
  eq('touches relâchées', await g.intent(), {
    rotate: 0,
    thrust: false,
    fire: false,
    missile: false,
  });

  await page.keyboard.press('m');
  await settle(page, 120);
  check('M coupe le son', await g.muted());
  await page.keyboard.press('m');
  await settle(page, 120);
  check('M rétablit le son', !(await g.muted()));
  await page.keyboard.press('p');
  await settle(page, 120);
  check('P met en pause', await g.paused());
  await page.keyboard.press('p');
  await settle(page, 120);
  check('P reprend', !(await g.paused()));
  await page.keyboard.press('p');
  await settle(page, 120);
  await page.keyboard.press('Escape');
  await settle(page);
  check('ÉCHAP depuis la pause revient au menu', await g.active('MenuScene'));

  await page.keyboard.press('Space');
  await settle(page, 400);
  await g.forceOutcome('DEFEAT');
  await page.waitForTimeout(2600);
  const before = await g.worldId();
  await page.keyboard.press('Space');
  await settle(page, 400);
  check(
    'ESPACE à l’écran de fin rejoue',
    (await g.active('GameScene')) && (await g.worldId()) !== before,
  );
  await g.forceOutcome('VICTORY');
  await page.waitForTimeout(2600);
  await page.keyboard.press('Escape');
  await settle(page);
  check('ÉCHAP à l’écran de fin revient au menu', await g.active('MenuScene'));
  check('pas d’invite portrait au PC', !(await page.locator('#rotate').isVisible()));
  eq('aucune erreur de page', errors, []);
  await context.close();
}

async function mixedScenario(browser) {
  console.log('\n# Mixte — tablette avec clavier');
  const { context, page, errors, g, cdp } = await newPage(browser, {
    ...devices['iPad (gen 7) landscape'],
  });
  await page.keyboard.press('Space');
  await settle(page, 500);
  check('la partie démarre au clavier sur tablette', await g.active('GameScene'));
  eq('une touche passe la source au clavier', await g.source(), 'keyboard');

  // Clavier tenu, puis un doigt sur la poussée : les deux sources agissent ensemble, l'overlay apparaît.
  await page.keyboard.down('ArrowRight');
  await settle(page);
  eq('clavier seul : rotation', await g.intent(), {
    rotate: 1,
    thrust: false,
    fire: false,
    missile: false,
  });
  await touchStart(cdp, [{ id: 1, ...(await g.toCss(366, 236)) }]);
  await settle(page, 300);
  eq('un toucher repasse au tactile', await g.source(), 'touch');
  eq('clavier + doigt en même temps', await g.intent(), {
    rotate: 1,
    thrust: true,
    fire: false,
    missile: false,
  });
  await touchEnd(cdp);
  await settle(page);
  eq('doigt levé : le clavier garde la main', await g.intent(), {
    rotate: 1,
    thrust: false,
    fire: false,
    missile: false,
  });
  await page.keyboard.up('ArrowRight');
  // Une touche repasse l'affichage au clavier ; un frôlement d'écran le rend au tactile.
  await page.keyboard.press('a');
  eq('une touche repasse au clavier', await g.source(), 'keyboard');
  await touchStart(cdp, [{ id: 1, ...(await g.toCss(430, 222)) }]);
  await settle(page, 300);
  eq('tir au doigt après le clavier', (await g.intent()).fire, true);
  await touchEnd(cdp);
  eq('aucune erreur de page', errors, []);
  await context.close();
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    await touchScenario(browser, 'Pixel 7 (Android)', 'Pixel 7 landscape');
    await touchScenario(browser, 'iPhone 13 (iOS)', 'iPhone 13 landscape');
    await keyboardScenario(browser);
    await mixedScenario(browser);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${checks - failures.length}/${checks} vérifications réussies`);
  if (failures.length) {
    console.log(`Échecs :\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
})();
