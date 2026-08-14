import { existsSync, rmSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';

const port = Number(process.env.ONLINE_SMOKE_PORT ?? 4182);
const base = process.env.ONLINE_SMOKE_URL ?? `http://127.0.0.1:${port}`;
const chromiumPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const dbPath = process.env.ONLINE_SMOKE_DB ?? `/tmp/roomlab-online-smoke-${process.pid}.sqlite`;
const errors: string[] = [];
let server: ReturnType<typeof Bun.spawn> | null = null;
let browser: Browser | null = null;
let expectedDisconnect = false;
interface PageCounters { readonly sent:Map<string,number>; readonly received:Map<string,number>; inventoryGets:number; }
const counters = new WeakMap<Page, PageCounters>();

interface Hover { x:number; y:number; action:string; cell:string; kind:string; valid:string; }

async function startServer(): Promise<void> {
  server = Bun.spawn(['bun','run','server/index.ts'], {
    cwd: process.cwd(), stdout:'pipe', stderr:'pipe',
    env: { ...process.env, PORT:String(port), ROOMLAB_DB:dbPath, NODE_ENV:'production' },
  });
  await waitFor(async()=>{try{return (await fetch(`${base}/api/health`)).ok;}catch{return false;}},12_000,'server health');
}
async function stopServer(): Promise<void> {
  server?.kill(); await server?.exited.catch(()=>{}); server=null;
  await waitFor(async()=>{try{return !(await fetch(`${base}/api/health`)).ok;}catch{return true;}},5_000,'server shutdown');
}
async function waitFor(check:()=>Promise<boolean>|boolean, timeout:number, label:string):Promise<void>{const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await Bun.sleep(75);}throw new Error(`Timed out waiting for ${label}`);}
function watch(page:Page,label:string):void{
  const pageCounters:PageCounters={sent:new Map(),received:new Map(),inventoryGets:0};counters.set(page,pageCounters);
  page.on('request',request=>{try{if(request.method()==='GET'&&new URL(request.url()).pathname==='/api/inventory')pageCounters.inventoryGets+=1;}catch{/* ignore malformed URLs */}});
  page.on('websocket',socket=>{
    socket.on('framesent',event=>countFrame(pageCounters.sent,event.payload));
    socket.on('framereceived',event=>countFrame(pageCounters.received,event.payload));
  });
  page.on('pageerror',e=>errors.push(`${label}: page: ${e.message}`));page.on('console',m=>{const text=m.text();if(m.type()==='warning'&&text.includes('Rejected authoritative room snapshot'))console.log(`[online-smoke] ${label} ${text}`);if(m.type()!=='error')return;if(expectedDisconnect&&text.includes('ERR_CONNECTION_REFUSED'))return;errors.push(`${label}: console: ${text}`);});
}
function countFrame(map:Map<string,number>,payload:string|Buffer):void{try{const type=JSON.parse(typeof payload==='string'?payload:payload.toString()).type;if(typeof type==='string')map.set(type,(map.get(type)??0)+1);}catch{/* ignore non-room frames */}}
const sentCount=(page:Page,type:string):number=>counters.get(page)?.sent.get(type)??0;
const receivedCount=(page:Page,type:string):number=>counters.get(page)?.received.get(type)??0;
const inventoryGetCount=(page:Page):number=>counters.get(page)?.inventoryGets??0;
function parseCell(value:string):{x:number;z:number}|null{const[x,z]=value.split(',').map(Number);return Number.isFinite(x)&&Number.isFinite(z)?{x:x!,z:z!}:null;}
async function signup(page:Page,username:string):Promise<void>{await page.goto(`${base}/`,{waitUntil:'domcontentloaded'});await page.locator('landing-page input[name=username]').fill(username);await page.locator('landing-page button.primary').click();await page.locator('rooms-page').waitFor({state:'visible',timeout:8_000});}
const game=(page:Page)=>page.locator('online-room-page habbo-game');
const canvas=(page:Page)=>game(page).locator('canvas[aria-label="Playable and editable isometric hotel room"]');
async function canvasData(page:Page):Promise<Record<string,string>>{return canvas(page).evaluate((element:any)=>({playerCell:element.dataset.playerCell??'',playerPose:element.dataset.playerPose??'',remoteActors:element.dataset.remoteActors??'',remoteActorCells:element.dataset.remoteActorCells??'',remoteActorStates:element.dataset.remoteActorStates??'',topology:element.dataset.topologySignature??'',objects:element.dataset.objectPrototypes??'',objectCells:element.dataset.objectCells??'',customAppearances:element.dataset.customAppearances??'',remoteManipulations:element.dataset.remoteManipulations??'',humanReady:element.dataset.humanReady??'',humanError:element.dataset.humanError??'',lastChat:element.dataset.lastChat??'',chatBubbles:element.dataset.chatBubbles??'0'}));}
async function findHover(page:Page, action:string, accept:(h:Hover)=>boolean=()=>true):Promise<Hover>{
  const points=await game(page).evaluate((element:any)=>{const result:{x:number;y:number}[]=[];for(let z=0;z<8;z+=1)for(let x=0;x<10;x+=1){const point=element.debugScreenPointForCell?.(0,x,z);if(point)result.push(point);}return result;});
  for(const point of points){await page.mouse.move(point.x,point.y);const d=await canvas(page).evaluate((c:any)=>({action:c.dataset.hoverAction??'',cell:c.dataset.hoverCell??'',kind:c.dataset.hoverObjectKind??'',valid:c.dataset.hoverValid??''}));const h={x:point.x,y:point.y,...d};if(h.action===action&&h.cell&&h.valid!=='false'&&accept(h))return h;}
  throw new Error(`Could not find projected hover target ${action}`);
}
async function moveHeldObjectToValidCell(page:Page, excluded:readonly string[]):Promise<{x:number;y:number;cell:string}>{
  const points=await game(page).evaluate((element:any)=>{const result:{x:number;y:number}[]=[];for(let z=0;z<8;z+=1)for(let x=0;x<10;x+=1){const point=element.debugScreenPointForCell?.(0,x,z);if(point)result.push(point);}return result;});
  for(const point of points){await page.mouse.move(point.x,point.y,{steps:2});const state=await canvas(page).evaluate((c:any)=>({valid:c.dataset.dragValid??'',cell:c.dataset.dragCandidate??''}));if(state.valid==='true'&&state.cell&&!excluded.includes(state.cell))return{x:point.x,y:point.y,cell:state.cell};}
  throw new Error('Could not find a valid held-object destination.');
}
async function api<T>(page:Page,path:string,options:{method?:string;body?:unknown}={}):Promise<T>{return page.evaluate(async({path,options})=>{const init:RequestInit={method:options.method??'GET'};if(options.body!==undefined){init.headers={'content-type':'application/json'};init.body=JSON.stringify(options.body);}const r=await fetch(path,init);const data=await r.json();if(!r.ok)throw new Error(data.error??`HTTP ${r.status}`);return data;},{path,options}) as Promise<T>;}
async function createRoom(page:Page,name:string):Promise<string>{
  await page.locator('rooms-page button.primary').filter({hasText:'New room'}).click();
  await page.locator('rooms-page input[name=name]').fill(name);
  await page.locator('rooms-page form.create button.primary').click();
  try { await game(page).waitFor({state:'visible',timeout:10_000}); }
  catch (error) {
    const roomsText=await page.locator('rooms-page').textContent().catch(()=>null);
    const roomText=await page.locator('online-room-page').textContent().catch(()=>null);
    throw new Error(`Room creation did not enter game. url=${page.url()} rooms=${JSON.stringify(roomsText?.slice(0,240)??'')} online=${JSON.stringify(roomText?.slice(0,240)??'')} cause=${error instanceof Error?error.message:String(error)}`);
  }
  return new URL(page.url()).pathname;
}
async function waitRemoteCount(page:Page,count:number):Promise<void>{await waitFor(async()=>Number((await canvasData(page)).remoteActors)===count,8_000,`remote actor count ${count}`);}
async function enterEdit(page:Page):Promise<void>{const button=game(page).locator('.mode-btn');if((await button.textContent())?.includes('Edit room'))await button.click();}
async function leaveEdit(page:Page):Promise<void>{const button=game(page).locator('.mode-btn');if((await button.textContent())?.includes('Done'))await button.click();}
const phase=(name:string):void=>console.log(`[online-smoke] ${name}`);

