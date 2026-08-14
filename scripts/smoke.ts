import { chromium, type Browser, type ConsoleMessage, type Page } from 'playwright-core';

const port = 4173;
const externalUrl = process.env.SMOKE_URL;
const url = externalUrl ?? `http://127.0.0.1:${port}/room-smoke.html`;
const chromiumPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const errors: string[] = [];
let server: ReturnType<typeof Bun.spawn> | null = null;
let browser: Browser | null = null;
const smokeTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 120_000);
const smokeTimeout = setTimeout(() => {
  console.error(`[smoke] timed out after ${smokeTimeoutMs}ms`);
  process.exitCode = 124;
  void browser?.close();
  server?.kill();
}, smokeTimeoutMs);

function phase(label: string): void {
  console.log(`[smoke] ${label}`);
}

interface HoverState {
  readonly cell: string;
  readonly level: string;
  readonly action: string;
  readonly kind: string;
  readonly wall: string;
  readonly valid: string;
  readonly playerCell: string;
  readonly playerLevel: string;
  readonly pose: string;
}

interface HoverTarget extends HoverState {
  readonly x: number;
  readonly y: number;
}

async function waitForServer(target: string): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(target);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${target}`);
}

async function hoverState(page: Page): Promise<HoverState> {
  return page.evaluate(() => {
    const canvas = document.querySelector('habbo-game')?.shadowRoot?.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { cell: '', level: '', action: '', kind: '', wall: '', valid: '', playerCell: '', playerLevel: '', pose: '' };
    }
    return {
      cell: canvas.dataset.hoverCell ?? '',
      level: canvas.dataset.hoverLevel ?? '',
      action: canvas.dataset.hoverAction ?? '',
      kind: canvas.dataset.hoverObjectKind ?? '',
      wall: canvas.dataset.hoverWall ?? '',
      valid: canvas.dataset.hoverValid ?? '',
      playerCell: canvas.dataset.playerCell ?? '',
      playerLevel: canvas.dataset.playerLevel ?? '',
      pose: canvas.dataset.playerPose ?? '',
    };
  });
}

async function findHoverTarget(
  page: Page,
  action: string,
  accept: (state: HoverState) => boolean = () => true,
): Promise<HoverTarget> {
  for (let y = 120; y <= 780; y += 42) {
    for (let x = 90; x <= 1360; x += 42) {
      await page.mouse.move(x, y);
      const state = await hoverState(page);
      if (state.action === action && state.cell && accept(state)) return { x, y, ...state };
    }
  }
  throw new Error(`Could not find hover target for ${action}.`);
}

async function findBuildTarget(
  page: Page,
  action: string,
  accept: (state: HoverState) => boolean = () => true,
): Promise<HoverTarget> {
  for (let y = 120; y <= 790; y += 34) {
    for (let x = 540; x <= 1370; x += 34) {
      await page.mouse.move(x, y);
      const state = await hoverState(page);
      if (state.action === action && state.valid !== 'false' && accept(state)) return { x, y, ...state };
    }
  }
  throw new Error(`Could not find build target for ${action}.`);
}

function cellPoint(value: string): { x: number; z: number } | null {
  const [x, z] = value.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(z) ? { x: x!, z: z! } : null;
}

function expectText(actual: string | null, expected: string, label: string): void {
  if (!actual?.includes(expected)) errors.push(`${label}: expected text ${JSON.stringify(expected)}, got ${JSON.stringify(actual ?? '')}`);
}

try {
  phase('start');
  if (!externalUrl) {
    server = Bun.spawn(['bun', 'run', 'dev:client', '--', '--port', String(port)], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await waitForServer(url);
  }

  browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  const response = await page.goto(url, { waitUntil: 'networkidle' });
  phase('room loaded');
  if (!response?.ok()) errors.push(`navigation: HTTP ${response?.status() ?? 'no response'}`);
  const host = page.locator('habbo-game');
  await host.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('habbo-game')?.shadowRoot?.querySelector('canvas');
    return canvas instanceof HTMLCanvasElement && canvas.dataset.humanReady !== undefined;
  });
  const humanReady = await page.evaluate(() => {
    const canvas = document.querySelector('habbo-game')?.shadowRoot?.querySelector('canvas');
    return canvas instanceof HTMLCanvasElement ? canvas.dataset.humanReady : undefined;
  });
  if (humanReady !== 'true') errors.push(`human: expected composed avatar, got ${humanReady ?? 'missing status'}`);

  const initial = await page.evaluate(() => {
    const root = document.querySelector('habbo-game')?.shadowRoot;
    const canvas = root?.querySelector('canvas');
    return {
      canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
      canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
      catalogueVisible: Boolean(root?.querySelector('catalogue-explorer')),
    };
  });
  if (initial.canvasWidth < 100 || initial.canvasHeight < 100) errors.push(`canvas: invalid buffer ${initial.canvasWidth}x${initial.canvasHeight}`);
  if (initial.catalogueVisible) errors.push('play mode: Catalogue should be hidden');

  const modeButton = host.locator('.mode-btn');
  expectText(await modeButton.textContent(), 'Edit room', 'play/edit action');
  if (await host.locator('.controls > .mode-btn, .controls > .view-control > .view-open').count() !== 2) {
    errors.push('play controls: expected only Edit room and View as primary controls');
  }

  await host.locator('.view-open').click();
  phase('view controls');
  const viewMenu = host.locator('.view-menu');
  await viewMenu.waitFor({ state: 'visible' });
  await viewMenu.locator('.turn-select').selectOption('free');
  await page.keyboard.down('q');
  await page.waitForTimeout(320);
  await page.screenshot({ path: 'artifacts/ui-view-menu.png', fullPage: true });
  await page.keyboard.up('q');
  await viewMenu.locator('.turn-select').selectOption('snap-90');
  await host.locator('.view-open').click();

  const sofaTarget = await findHoverTarget(page, 'sit', (state) => state.kind === 'sofa');
  phase('play targeting');
  const playerStart = await hoverState(page);
  const start = cellPoint(playerStart.playerCell);
  if (start) {
    const walkTarget = await findHoverTarget(page, 'walk', (state) => {
      const next = cellPoint(state.cell);
      return Boolean(next && Math.abs(next.x - start.x) + Math.abs(next.z - start.z) >= 2);
    });
    await page.mouse.click(walkTarget.x, walkTarget.y);
    await page.waitForFunction((targetCell) => {
      const canvas = document.querySelector('habbo-game')?.shadowRoot?.querySelector('canvas');
      return canvas instanceof HTMLCanvasElement && canvas.dataset.playerCell === targetCell && canvas.dataset.playerPose === 'stand';
    }, walkTarget.cell, { timeout: 8_000 });
  }

  await modeButton.click();
  phase('catalogue');
  expectText(await modeButton.textContent(), 'Done', 'edit/done action');
  const catalogue = host.locator('catalogue-explorer');
  await catalogue.waitFor({ state: 'visible' });
  await catalogue.locator('.object-card').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const game = document.querySelector('habbo-game');
    const catalogueElement = game?.shadowRoot?.querySelector('catalogue-explorer');
    const previews = catalogueElement?.shadowRoot?.querySelectorAll('catalogue-object-preview');
    if (!previews || previews.length !== 15) return false;
    return [...previews].every((preview) => {
      if (!(preview instanceof HTMLElement) || preview.dataset.ready !== 'true') return false;
      const image = preview.shadowRoot?.querySelector('img');
      return image instanceof HTMLImageElement && image.naturalWidth > 0 && image.naturalHeight > 0;
    });
  }, undefined, { timeout: 8_000 });
  if (await catalogue.locator('.rail button').count() !== 4) errors.push('Catalogue: expected four primary sections');
  if (await catalogue.locator('.object-card').count() !== 15) errors.push('Catalogue: expected 15 placeable objects');
  if (await host.locator('.controls > .mode-btn, .controls > .catalogue-open, .controls > .view-control > .view-open').count() !== 3) {
    errors.push('edit controls: expected Done, Catalogue and View as primary controls');
  }
  const catalogueText = (await catalogue.textContent()) ?? '';
  for (const internalTerm of ['revision', 'composable', 'sparse', 'bidirectionally', ' · traversal', 'storey']) {
    if (catalogueText.toLowerCase().includes(internalTerm.toLowerCase())) errors.push(`Catalogue leaks internal copy: ${internalTerm}`);
  }

  const search = catalogue.locator('input[type="search"]');
  await search.fill('Mint Sofa');
  await page.waitForFunction(() => {
    const catalogue = document.querySelector('habbo-game')?.shadowRoot?.querySelector('catalogue-explorer');
    return catalogue?.shadowRoot?.querySelectorAll('.object-card').length === 1;
  }, undefined, { timeout: 2_000 });
  if (await catalogue.locator('.object-card').count() !== 1) errors.push('Catalogue search: expected one Mint Sofa result');
  await search.fill('');
  await page.screenshot({ path: 'artifacts/ui-catalogue.png', fullPage: true });

  phase('material studio');
  await search.fill('Club Chair');
  const chairCard = catalogue.locator('.object-wrap').first();
  await chairCard.locator('.style-action').click();
  const materialStudio = host.locator('material-studio');
  await materialStudio.waitFor({ state: 'visible' });
  if (await materialStudio.locator('.slot').count() !== 3) errors.push('Material Studio: Club Chair should expose three semantic parts');
  await materialStudio.locator('.preset').filter({ hasText: 'Fine Linen' }).click();
  await materialStudio.locator('.saved-row input').fill('QA Linen');
  await materialStudio.locator('.saved-row button').filter({ hasText: 'Save' }).click();
  expectText(await materialStudio.locator('.saved-list').textContent(), 'QA Linen', 'saved material preset');
  await page.screenshot({ path: 'artifacts/ui-material-studio.png', fullPage: true });
  await materialStudio.locator('.apply').click();
  await materialStudio.waitFor({ state: 'detached' });
  const styledChairTarget = await findBuildTarget(page, 'build-place-prototype');
  await page.mouse.click(styledChairTarget.x, styledChairTarget.y);
  await page.waitForTimeout(140);
  const customAppearances = await host.locator('canvas').getAttribute('data-custom-appearances');
  if (Number(customAppearances ?? '0') < 1) errors.push('Material Studio: styled placement did not create an appearance component');
  await page.keyboard.press('Escape');
  await host.locator('.catalogue-open').click();
  await catalogue.waitFor({ state: 'visible' });

  await search.fill('vase');
  phase('stacked vase interaction');
  await catalogue.locator('.object-card').first().click();
  await host.locator('.catalogue-open').click();
  await catalogue.waitFor({ state: 'detached' });
  await page.waitForTimeout(120);
  const sofaEditPoint = await host.evaluate((game: any) => game.debugScreenPointForPrototype('sofa')) as { x: number; y: number } | null;
  if (!sofaEditPoint) throw new Error('Stacking: sofa did not produce a projected edit-mode screen point.');
  await page.mouse.move(sofaEditPoint.x, sofaEditPoint.y);
  const sofaPlacement = await hoverState(page);
  if (sofaPlacement.action !== 'build-place-prototype' || sofaPlacement.valid === 'false') {
    throw new Error(`Stacking: sofa surface was not a valid placement target (${sofaPlacement.action}/${sofaPlacement.valid}).`);
  }
  await page.mouse.click(sofaEditPoint.x, sofaEditPoint.y);
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  const vasePoint = await host.evaluate((game: any) => game.debugScreenPointForPrototype('vase')) as { x: number; y: number } | null;
  if (!vasePoint) throw new Error('Stacking: vase did not produce a projected screen point.');
  await page.mouse.click(vasePoint.x, vasePoint.y);
  await page.waitForTimeout(30);
  expectText(await host.locator('.selection-panel .title').textContent(), 'Ceramic Vase', 'visible stacked decor selection');
  await page.mouse.move(vasePoint.x, vasePoint.y);
  await page.mouse.down();
  await page.mouse.move(vasePoint.x + 110, vasePoint.y - 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  expectText(await host.locator('.selection-panel .title').textContent(), 'Ceramic Vase', 'dragging stacked decor selects the vase');
  await host.locator('.selection-panel .danger').click();
  await page.waitForTimeout(80);
  await page.mouse.click(sofaTarget.x, sofaTarget.y);
  await page.waitForTimeout(40);
  expectText(await host.locator('.selection-panel .title').textContent(), 'Mint Sofa', 'sofa remains after vase pickup');
  await host.locator('.catalogue-open').click();
  await catalogue.waitFor({ state: 'visible' });
  await search.fill('');

  const floorTab = catalogue.locator('.rail button').filter({ hasText: 'Floor' });
  const objectsTab = catalogue.locator('.rail button').filter({ hasText: 'Objects' });
  const wallsTab = catalogue.locator('.rail button').filter({ hasText: 'Walls' });
  const travelTab = catalogue.locator('.rail button').filter({ hasText: 'Travel' });

  await floorTab.click();
  phase('floor tools');
  expectText(await catalogue.locator('.tool-card.active').textContent(), 'Shape', 'Floor default tool');
  await findBuildTarget(page, 'build-floor-shape');

  await objectsTab.click();
  await search.fill('Block Steps');
  await catalogue.locator('.object-card').first().click();
  expectText(await catalogue.locator('.active-tool').textContent(), 'Placing Block Steps', 'Object placement status');
  await floorTab.click();
  expectText(await catalogue.locator('.tool-card.active').textContent(), 'Shape', 'Floor tab cancels hidden object placement');

  await catalogue.locator('.add-height').click();
  phase('second build height');
  await page.waitForFunction(() => {
    const catalogue = document.querySelector('habbo-game')?.shadowRoot?.querySelector('catalogue-explorer');
    return catalogue?.shadowRoot?.querySelectorAll('.height-choice').length === 2;
  });
  const levelButtons = catalogue.locator('.height-choice');
  expectText(await levelButtons.last().textContent(), '+10 steps', 'new build height label');

  const firstFloor = await findBuildTarget(page, 'build-floor-shape');
  await page.mouse.click(firstFloor.x, firstFloor.y);
  await page.waitForTimeout(100);
  const secondFloor = await findBuildTarget(page, 'build-floor-shape', (state) => state.cell !== firstFloor.cell);
  await page.mouse.click(secondFloor.x, secondFloor.y);
  await page.waitForTimeout(100);
  const secondPoint = cellPoint(secondFloor.cell);
  if (secondPoint) {
    const thirdFloor = await findBuildTarget(page, 'build-floor-shape', (state) => {
      const point = cellPoint(state.cell);
      return Boolean(point && state.cell !== firstFloor.cell && Math.abs(point.x - secondPoint.x) + Math.abs(point.z - secondPoint.z) === 1);
    });
    await page.mouse.click(thirdFloor.x, thirdFloor.y);
    await page.waitForTimeout(100);
  }
  expectText(await catalogue.locator('.height-heading small').textContent(), 'tiles', 'build-height tile count');
  const heightAdjust = catalogue.locator('.height-adjust');
  await heightAdjust.locator('button').first().click();
  await page.waitForTimeout(80);
  const heightInput = heightAdjust.locator('.height-input');
  if (await heightInput.inputValue() !== '9') errors.push('Floor base height: expected step control to move from 10 to 9');
  await heightInput.fill('14');
  await heightInput.blur();
  await page.waitForTimeout(80);
  if (await heightInput.inputValue() !== '14') errors.push('Floor base height: expected typed height 14 to persist');
  await page.screenshot({ path: 'artifacts/ui-floor-height.png', fullPage: true });

  await objectsTab.click();
  phase('object stacking');
  await search.fill('Block Steps');
  await catalogue.locator('.object-card').first().click();
  const objectTarget = await findBuildTarget(page, 'build-place-prototype');
  await page.mouse.click(objectTarget.x, objectTarget.y);
  await page.waitForTimeout(120);
  await page.mouse.move(objectTarget.x, objectTarget.y);
  const stackedHover = await hoverState(page);
  if (stackedHover.action !== 'build-place-prototype' || stackedHover.valid === 'false') errors.push('Stacking: second Block Steps placement should remain valid on the first');
  await page.mouse.click(objectTarget.x, objectTarget.y);
  await page.waitForTimeout(160);
  await page.screenshot({ path: 'artifacts/ui-object-stacking.png', fullPage: true });
  await page.keyboard.press('Escape');

  await wallsTab.click();
  phase('walls');
  expectText(await catalogue.locator('.tool-card.active').textContent(), 'Draw / remove', 'Walls default tool');
  const wallTarget = await findBuildTarget(page, 'build-wall-shape');
  await page.mouse.click(wallTarget.x, wallTarget.y);
  await page.waitForTimeout(120);
  await page.screenshot({ path: 'artifacts/ui-walls.png', fullPage: true });

  await travelTab.click();
  phase('travel');
  const pairButton = catalogue.locator('.pairing .action.primary');
  expectText(await pairButton.textContent(), 'Link pair', 'teleport idle action');
  await pairButton.click();
  expectText(await pairButton.textContent(), 'Cancel', 'teleport active action');
  const teleportA = await findBuildTarget(page, 'build-teleport-pair');
  await page.mouse.click(teleportA.x, teleportA.y);
  await page.waitForTimeout(100);
  expectText(await catalogue.locator('.hint').textContent(), 'Entrance A', 'teleport endpoint A status');

  await levelButtons.first().click();
  await page.waitForTimeout(120);
  expectText(await catalogue.locator('.hint').textContent(), 'Entrance A', 'teleport A survives build-height switch');
  const teleportB = await findBuildTarget(page, 'build-teleport-pair');
  await page.mouse.click(teleportB.x, teleportB.y);
  await page.waitForTimeout(180);
  if (await catalogue.locator('.pair').count() !== 1) errors.push('Travel: expected one linked teleporter pair');
  await pairButton.click();
  expectText(await pairButton.textContent(), 'Link pair', 'teleport cancel returns to idle');
  await page.screenshot({ path: 'artifacts/ui-travel.png', fullPage: true });

  await modeButton.click();
  await catalogue.waitFor({ state: 'detached' });
  expectText(await modeButton.textContent(), 'Edit room', 'Done returns to play');

  await page.reload({ waitUntil: 'networkidle' });
  phase('final reload');
  await host.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('habbo-game')?.shadowRoot?.querySelector('canvas');
    return canvas instanceof HTMLCanvasElement && canvas.dataset.humanReady === 'true';
  });
  await page.evaluate(() => document.querySelector('habbo-game')?.setAttribute('capture', ''));
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'artifacts/room.png', fullPage: true });

  console.log(JSON.stringify({
    url,
    screenshots: [
      'artifacts/room.png',
      'artifacts/ui-view-menu.png',
      'artifacts/ui-catalogue.png',
      'artifacts/ui-material-studio.png',
      'artifacts/ui-floor-height.png',
      'artifacts/ui-object-stacking.png',
      'artifacts/ui-walls.png',
      'artifacts/ui-travel.png',
    ],
    initial,
    errors,
  }, null, 2));
  phase('complete');
  if (errors.length > 0) process.exitCode = 1;
} finally {
  clearTimeout(smokeTimeout);
  await browser?.close();
  if (server) {
    server.kill();
    await server.exited;
  }
}
