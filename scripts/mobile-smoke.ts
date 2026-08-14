import { existsSync, rmSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';

const port = Number(process.env.MOBILE_SMOKE_PORT ?? 4185);
const base = process.env.MOBILE_SMOKE_URL ?? `http://127.0.0.1:${port}`;
const dbPath = process.env.MOBILE_SMOKE_DB ?? `/tmp/roomlab-mobile-smoke-${process.pid}.sqlite`;
let server: ReturnType<typeof Bun.spawn> | null = null;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

const wait = async (fn: () => Promise<boolean> | boolean, label: string) => {
  const end = Date.now() + 10_000;
  while (Date.now() < end) { if (await fn()) return; await Bun.sleep(75); }
  throw new Error(`timeout ${label}`);
};
const game = () => page.locator('online-room-page habbo-game');
const canvas = () => game().locator('canvas');
const data = () => canvas().evaluate((element: HTMLElement) => ({
  cell: element.dataset.playerCell ?? '', pose: element.dataset.playerPose ?? '', camera: element.dataset.cameraState ?? '', human: element.dataset.humanReady ?? '',
}));
const camera = async () => { const parts = (await data()).camera.split(',').map(Number); return { x: parts[0], z: parts[1], view: parts[2] }; };

async function touch(points: { x: number; y: number; id: number }[][]) {
  const session = await ctx.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points[0] });
  for (const next of points.slice(1)) { await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: next }); await Bun.sleep(20); }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}
