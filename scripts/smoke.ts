import { chromium, type Browser, type ConsoleMessage, type Page } from 'playwright-core';

const port = 4173;
const externalUrl = process.env.SMOKE_URL;
const url = externalUrl ?? `http://127.0.0.1:${port}/room-smoke.html`;
const chromiumPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const errors: string[] = [];
let server: ReturnType<typeof Bun.spawn> | null = null;
let browser: Browser | null = null;

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
      await page.waitForTimeout(5);
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
      await page.waitForTimeout(4);
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
  const viewMenu = host.locator('.view-menu');
  await viewMenu.waitFor({ state: 'visible' });
  await viewMenu.locator('.turn-select').selectOption('free');
  await viewMenu.locator('.morph-select').selectOption('pixel-transport');
  await page.keyboard.down('q');
  await page.waitForTimeout(320);
  await page.screenshot({ path: 'artifacts/ui-view-menu.png', fullPage: true });
  await page.keyboard.up('q');
  await viewMenu.locator('.turn-select').selectOption('snap-90');
  await viewMenu.locator('.morph-select').selectOption('grid-warp');
  await host.locator('.view-open').click();

  const sofaTarget = await findHoverTarget(page, 'sit', (state) => state.kind === 'sofa');
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
  if (await catalogue.locator('.object-card').count() !== 15) errors.push('Catalogue: expected 14 placeable objects');
  if (await host.locator('.controls > .mode-btn, .controls > .catalogue-open, .controls > .view-control > .view-open').count() !== 3) {
    errors.push('edit controls: expected Done, Catalogue and View as primary controls');
  }
  if (await catalogue.locator('.storey-settings').getAttribute('open') !== null) errors.push('Storey settings should be collapsed by default');
  const catalogueText = (await catalogue.textContent()) ?? '';
  for (const internalTerm of ['revision', 'composable', 'sparse', 'bidirectionally', ' · traversal']) {
    if (catalogueText.toLowerCase().includes(internalTerm.toLowerCase())) errors.push(`Catalogue leaks internal copy: ${internalTerm}`);
  }

  const search = catalogue.locator('input[type="search"]');
  await search.fill('sofa');
  await page.waitForTimeout(50);
  if (await catalogue.locator('.object-card').count() !== 1) errors.push('Catalogue search: expected one sofa result');
  await search.fill('');
  await page.screenshot({ path: 'artifacts/ui-catalogue.png', fullPage: true });

  await search.fill('vase');
  await catalogue.locator('.object-card').first().click();
  await host.locator('.catalogue-open').click();
  await catalogue.waitFor({ state: 'detached' });
  await page.mouse.click(sofaTarget.x, sofaTarget.y);
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  let vasePoint: { x: number; y: number } | null = null;
  for (let dy = -90; dy <= 20 && !vasePoint; dy += 10) {
    for (let dx = -45; dx <= 45; dx += 10) {
      const x = sofaTarget.x + dx;
      const y = sofaTarget.y + dy;
      await page.mouse.click(x, y);
      await page.waitForTimeout(8);
      const title = await host.locator('.selection-title').textContent().catch(() => null);
      if (title?.includes('Ceramic Vase')) { vasePoint = { x, y }; break; }
    }
  }
  if (!vasePoint) errors.push('Stacking: could not select the visible vase above the sofa');
  else {
    await page.mouse.move(vasePoint.x, vasePoint.y);
    await page.mouse.down();
    await page.mouse.move(vasePoint.x + 110, vasePoint.y - 20, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    expectText(await host.locator('.selection-title').textContent(), 'Ceramic Vase', 'dragging stacked decor selects the vase');
    await host.locator('.selection-panel .danger').click();
    await page.waitForTimeout(80);
    await page.mouse.click(sofaTarget.x, sofaTarget.y);
    await page.waitForTimeout(40);
    expectText(await host.locator('.selection-title').textContent(), 'Mint Sofa', 'sofa remains after vase pickup');
  }
  await host.locator('.catalogue-open').click();
  await catalogue.waitFor({ state: 'visible' });
  await search.fill('');

  const floorTab = catalogue.locator('.rail button').filter({ hasText: 'Floor' });
  const objectsTab = catalogue.locator('.rail button').filter({ hasText: 'Objects' });
  const wallsTab = catalogue.locator('.rail button').filter({ hasText: 'Walls' });
  const travelTab = catalogue.locator('.rail button').filter({ hasText: 'Travel' });

  await floorTab.click();
  expectText(await catalogue.locator('.tool-card.active').textContent(), 'Shape', 'Floor default tool');
  await findBuildTarget(page, 'build-floor-shape');

  await objectsTab.click();
  await search.fill('Block Steps');
  await catalogue.locator('.object-card').first().click();
  expectText(await catalogue.locator('.active-tool').textContent(), 'Placing Block Steps', 'Object placement status');
  await floorTab.click();
  expectText(await catalogue.locator('.tool-card.active').textContent(), 'Shape', 'Floor tab cancels hidden object placement');

  await catalogue.locator('.add-storey').click();
  await page.waitForFunction(() => {
    const catalogue = document.querySelector('habbo-game')?.shadowRoot?.querySelector('catalogue-explorer');
    return catalogue?.shadowRoot?.querySelectorAll('.level').length === 2;
  });
  const levelButtons = catalogue.locator('.level');
  expectText(await levelButtons.last().textContent(), 'Storey 2', 'new storey label');

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
  expectText(await catalogue.locator('.storey-heading small').textContent(), 'tiles', 'storey tile count');
  await catalogue.locator('.storey-settings summary').click();
  await catalogue.locator('.storey-settings-body').waitFor({ state: 'visible' });
  expectText(await catalogue.locator('.storey-settings-body').textContent(), 'Base height moves the whole storey', 'advanced storey explanation');
  await page.screenshot({ path: 'artifacts/ui-floor-storey.png', fullPage: true });

  await objectsTab.click();
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
  expectText(await catalogue.locator('.tool-card.active').textContent(), 'Draw / remove', 'Walls default tool');
  const wallTarget = await findBuildTarget(page, 'build-wall-shape');
  await page.mouse.click(wallTarget.x, wallTarget.y);
  await page.waitForTimeout(120);
  await page.screenshot({ path: 'artifacts/ui-walls.png', fullPage: true });

  await travelTab.click();
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
  expectText(await catalogue.locator('.hint').textContent(), 'Entrance A', 'teleport A survives storey switch');
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
      'artifacts/ui-floor-storey.png',
      'artifacts/ui-object-stacking.png',
      'artifacts/ui-walls.png',
      'artifacts/ui-travel.png',
    ],
    initial,
    errors,
  }, null, 2));
  if (errors.length > 0) process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    server.kill();
    await server.exited;
  }
}