try {
  if (!existsSync('dist/index.html')) throw new Error('Build dist first with bun run build.');
  if (!process.env.ONLINE_SMOKE_URL) { rmSync(dbPath,{force:true}); rmSync(`${dbPath}-wal`,{force:true}); rmSync(`${dbPath}-shm`,{force:true}); await startServer(); }
  browser=await chromium.launch({headless:true,executablePath:chromiumPath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const suffix=Date.now().toString().slice(-7), aliceName=`Alice${suffix}`, bobName=`Bob${suffix}`;
  const aliceContext=await browser.newContext({viewport:{width:1440,height:900}}), bobContext=await browser.newContext({viewport:{width:1440,height:900}});
  const alice=await aliceContext.newPage(), bob=await bobContext.newPage();watch(alice,'alice');watch(bob,'bob');

  phase('accounts and room join');
  await signup(alice,aliceName);
  await alice.screenshot({path:'artifacts/online-lobby.png',fullPage:true});
  const roomPath=await createRoom(alice,`Open Beta ${suffix}`);
  const roomId=roomPath.split('/').filter(Boolean).at(-1)!;
  await waitFor(async()=> (await canvasData(alice)).humanReady==='true',8_000,'Alice avatar');

  await signup(bob,bobName);
  await bob.goto(`${base}${roomPath}`,{waitUntil:'domcontentloaded'});
  await game(bob).waitFor({state:'visible',timeout:10_000});
  await waitFor(async()=> (await canvasData(bob)).humanReady==='true',8_000,'Bob avatar');
  await Promise.all([waitRemoteCount(alice,1),waitRemoteCount(bob,1)]);
  if(!(await game(alice).locator('.room-meta').textContent())?.includes('2 here'))errors.push('presence: Alice did not show 2 here');
  const inventoryGetsAfterJoin=inventoryGetCount(alice);

  phase('chat replication');
  const chatText=`hello ${suffix}`;
  const bobChatFrames=sentCount(bob,'chat');
  const bobChat=game(bob).locator('input[name=chat]');
  await bobChat.fill(chatText);await bobChat.press('Enter');
  await waitFor(()=>sentCount(bob,'chat')===bobChatFrames+1,3_000,'single outbound chat command');
  await waitFor(async()=> (await canvasData(alice)).lastChat.endsWith(`:${chatText}`),3_000,'remote chat text');
  await waitFor(async()=> Number((await canvasData(alice)).chatBubbles)>0,3_000,'remote chat bubble visible');
  await waitFor(async()=> Number((await canvasData(alice)).chatBubbles)===0,5_500,'remote chat bubble fade');

  phase('delegated build rights');
  // Owner-managed build rights update a connected visitor immediately and authorize a real edit.
  const settingsButton=alice.locator('online-room-page .settings');await settingsButton.click();
  let settings=alice.locator('room-settings-panel');await settings.waitFor({state:'visible'});
  await settings.locator('input[aria-label="Editor username"]').fill(bobName);
  await settings.locator('button.secondary').filter({hasText:'Grant build rights'}).click();
  await waitFor(async()=>await game(bob).locator('.mode-btn').count()===1,5_000,'live editor rights grant');
  const editorsAfterGrant=await api<{editors:{username:string}[]}>(alice,`/api/rooms/${roomId}/editors`);
  if(!editorsAfterGrant.editors.some(editor=>editor.username===bobName))errors.push('rights: granted editor was not persisted');
  await settings.locator('.close').click();
  const rightsBefore=(await canvasData(alice)).topology;
  const bobLive=await canvasData(bob);
  const rightsPoint=await findHover(bob,'walk',h=>h.cell!==bobLive.playerCell&&!bobLive.remoteActorCells.endsWith(`:${h.cell}`));
  await enterEdit(bob);
  const bobCatalogue=game(bob).locator('catalogue-explorer');await bobCatalogue.waitFor({state:'visible'});
  await bobCatalogue.locator('.rail button').filter({hasText:'Floor'}).click();
  await bobCatalogue.locator('.tool-card').filter({hasText:'Raise'}).click();
  await game(bob).locator('.catalogue-open').click();
  await bob.mouse.click(rightsPoint.x,rightsPoint.y);
  await waitFor(async()=> (await canvasData(alice)).topology!==rightsBefore,8_000,'delegated editor topology replication');
  await leaveEdit(bob);
  await settingsButton.click();settings=alice.locator('room-settings-panel');await settings.waitFor({state:'visible'});
  await settings.locator('.editor').filter({hasText:bobName}).locator('button.danger').click();
  await waitFor(async()=>await game(bob).locator('.mode-btn').count()===0,5_000,'live editor rights revoke');
  await settings.locator('.close').click();

  phase('movement and topology replication');
  // Client-predicted movement must settle at the same authoritative cell on the other browser.
  const beforeMove=await canvasData(alice);
  const startCell=parseCell(beforeMove.playerCell);
  const bobActorFramesBefore=receivedCount(bob,'actor');
  const walk=await findHover(alice,'walk',h=>{const next=parseCell(h.cell);return h.cell!==beforeMove.playerCell&&Boolean(!startCell||!next||Math.abs(next.x-startCell.x)+Math.abs(next.z-startCell.z)>=2);});
  await alice.mouse.click(walk.x,walk.y);
  await waitFor(async()=>{const d=await canvasData(alice);return d.playerCell===walk.cell&&d.playerPose==='stand';},8_000,'local predicted walk finish');
  await waitFor(async()=> (await canvasData(bob)).remoteActorCells.endsWith(`:${walk.cell}`),8_000,'remote authoritative walk replication');
  if(receivedCount(bob,'actor')-bobActorFramesBefore<2)errors.push('movement: remote actor received fewer than two streamed actor poses during a multi-cell walk');
  const liveState = await canvasData(alice);
  const floorEditPoint = await findHover(alice,'walk',h=>h.cell!==liveState.playerCell&&!liveState.remoteActorCells.endsWith(`:${h.cell}`));
  const bobStandingCell=(await canvasData(bob)).playerCell;
  const bobStandingPoint=parseCell(bobStandingCell);
  if(!bobStandingPoint)throw new Error(`Could not parse Bob's standing cell ${bobStandingCell}.`);
  const chairPlacementPoint=await game(alice).evaluate((element:any,cell)=>element.debugScreenPointForCell?.(0,cell.x,cell.z),bobStandingPoint) as {x:number;y:number}|null;
  if(!chairPlacementPoint)throw new Error(`Could not project Bob's standing cell ${bobStandingCell} for chair placement.`);

  // Host architecture edits remain live while the visitor stays in Play mode.
  const bobTopology=(await canvasData(bob)).topology;
  await enterEdit(alice);
  const catalogue=game(alice).locator('catalogue-explorer');await catalogue.waitFor({state:'visible'});
  await catalogue.locator('.rail button').filter({hasText:'Floor'}).click();
  await catalogue.locator('.tool-card').filter({hasText:'Raise'}).click();
  await game(alice).locator('.catalogue-open').click();
  await alice.mouse.click(floorEditPoint.x,floorEditPoint.y);
  await waitFor(async()=> (await canvasData(bob)).topology!==bobTopology,8_000,'topology replication');
  if(inventoryGetCount(alice)!==inventoryGetsAfterJoin)errors.push('inventory: unrelated room broadcasts caused a redundant GET /api/inventory');

  phase('inventory placement and seated manipulation');
  // Furniture placement stays direct: no per-card style action, variant selector, or tutorial card.
  await game(alice).locator('.catalogue-open').click(); await catalogue.waitFor({state:'visible'});
  await catalogue.locator('.rail button').filter({hasText:'Objects'}).click();
  const search=catalogue.locator('input[type=search]');await search.fill('Club Chair');
  const chairWrap=catalogue.locator('.object-wrap').first();
  if(await chairWrap.locator('.item-picker,.style-action').count())errors.push('catalogue: furniture card exposes removed style controls');
  await chairWrap.locator('.object-card').click();
  if(await catalogue.locator('.active-tool,.placement-rotate').count())errors.push('catalogue: placement tutorial controls are still rendered');
  await alice.mouse.click(chairPlacementPoint.x,chairPlacementPoint.y);
  await waitFor(async()=> (await canvasData(bob)).objects.split(',').includes('chair'),8_000,'inventory chair placement replication');
  await waitFor(async()=> (await canvasData(bob)).playerPose==='sit',8_000,'standing actor auto-seated by chair placement');
  await waitFor(async()=> (await canvasData(alice)).remoteActorStates.includes(':sit:'),8_000,'auto-seat authoritative replication');
  const inventoryAfterPlace=await api<{items:{id:string;prototypeId:string;state:string;appearance:unknown}[]}>(alice,'/api/inventory');
  const placedChair=inventoryAfterPlace.items.find(i=>i.prototypeId==='chair'&&i.state==='placed');
  if(!placedChair)errors.push('inventory: placed chair did not persist as an exact owned item');

  // Material authoring is standalone and keyboard input must not leak room shortcuts.
  await catalogue.locator('.rail button').filter({hasText:'Materials'}).click();
  const materialStudio=game(alice).locator('material-studio');await materialStudio.waitFor({state:'visible'});
  if(await materialStudio.locator('catalogue-object-preview').count())errors.push('materials: standalone studio rendered furniture-specific preview');
  if(await alice.locator('online-room-page .back').isVisible())errors.push('materials: online room chrome remains visible above the full-screen studio');
  const patternName=materialStudio.locator('input[aria-label="Pattern name"]');await patternName.fill('Shortcut Guard');await patternName.press('Backspace');await alice.waitForTimeout(80);
  if(!(await canvasData(alice)).objects.split(',').includes('chair'))errors.push('materials: Backspace in a pattern-name input picked up the placed chair');
  await alice.screenshot({path:'artifacts/online-material-studio.png',fullPage:true});
  await materialStudio.locator('.footer .action').filter({hasText:'Done'}).click();await materialStudio.waitFor({state:'detached'});

  // Bob was seated organically when the chair settled under his standing cell.
  await leaveEdit(alice);
  const chairOnAlice=await findHover(alice,'sit',h=>h.kind==='chair');
  const chairOnBob=await findHover(bob,'sit',h=>h.kind==='chair');
  const sitFramesBeforeRepeat=sentCount(bob,'sit');
  await bob.mouse.click(chairOnBob.x,chairOnBob.y);await bob.waitForTimeout(250);
  if(sentCount(bob,'sit')!==sitFramesBeforeRepeat)errors.push('seating: clicking the same chair while already seated sent a redundant sit command');
  const seatedCell=(await canvasData(bob)).playerCell;
  // Close the Catalogue while editing so it cannot obscure the drag. Bob must ride the streamed chair pose.
  await enterEdit(alice);await game(alice).locator('.catalogue-open').click();
  const dragStart=await game(alice).evaluate((element:any)=>element.debugScreenPointForPrototype?.('chair')) as {x:number;y:number}|null;
  if(!dragStart)throw new Error('seating: chair did not expose an edit-mode drag point');
  const manipulationBeginsBefore=sentCount(alice,'manipulation-begin');
  await alice.mouse.move(dragStart.x,dragStart.y);await alice.mouse.down();
  await waitFor(()=>sentCount(alice,'manipulation-begin')===manipulationBeginsBefore+1,2_000,'manipulation begin on pointer down');
  const poseFramesBeforeJitter=sentCount(alice,'manipulation-pose');
  await alice.mouse.move(dragStart.x+1,dragStart.y+1,{steps:3});await alice.waitForTimeout(150);
  if(sentCount(alice,'manipulation-pose')!==poseFramesBeforeJitter)errors.push('manipulation: same-cell pointer jitter sent redundant manipulation-pose commands');
  const dragDestination=await moveHeldObjectToValidCell(alice,[chairOnAlice.cell,seatedCell]);
  await waitFor(async()=> (await canvasData(bob)).remoteManipulations==='1',5_000,'remote manipulation lease begin');
  if((await canvasData(bob)).playerPose!=='sit')errors.push('seating: visitor stood while chair was live-dragged');
  await alice.mouse.move(dragDestination.x,dragDestination.y,{steps:3});await alice.mouse.up();
  await waitFor(async()=> (await canvasData(bob)).remoteManipulations==='0',5_000,'manipulation commit');
  await waitFor(async()=>{const d=await canvasData(bob);return d.playerPose==='sit'&&d.playerCell===dragDestination.cell;},8_000,'seated actor authority following committed chair');

  // Picking up a seat while somebody references it is rejected locally and authoritatively.
  const selectedTitle=game(alice).locator('.selection-panel .title');
  if(!(await selectedTitle.textContent())?.includes('Club Chair'))errors.push('selection: dragged chair was not selected');
  await game(alice).locator('.selection-panel .danger').click();await alice.waitForTimeout(250);
  if(!(await canvasData(bob)).objects.split(',').includes('chair'))errors.push('seating: chair disappeared while occupied');
  if((await canvasData(bob)).playerPose!=='sit')errors.push('seating: occupant detached after rejected pickup');
  await alice.screenshot({path:'artifacts/online-multiplayer-room.png',fullPage:true});

  // Once the occupant leaves the seat, pickup succeeds and the exact owned item returns to inventory.
  const bobAfterDrag=await canvasData(bob);const leaveSeat=await findHover(bob,'walk',h=>h.cell!==bobAfterDrag.playerCell);
  await bob.mouse.click(leaveSeat.x,leaveSeat.y);await waitFor(async()=>{const d=await canvasData(bob);return d.playerPose==='stand'&&d.playerCell===leaveSeat.cell;},8_000,'Bob leaves chair');
  await game(alice).locator('.selection-panel .danger').click();
  await waitFor(async()=>!(await canvasData(bob)).objects.split(',').includes('chair'),8_000,'chair pickup replication');
  const inventoryAfterPickup=await api<{items:{id:string;prototypeId:string;state:string;appearance:unknown}[]}>(alice,'/api/inventory');
  if(!placedChair||!inventoryAfterPickup.items.some(item=>item.id===placedChair.id&&item.state==='inventory'))errors.push('inventory: picked-up chair did not return as the same owned item');

  // Leaving a room removes the actor and presence without reloading the visitor.
  await alice.locator('online-room-page .back').click();await alice.locator('rooms-page').waitFor({state:'visible'});
  await waitRemoteCount(bob,0);
  await waitFor(async()=> (await game(bob).locator('.room-meta').textContent())?.includes('1 here')??false,5_000,'presence after leaving');
  await bob.locator('online-room-page .back').click();await bob.locator('rooms-page').waitFor({state:'visible'});

  phase('shop and marketplace');
  // Official store purchase updates wallet and mints a new owned item instance.
  await alice.locator('lobby-shell .nav button').filter({hasText:'Shop'}).click();const shop=alice.locator('shop-page');await shop.waitFor({state:'visible'});
  const balanceBefore=(await api<{account:{balance:number}}>(alice,'/api/session')).account.balance;
  const firstOffer=shop.locator('.offer').first();await firstOffer.locator('button.primary').click();
  await waitFor(async()=> (await api<{account:{balance:number}}>(alice,'/api/session')).account.balance<balanceBefore,5_000,'official purchase debit');
  await alice.screenshot({path:'artifacts/online-shop.png',fullPage:true});

  // Alice lists a chair; Bob buys that exact item instance.
  await alice.locator('lobby-shell .nav button').filter({hasText:'My Items'}).click();const items=alice.locator('inventory-page');await items.waitFor({state:'visible'});
  const chairCard=items.locator('.item').filter({hasText:'Club Chair'}).first();await chairCard.waitFor({state:'visible'});await chairCard.locator('button').filter({hasText:'List for trade'}).click();
  let chairListing:any=null;await waitFor(async()=>{const response=await api<{listings:any[]}>(alice,'/api/market/listings');chairListing=response.listings.find(l=>l.sellerUsername===aliceName&&l.prototypeId==='chair');return Boolean(chairListing);},5_000,'chair market listing');
  await bob.locator('lobby-shell .nav button').filter({hasText:'Shop'}).click();const bobShop=bob.locator('shop-page');await bobShop.waitFor({state:'visible'});await bobShop.locator('.tab').filter({hasText:'Marketplace'}).click();
  const marketCard=bobShop.locator('.offer').filter({hasText:aliceName}).first();await marketCard.waitFor({state:'visible',timeout:5_000});await marketCard.locator('button.primary').click();
  await waitFor(async()=> !(await api<{listings:any[]}>(bob,'/api/market/listings')).listings.some(l=>l.sellerUsername===aliceName),5_000,'market transfer close');
  const bobInventory=await api<{items:{id:string;appearance:unknown}[]}>(bob,'/api/inventory');
  if(!chairListing||!bobInventory.items.some(item=>item.id===chairListing.itemId))errors.push('market: exact listed chair was not transferred');

  phase('friends');
  // Username-based friends: request, accept, then both sides become accepted.
  await alice.locator('lobby-shell .nav button').filter({hasText:'Friends'}).click();const aliceFriends=alice.locator('friends-page');await aliceFriends.waitFor({state:'visible'});await aliceFriends.locator('input[name=username]').fill(bobName);await aliceFriends.locator('button.primary').filter({hasText:'Add friend'}).click();
  await bob.locator('lobby-shell .nav button').filter({hasText:'Friends'}).click();const bobFriends=bob.locator('friends-page');await bobFriends.waitFor({state:'visible'});
  await waitFor(async()=>await bobFriends.locator('.friend').filter({hasText:aliceName}).count()>0,7_000,'incoming friend request');await bobFriends.locator('.friend').filter({hasText:aliceName}).locator('button.primary').click();
  await waitFor(async()=>{const f=await api<{friends:{username:string;status:string}[]}>(alice,'/api/friends');return f.friends.some(x=>x.username===bobName&&x.status==='accepted');},5_000,'accepted friendship');
  await alice.screenshot({path:'artifacts/online-friends.png',fullPage:true});

  phase('restart and reconnect');
  // Persistent rooms and session credentials survive a server restart; the client reconnects with a fresh room-session id.
  await alice.locator('lobby-shell .nav button').filter({hasText:'Rooms'}).click();await alice.locator('rooms-page').waitFor({state:'visible'});
  const oldRoomCard=alice.locator('rooms-page .room-card').filter({hasText:`Open Beta ${suffix}`}).first();await oldRoomCard.locator('button.join').click();await game(alice).waitFor({state:'visible'});
  const oldGame=game(alice);const connectionStatus=()=>alice.locator('online-room-page').getAttribute('data-connection-status');await waitFor(async()=> (await connectionStatus())==='connected',5_000,'pre-restart connected status');
  if(!process.env.ONLINE_SMOKE_URL){expectedDisconnect=true;try{await stopServer();await waitFor(async()=> (await connectionStatus())!=='connected',8_000,'restart disconnect observed');await startServer();await waitFor(async()=> (await connectionStatus())==='connected',20_000,'post-restart reconnect');await game(alice).waitFor({state:'visible'});}finally{expectedDisconnect=false;}if(oldGame===game(alice)){/* locator identity is not meaningful; keyed DOM replacement is covered by fresh hello. */}}
  const persisted=await api<{rooms:{name:string}[]}>(alice,'/api/rooms?scope=mine');if(!persisted.rooms.some(r=>r.name===`Open Beta ${suffix}`))errors.push('persistence: room missing after restart');

  const finalAlice=await canvasData(alice);
  if(finalAlice.humanReady!=='true')errors.push(`avatar: ${finalAlice.humanError||finalAlice.humanReady}`);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ok:true,users:[aliceName,bobName],roomPath,screenshots:['artifacts/online-lobby.png','artifacts/online-material-studio.png','artifacts/online-multiplayer-room.png','artifacts/online-shop.png','artifacts/online-friends.png']},null,2));
} finally {
  await browser?.close().catch(()=>{});
  if(!process.env.ONLINE_SMOKE_URL){server?.kill();await server?.exited.catch(()=>{});rmSync(dbPath,{force:true});rmSync(`${dbPath}-wal`,{force:true});rmSync(`${dbPath}-shm`,{force:true});}
}