async function walkTarget(current: string) {
  for (let y = 180; y < 720; y += 32) for (let x = 80; x < 370; x += 32) {
    await page.mouse.move(x, y);
    const hover = await canvas().evaluate((element: HTMLElement) => ({ action: element.dataset.hoverAction ?? '', cell: element.dataset.hoverCell ?? '' }));
    if (hover.action === 'walk' && hover.cell && hover.cell !== current) return { x, y, cell: hover.cell };
  }
  throw new Error('no walk target');
}
async function swipeInside(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  const metrics = await locator.evaluate((element: HTMLElement) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
  if (!box || metrics.scrollHeight <= metrics.clientHeight + 20) return { ...metrics, scrollTop: 0 };
  const x = box.x + box.width * 0.75;
  await touch([[{ x, y: box.y + box.height - 35, id: 1 }], [{ x, y: box.y + box.height * 0.65, id: 1 }], [{ x, y: box.y + box.height * 0.35, id: 1 }], [{ x, y: box.y + 55, id: 1 }]]);
  await page.waitForTimeout(180);
  return { ...metrics, scrollTop: await locator.evaluate((element: HTMLElement) => element.scrollTop) };
}
async function pinchInside(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  const before = await page.evaluate(() => visualViewport?.scale ?? 1);
  if (box) {
    const cy = box.y + Math.min(box.height * 0.45, 190); const cx = box.x + box.width * 0.55;
    await touch([[{ x: cx - 25, y: cy, id: 1 }, { x: cx + 25, y: cy, id: 2 }], [{ x: cx - 55, y: cy, id: 1 }, { x: cx + 55, y: cy, id: 2 }], [{ x: cx - 80, y: cy, id: 1 }, { x: cx + 80, y: cy, id: 2 }]]);
    await page.waitForTimeout(180);
  }
  return { before, after: await page.evaluate(() => visualViewport?.scale ?? 1) };
}

try {
  if (!process.env.MOBILE_SMOKE_URL) {
    if (!existsSync('dist/index.html')) throw new Error('Build dist first with bun run build.');
    for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });
    server = Bun.spawn(['bun', 'run', 'server/index.ts'], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: { ...process.env, PORT: String(port), ROOMLAB_DB: dbPath, NODE_ENV: 'production' } });
    await wait(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, 'mobile server');
  }

  const landingResponse = await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const landing = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, sw: document.scrollingElement?.scrollWidth ?? 0, sh: document.scrollingElement?.scrollHeight ?? 0, overflow: getComputedStyle(document.body).overflowY, touch: getComputedStyle(document.body).touchAction }));
  await touch([[{ x: 195, y: 720, id: 1 }], [{ x: 195, y: 620, id: 1 }], [{ x: 195, y: 500, id: 1 }], [{ x: 195, y: 380, id: 1 }], [{ x: 195, y: 240, id: 1 }]]);
  await page.waitForTimeout(200);
  const landingScroll = await page.evaluate(() => scrollY);
  if (landing.sh <= landing.h + 100 || landing.overflow === 'hidden' || landing.touch === 'none' || landingScroll < 100) errors.push('landing: mobile touch scrolling is not available');
  if (landing.sw > landing.w + 1) errors.push(`landing: horizontal overflow ${landing.sw}px > ${landing.w}px`);
  await page.screenshot({ path: 'artifacts/mobile-home.png' }); await page.evaluate(() => scrollTo(0, 0));

  const user = `Mob${Date.now().toString().slice(-9)}`;
  if (!landingResponse?.ok()) errors.push(`landing: HTTP ${landingResponse?.status() ?? 'no response'}`);
  await page.locator('landing-page input[name=username]').fill(user); await page.locator('landing-page button.primary').click(); await page.locator('rooms-page').waitFor({ state: 'visible' });
  await page.locator('lobby-shell .nav button').filter({ hasText: 'Shop' }).click(); await page.locator('shop-page .offer').first().waitFor({ state: 'visible' });
  const firstOffer = page.locator('shop-page .offer').first(); const shopCard = await firstOffer.boundingBox(); const shopPreview = await firstOffer.locator('.preview').boundingBox();
  const nav = await page.locator('lobby-shell .nav').evaluate((element: HTMLElement) => ({ position: getComputedStyle(element).position, bottom: element.getBoundingClientRect().bottom, height: element.getBoundingClientRect().height }));
  const lobbyBefore = await page.evaluate(() => ({ w: innerWidth, sw: document.scrollingElement?.scrollWidth ?? 0, h: innerHeight, sh: document.scrollingElement?.scrollHeight ?? 0 }));
  await touch([[{ x: 350, y: 700, id: 1 }], [{ x: 350, y: 590, id: 1 }], [{ x: 350, y: 470, id: 1 }], [{ x: 350, y: 350, id: 1 }], [{ x: 350, y: 220, id: 1 }]]); await page.waitForTimeout(200);
  const lobbyScroll = await page.evaluate(() => scrollY);
  if (lobbyBefore.sh <= lobbyBefore.h + 100 || lobbyScroll < 100) errors.push('lobby: touch scrolling is not available');
  if (lobbyBefore.sw > lobbyBefore.w + 1) errors.push(`lobby: horizontal overflow ${lobbyBefore.sw}px > ${lobbyBefore.w}px`);
  await page.screenshot({ path: 'artifacts/mobile-lobby.png' });

  await page.locator('lobby-shell .nav button').filter({ hasText: 'Rooms' }).click(); await page.locator('rooms-page button.primary').filter({ hasText: 'New room' }).click();
  await page.locator('rooms-page input[name=name]').fill('Mobile Room'); await page.locator('rooms-page form.create button.primary').click(); await game().waitFor({ state: 'visible', timeout: 12_000 }); await wait(async () => (await data()).human === 'true', 'human');
  const canvasCss = await canvas().evaluate((element: HTMLElement) => ({ touch: getComputedStyle(element).touchAction, w: element.getBoundingClientRect().width, h: element.getBoundingClientRect().height, scrollY }));
  const start = await data(); const target = await walkTarget(start.cell); await page.touchscreen.tap(target.x, target.y); await wait(async () => { const next = await data(); return next.cell === target.cell && next.pose === 'stand'; }, 'tap walk');
  const scale0 = await page.evaluate(() => visualViewport?.scale ?? 1); await page.touchscreen.tap(target.x, target.y); await page.waitForTimeout(80); await page.touchscreen.tap(target.x, target.y); await page.waitForTimeout(250); const scale1 = await page.evaluate(() => visualViewport?.scale ?? 1);
  const pan0 = await camera(); await touch([[{ x: 260, y: 430, id: 1 }], [{ x: 280, y: 445, id: 1 }], [{ x: 305, y: 465, id: 1 }], [{ x: 325, y: 480, id: 1 }]]); await page.waitForTimeout(180); const pan1 = await camera();
  const zoom0 = await camera(); await touch([[{ x: 205, y: 420, id: 1 }, { x: 275, y: 420, id: 2 }], [{ x: 190, y: 420, id: 1 }, { x: 290, y: 420, id: 2 }], [{ x: 175, y: 420, id: 1 }, { x: 305, y: 420, id: 2 }], [{ x: 160, y: 420, id: 1 }, { x: 320, y: 420, id: 2 }]]); await page.waitForTimeout(320); const zoom1 = await camera();
  await touch([[{ x: 90, y: 420, id: 1 }, { x: 300, y: 420, id: 2 }], [{ x: 120, y: 420, id: 1 }, { x: 270, y: 420, id: 2 }], [{ x: 150, y: 420, id: 1 }, { x: 240, y: 420, id: 2 }], [{ x: 175, y: 420, id: 1 }, { x: 215, y: 420, id: 2 }]]); await page.waitForTimeout(450); const zoomOut = await camera();
  await game().locator('.view-open').click(); const viewMenu = game().locator('.view-menu'); await viewMenu.waitFor({ state: 'visible' }); const morphControls = await viewMenu.locator('.morph-select').count(); await game().locator('.view-open').click();
  const healthyStatus = await page.locator('online-room-page .status').count();

  const mode = game().locator('.mode-btn'); const modeHeight = await mode.evaluate((button: HTMLElement) => button.getBoundingClientRect().height); await mode.click();
  const cat = game().locator('catalogue-explorer'); await cat.waitFor({ state: 'visible' }); const box = await cat.boundingBox(); const rail = await cat.locator('.rail').evaluate((element: HTMLElement) => getComputedStyle(element).flexDirection);
  const catMain = cat.locator('.main'); const catalogueScroll = await swipeInside(catMain); const cataloguePinch = await pinchInside(catMain);
  const placementPlane = cat.locator('.placement-plane');
  if (await placementPlane.count() !== 1) errors.push('catalogue: virtual placement plane is missing');
  const planeNumber = placementPlane.locator('.plane-number');
  const planeHeight = await planeNumber.evaluate((input: HTMLElement) => input.getBoundingClientRect().height);
  await planeNumber.fill('0.75'); await planeNumber.blur(); await page.waitForTimeout(60);
  if (await planeNumber.inputValue() !== '0.75') errors.push('catalogue: continuous placement Y did not persist on mobile');
  for (const selector of ['.active-tool', '.placement-rotate', '.style-action', '.item-picker']) if (await cat.locator(selector).count()) errors.push(`catalogue: removed control ${selector} is still rendered`);

  await cat.locator('.rail button').filter({ hasText: 'Materials' }).click();
  const studio = game().locator('material-studio'); await studio.waitFor({ state: 'visible' }); const studioBox = await studio.boundingBox();
  const swatch = studio.locator('material-swatch-preview canvas'); await swatch.waitFor({ state: 'visible' }); const swatchBox = await swatch.boundingBox();
  if (await studio.locator('catalogue-object-preview').count()) errors.push('material studio: furniture-specific preview is still rendered');
  const materialPreset = studio.locator('.preset').first(); const materialPresetHeight = await materialPreset.evaluate((button: HTMLElement) => button.getBoundingClientRect().height);
  await studio.locator('.preset').filter({ hasText: 'Fine Linen' }).click();
  const studioMain = studio.locator('.studio'); const studioScroll = await swipeInside(studioMain); const studioPinch = await pinchInside(studioMain);
  await page.screenshot({ path: 'artifacts/mobile-material-studio.png' });
  await studio.locator('.footer .action').filter({ hasText: 'Done' }).click(); await studio.waitFor({ state: 'detached' }); await cat.waitFor({ state: 'visible' });
  await cat.locator('.object-card').first().scrollIntoViewIfNeeded(); await cat.locator('.object-card').first().click();
  if (await cat.locator('.active-tool,.placement-rotate').count()) errors.push('catalogue: placement tutorial or rotate card reappeared after choosing an object');
  await page.screenshot({ path: 'artifacts/mobile-room.png' });

  const bodyScroll = await page.evaluate(() => scrollY);
  if (nav.position !== 'fixed' || nav.height < 44) errors.push('lobby: bottom navigation is not touch-friendly');
  if (!shopCard || !shopPreview || shopCard.height > 125 || shopPreview.height > 92) errors.push('shop: mobile offers are not using the compact inventory-style row layout');
  if (canvasCss.touch !== 'none' || canvasCss.w < 380 || canvasCss.h < 820 || canvasCss.scrollY !== 0) errors.push('room: mobile canvas viewport is invalid');
  if (Math.abs(scale1 - scale0) > 0.01) errors.push('room: double tap changed browser page zoom');
  if (Math.hypot((pan1.x ?? 0) - (pan0.x ?? 0), (pan1.z ?? 0) - (pan0.z ?? 0)) < 0.03) errors.push('room: one-finger camera pan failed');
  if ((zoom1.view ?? 99) >= (zoom0.view ?? 0) - 0.05) errors.push('room: pinch zoom-in failed');
  if ((zoomOut.view ?? 0) < 18) errors.push(`room: portrait zoom-out range is too narrow (${zoomOut.view})`);
  if (morphControls !== 0) errors.push('room: avatar tuning selector should not be user-facing');
  if (healthyStatus !== 0) errors.push('room: healthy connection should not show a Live status pill');
  if (modeHeight < 44 || materialPresetHeight < 44 || planeHeight < 44) errors.push('mobile: a primary touch action is smaller than 44px');
  if (!box || box.width < 385 || rail !== 'row') errors.push('catalogue: mobile bottom-tray layout is invalid');
  if (catalogueScroll.scrollHeight > catalogueScroll.clientHeight + 20 && catalogueScroll.scrollTop < 20) errors.push('catalogue: one-finger touch scrolling is blocked');
  if (Math.abs(cataloguePinch.after - cataloguePinch.before) > 0.01) errors.push('catalogue: two-finger gesture changed browser page zoom');
  if (!studioBox || studioBox.width < 385) errors.push('material studio: mobile workspace is not full-width');
  if (!swatchBox || Math.abs(swatchBox.width - swatchBox.height) > 2) errors.push('material studio: square texture preview is distorted');
  if (studioScroll.scrollHeight > studioScroll.clientHeight + 20 && studioScroll.scrollTop < 20) errors.push('material studio: one-finger scrolling is blocked');
  if (Math.abs(studioPinch.after - studioPinch.before) > 0.01) errors.push('material studio: two-finger gesture changed browser page zoom');
  if (bodyScroll !== 0) errors.push('room: canvas gestures scrolled the document');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ ok: true, user, landingScroll, lobbyScroll, shopCard, shopPreview, nav, canvasCss, target, scale0, scale1, pan0, pan1, zoom0, zoom1, zoomOut, morphControls, healthyStatus, modeHeight, planeHeight, box, rail, catalogueScroll, cataloguePinch, studioBox, swatchBox, materialPresetHeight, studioScroll, studioPinch, bodyScroll, errors }, null, 2));
} finally {
  await browser.close().catch(() => {});
  if (server) { server.kill(); await server.exited.catch(() => {}); for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true }); }
}
