import { existsSync, rmSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
const port=Number(process.env.MOBILE_SMOKE_PORT??4185);
const base=process.env.MOBILE_SMOKE_URL??`http://127.0.0.1:${port}`;
const dbPath=process.env.MOBILE_SMOKE_DB??`/tmp/roomlab-mobile-smoke-${process.pid}.sqlite`;
let server:ReturnType<typeof Bun.spawn>|null=null;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const wait=async(fn:()=>Promise<boolean>|boolean,label:string)=>{const end=Date.now()+10000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,75))}throw new Error('timeout '+label)};
try{
if(!process.env.MOBILE_SMOKE_URL){if(!existsSync('dist/index.html'))throw new Error('Build dist first with bun run build.');for(const suffix of ['','-wal','-shm'])rmSync(dbPath+suffix,{force:true});server=Bun.spawn(['bun','run','server/index.ts'],{cwd:process.cwd(),stdout:'pipe',stderr:'pipe',env:{...process.env,PORT:String(port),ROOMLAB_DB:dbPath,NODE_ENV:'production'}});await wait(async()=>{try{return (await fetch(base+'/api/health')).ok}catch{return false}},'mobile server')}
const game=()=>page.locator('online-room-page habbo-game');const canvas=()=>game().locator('canvas');
const data=()=>canvas().evaluate((c:any)=>({cell:c.dataset.playerCell??'',pose:c.dataset.playerPose??'',camera:c.dataset.cameraState??'',human:c.dataset.humanReady??''}));
const camera=async()=>{const p=(await data()).camera.split(',').map(Number);return {x:p[0],z:p[1],view:p[2]}};
async function touch(points:{x:number,y:number,id:number}[][]){const c=await ctx.newCDPSession(page);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points[0]});for(const p of points.slice(1)){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:p});await new Promise(r=>setTimeout(r,20))}await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}
async function walkTarget(current:string){for(let y=180;y<720;y+=32)for(let x=80;x<370;x+=32){await page.mouse.move(x,y);const h=await canvas().evaluate((c:any)=>({a:c.dataset.hoverAction??'',cell:c.dataset.hoverCell??''}));if(h.a==='walk'&&h.cell&&h.cell!==current)return{x,y,cell:h.cell}}throw new Error('no walk target')}
await page.goto(base+'/',{waitUntil:'networkidle'});
const landing=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.scrollingElement?.scrollWidth??0,sh:document.scrollingElement?.scrollHeight??0,overflow:getComputedStyle(document.body).overflowY,touch:getComputedStyle(document.body).touchAction}));
await touch([[{x:195,y:720,id:1}],[{x:195,y:620,id:1}],[{x:195,y:500,id:1}],[{x:195,y:380,id:1}],[{x:195,y:240,id:1}]]);await page.waitForTimeout(200);const landingScroll=await page.evaluate(()=>scrollY);
if(landing.sh<=landing.h+100||landing.overflow==='hidden'||landing.touch==='none'||landingScroll<100)errors.push('landing: mobile touch scrolling is not available');if(landing.sw>landing.w+1)errors.push(`landing: horizontal overflow ${landing.sw}px > ${landing.w}px`);
await page.screenshot({path:'artifacts/mobile-home.png'});await page.evaluate(()=>scrollTo(0,0));
const user='Mob'+Date.now().toString().slice(-9);await page.locator('landing-page input[name=username]').fill(user);await page.locator('landing-page button.primary').click();await page.locator('rooms-page').waitFor({state:'visible'});
await page.locator('lobby-shell .nav button').filter({hasText:'Shop'}).click();await page.locator('shop-page .offer').first().waitFor({state:'visible'});const nav=await page.locator('lobby-shell .nav').evaluate((n:any)=>({position:getComputedStyle(n).position,bottom:n.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height}));
const lobbyBefore=await page.evaluate(()=>({w:innerWidth,sw:document.scrollingElement?.scrollWidth??0,h:innerHeight,sh:document.scrollingElement?.scrollHeight??0}));await touch([[{x:350,y:700,id:1}],[{x:350,y:590,id:1}],[{x:350,y:470,id:1}],[{x:350,y:350,id:1}],[{x:350,y:220,id:1}]]);await page.waitForTimeout(200);const lobbyScroll=await page.evaluate(()=>scrollY);if(lobbyBefore.sh<=lobbyBefore.h+100||lobbyScroll<100)errors.push('lobby: touch scrolling is not available');if(lobbyBefore.sw>lobbyBefore.w+1)errors.push(`lobby: horizontal overflow ${lobbyBefore.sw}px > ${lobbyBefore.w}px`);await page.screenshot({path:'artifacts/mobile-lobby.png'});
await page.locator('lobby-shell .nav button').filter({hasText:'Rooms'}).click();await page.locator('rooms-page button.primary').filter({hasText:'New room'}).click();await page.locator('rooms-page input[name=name]').fill('Mobile Room');await page.locator('rooms-page form.create button.primary').click();await game().waitFor({state:'visible',timeout:12000});await wait(async()=> (await data()).human==='true','human');
const canvasCss=await canvas().evaluate((c:any)=>({touch:getComputedStyle(c).touchAction,w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height,scrollY}));
const start=await data();const target=await walkTarget(start.cell);await page.touchscreen.tap(target.x,target.y);await wait(async()=>{const d=await data();return d.cell===target.cell&&d.pose==='stand'},'tap walk');
const pan0=await camera();await touch([[{x:260,y:430,id:1}],[{x:280,y:445,id:1}],[{x:305,y:465,id:1}],[{x:325,y:480,id:1}]]);await page.waitForTimeout(180);const pan1=await camera();
const zoom0=await camera();await touch([[{x:205,y:420,id:1},{x:275,y:420,id:2}],[{x:190,y:420,id:1},{x:290,y:420,id:2}],[{x:175,y:420,id:1},{x:305,y:420,id:2}],[{x:160,y:420,id:1},{x:320,y:420,id:2}]]);await page.waitForTimeout(320);const zoom1=await camera();
const mode=game().locator('.mode-btn');const modeHeight=await mode.evaluate((b:any)=>b.getBoundingClientRect().height);await mode.click();const cat=game().locator('catalogue-explorer');await cat.waitFor({state:'visible'});const box=await cat.boundingBox();const rail=await cat.locator('.rail').evaluate((n:any)=>getComputedStyle(n).flexDirection);await cat.locator('.object-card').first().click();const rotate=cat.locator('.placement-rotate');await rotate.waitFor({state:'visible'});const rotateHeight=await rotate.evaluate((b:any)=>b.getBoundingClientRect().height);await rotate.click();await page.screenshot({path:'artifacts/mobile-room.png'});
const bodyScroll=await page.evaluate(()=>scrollY);
if(nav.position!=='fixed'||nav.height<44)errors.push('lobby: bottom navigation is not touch-friendly');
if(canvasCss.touch!=='none'||canvasCss.w<380||canvasCss.h<820||canvasCss.scrollY!==0)errors.push('room: mobile canvas viewport is invalid');
if(Math.hypot((pan1.x??0)-(pan0.x??0),(pan1.z??0)-(pan0.z??0))<0.03)errors.push('room: one-finger camera pan failed');
if((zoom1.view??99)>=(zoom0.view??0)-0.05)errors.push('room: pinch zoom failed');
if(modeHeight<44||rotateHeight<44)errors.push('room: a primary mobile action is smaller than 44px');
if(!box||box.width<385||rail!=='row')errors.push('catalogue: mobile bottom-sheet layout is invalid');
if(bodyScroll!==0)errors.push('room: canvas gestures scrolled the document');
if(errors.length)throw new Error(errors.join('\n'));
console.log(JSON.stringify({ok:true,user,landingScroll,lobbyScroll,nav,canvasCss,target,pan0,pan1,zoom0,zoom1,modeHeight,box,rail,rotateHeight,bodyScroll,errors},null,2));
}finally{await browser.close().catch(()=>{});if(server){server.kill();await server.exited.catch(()=>{});for(const suffix of ['','-wal','-shm'])rmSync(dbPath+suffix,{force:true})}}
