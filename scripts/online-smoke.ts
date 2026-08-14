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

interface Hover { x:number; y:number; action:string; cell:string; kind:string; valid:string; }

async function startServer(): Promise<void> {
  server = Bun.spawn(['bun','run','server/index.ts'], {
    cwd: process.cwd(), stdout:'pipe', stderr:'pipe',
    env: { ...process.env, PORT:String(port), ROOMLAB_DB:dbPath, NODE_ENV:'production' },
  });
  await waitFor(async()=>{try{return (await fetch(`${base}/api/health`)).ok;}catch{return false;}},12_000,'server health');
}
async function restartServer(): Promise<void> {
  server?.kill(); await server?.exited.catch(()=>{}); server=null; await Bun.sleep(250); await startServer();
}
async function waitFor(check:()=>Promise<boolean>|boolean, timeout:number, label:string):Promise<void>{const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await Bun.sleep(75);}throw new Error(`Timed out waiting for ${label}`);}
function watch(page:Page,label:string):void{page.on('pageerror',e=>errors.push(`${label}: page: ${e.message}`));page.on('console',m=>{const text=m.text();if(m.type()==='warning'&&text.includes('Rejected authoritative room snapshot'))console.log(`[online-smoke] ${label} ${text}`);if(m.type()!=='error')return;if(expectedDisconnect&&text.includes('ERR_CONNECTION_REFUSED'))return;errors.push(`${label}: console: ${text}`);});}
async function signup(page:Page,username:string):Promise<void>{await page.goto(`${base}/`,{waitUntil:'domcontentloaded'});await page.locator('landing-page input[name=username]').fill(username);await page.locator('landing-page button.primary').click();await page.locator('rooms-page').waitFor({state:'visible',timeout:8_000});}
const game=(page:Page)=>page.locator('online-room-page habbo-game');
const canvas=(page:Page)=>game(page).locator('canvas');
async function canvasData(page:Page):Promise<Record<string,string>>{return canvas(page).evaluate((element:any)=>({playerCell:element.dataset.playerCell??'',playerPose:element.dataset.playerPose??'',remoteActors:element.dataset.remoteActors??'',remoteActorCells:element.dataset.remoteActorCells??'',remoteActorStates:element.dataset.remoteActorStates??'',topology:element.dataset.topologySignature??'',objects:element.dataset.objectPrototypes??'',objectCells:element.dataset.objectCells??'',customAppearances:element.dataset.customAppearances??'',remoteManipulations:element.dataset.remoteManipulations??'',humanReady:element.dataset.humanReady??'',humanError:element.dataset.humanError??''}));}
async function findHover(page:Page, action:string, accept:(h:Hover)=>boolean=()=>true):Promise<Hover>{
  const points=await game(page).evaluate((element:any)=>{const result:{x:number;y:number}[]=[];for(let z=0;z<8;z+=1)for(let x=0;x<10;x+=1){const point=element.debugScreenPointForCell?.('ground',x,z);if(point)result.push(point);}return result;});
  for(const point of points){await page.mouse.move(point.x,point.y);const d=await canvas(page).evaluate((c:any)=>({action:c.dataset.hoverAction??'',cell:c.dataset.hoverCell??'',kind:c.dataset.hoverObjectKind??'',valid:c.dataset.hoverValid??''}));const h={x:point.x,y:point.y,...d};if(h.action===action&&h.cell&&h.valid!=='false'&&accept(h))return h;}
  throw new Error(`Could not find projected hover target ${action}`);
}
async function moveHeldObjectToValidCell(page:Page, excluded:readonly string[]):Promise<{x:number;y:number;cell:string}>{
  const points=await game(page).evaluate((element:any)=>{const result:{x:number;y:number}[]=[];for(let z=0;z<8;z+=1)for(let x=0;x<10;x+=1){const point=element.debugScreenPointForCell?.('ground',x,z);if(point)result.push(point);}return result;});
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
  const walk=await findHover(alice,'walk',h=>h.cell!==beforeMove.playerCell);
  await alice.mouse.click(walk.x,walk.y);
  await waitFor(async()=>{const d=await canvasData(alice);return d.playerCell===walk.cell&&d.playerPose==='stand';},8_000,'local predicted walk finish');
  await waitFor(async()=> (await canvasData(bob)).remoteActorCells.endsWith(`:${walk.cell}`),8_000,'remote authoritative walk replication');
  const liveState = await canvasData(alice);
  const floorEditPoint = await findHover(alice,'walk',h=>h.cell!==liveState.playerCell&&!liveState.remoteActorCells.endsWith(`:${h.cell}`));
  const chairPlacementPoint = await findHover(alice,'walk',h=>h.cell!==liveState.playerCell&&h.cell!==floorEditPoint.cell&&!liveState.remoteActorCells.endsWith(`:${h.cell}`));

  // Host architecture edits remain live while the visitor stays in Play mode.
  const bobTopology=(await canvasData(bob)).topology;
  await enterEdit(alice);
  const catalogue=game(alice).locator('catalogue-explorer');await catalogue.waitFor({state:'visible'});
  await catalogue.locator('.rail button').filter({hasText:'Floor'}).click();
  await catalogue.locator('.tool-card').filter({hasText:'Raise'}).click();
  await game(alice).locator('.catalogue-open').click();
  await alice.mouse.click(floorEditPoint.x,floorEditPoint.y);
  await waitFor(async()=> (await canvasData(bob)).topology!==bobTopology,8_000,'topology replication');

  phase('inventory placement and seated manipulation');
  // Style one exact owned chair before placement. The appearance belongs to the item instance, not only the room entity.
  await game(alice).locator('.catalogue-open').click(); await catalogue.waitFor({state:'visible'});
  await catalogue.locator('.rail button').filter({hasText:'Objects'}).click();
  const search=catalogue.locator('input[type=search]');await search.fill('Club Chair');
  const chairWrap=catalogue.locator('.object-wrap').first();const chairPicker=chairWrap.locator('.item-picker');
  if(await chairPicker.count()!==1||await chairPicker.locator('option').count()!==2)errors.push('materials: duplicate owned chairs should expose an exact-item selector');
  await chairWrap.locator('.style-action').click();
  const materialStudio=game(alice).locator('material-studio');await materialStudio.waitFor({state:'visible'});
  if(await materialStudio.locator('.slot').count()!==3)errors.push('materials: chair should expose upholstery, cushion, and frame slots');
  await materialStudio.locator('.preset').filter({hasText:'Fine Linen'}).click();
  await alice.screenshot({path:'artifacts/online-material-studio.png',fullPage:true});
  await materialStudio.locator('.apply').click();await materialStudio.waitFor({state:'detached'});
  await alice.mouse.click(chairPlacementPoint.x,chairPlacementPoint.y);
  await waitFor(async()=> (await canvasData(bob)).objects.split(',').includes('chair'),8_000,'inventory chair placement replication');
  await waitFor(async()=> (await canvasData(bob)).customAppearances==='1',8_000,'styled chair appearance replication');
  const inventoryAfterPlace=await api<{items:{id:string;prototypeId:string;state:string;appearance:unknown}[]}>(alice,'/api/inventory');
  const styledChair=inventoryAfterPlace.items.find(i=>i.prototypeId==='chair'&&i.state==='placed'&&i.appearance);
  if(!styledChair)errors.push('inventory: styled placed chair did not persist its appearance');

  // Existing placed furniture can be restyled from the Selected panel without re-placement.
  const styledChairPoint=await game(alice).evaluate((element:any)=>element.debugScreenPointForPrototype?.('chair')) as {x:number;y:number}|null;
  if(!styledChairPoint)throw new Error('materials: styled chair did not produce a projected screen point');
  await alice.mouse.click(styledChairPoint.x,styledChairPoint.y);const selection=game(alice).locator('selection-inspector');await selection.waitFor({state:'visible'});await selection.locator('.style').click();
  const restyleStudio=game(alice).locator('material-studio');await restyleStudio.waitFor({state:'visible'});
  const patternName=restyleStudio.locator('input[aria-label="Pattern name"]');await patternName.fill('Shortcut Guard');await patternName.press('Backspace');await alice.waitForTimeout(80);
  if(!(await canvasData(alice)).objects.split(',').includes('chair'))errors.push('materials: Backspace in a pattern-name input picked up the selected chair');
  await restyleStudio.locator('.slot').filter({hasText:'Cushion'}).click();await restyleStudio.locator('.preset').filter({hasText:'Navy Pinstripe'}).click();await restyleStudio.locator('.apply').click();
  await waitFor(async()=>{const response=await api<{items:{id:string;appearance:any}[]}>(alice,'/api/inventory');const item=response.items.find(entry=>entry.id===styledChair?.id);return Boolean(item?.appearance?.materials?.upholstery&&item?.appearance?.materials?.cushion);},8_000,'placed item restyle persistence');

  // Build rights do not grant permission to mutate another player's persistent collectible appearance.
  const authoritativeStyle=(await api<{items:{id:string;appearance:any}[]}>(alice,'/api/inventory')).items.find(item=>item.id===styledChair?.id)?.appearance;
  const temporaryEditor=await api<{editor:{userId:string}}>(alice,`/api/rooms/${roomId}/editors`,{method:'POST',body:{username:bobName}});
  await waitFor(async()=>await game(bob).locator('.mode-btn').count()===1,5_000,'temporary editor rights for material ownership test');
  await enterEdit(bob);if(await game(bob).locator('catalogue-explorer').count())await game(bob).locator('.catalogue-open').click();
  const bobChairPoint=await game(bob).evaluate((element:any)=>element.debugScreenPointForPrototype?.('chair')) as {x:number;y:number}|null;
  if(!bobChairPoint)throw new Error('materials: rights user could not target styled chair');
  await bob.mouse.click(bobChairPoint.x,bobChairPoint.y);const bobSelection=game(bob).locator('selection-inspector');await bobSelection.waitFor({state:'visible'});await bobSelection.locator('.style').click();
  const bobStudio=game(bob).locator('material-studio');await bobStudio.waitFor({state:'visible'});await bobStudio.locator('.preset').filter({hasText:'Pixel Dots'}).click();await bobStudio.locator('.apply').click();
  await waitFor(async()=>((await game(bob).locator('.toast').textContent())??'').includes('Only the item owner'),5_000,'unauthorized permanent restyle rejection');
  const styleAfterAttack=(await api<{items:{id:string;appearance:any}[]}>(alice,'/api/inventory')).items.find(item=>item.id===styledChair?.id)?.appearance;
  if(JSON.stringify(styleAfterAttack)!==JSON.stringify(authoritativeStyle))errors.push('materials: delegated editor changed another player owned-item appearance');
  await leaveEdit(bob);await api(alice,`/api/rooms/${roomId}/editors/${temporaryEditor.editor.userId}`,{method:'DELETE'});await waitFor(async()=>await game(bob).locator('.mode-btn').count()===0,5_000,'temporary material-test rights revoke');

  // Both cameras are still at the same default view. Find the visible chair in Play mode.
  await leaveEdit(alice);
  const chairOnAlice=await findHover(alice,'sit',h=>h.kind==='chair');
  const chairOnBob=await findHover(bob,'sit',h=>h.kind==='chair');
  await bob.mouse.click(chairOnBob.x,chairOnBob.y);
  await waitFor(async()=> (await canvasData(bob)).playerPose==='sit',8_000,'Bob sitting');
  await waitFor(async()=> (await canvasData(alice)).remoteActorStates.includes(':sit:'),8_000,'Bob authoritative seat acceptance');
  const seatedCell=(await canvasData(bob)).playerCell;
  // Close the Catalogue while editing so it cannot obscure the drag. Bob must ride the streamed chair pose.
  await enterEdit(alice);await game(alice).locator('.catalogue-open').click();
  const dragStart=await game(alice).evaluate((element:any)=>element.debugScreenPointForPrototype?.('chair')) as {x:number;y:number}|null;
  if(!dragStart)throw new Error('seating: chair did not expose an edit-mode drag point');
  await alice.mouse.move(dragStart.x,dragStart.y);await alice.mouse.down();
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

  // Once the occupant leaves the seat, pickup succeeds and the same owned item keeps its material recipe.
  const bobAfterDrag=await canvasData(bob);const leaveSeat=await findHover(bob,'walk',h=>h.cell!==bobAfterDrag.playerCell);
  await bob.mouse.click(leaveSeat.x,leaveSeat.y);await waitFor(async()=>{const d=await canvasData(bob);return d.playerPose==='stand'&&d.playerCell===leaveSeat.cell;},8_000,'Bob leaves styled chair');
  await game(alice).locator('.selection-panel .danger').click();
  await waitFor(async()=>!(await canvasData(bob)).objects.split(',').includes('chair'),8_000,'styled chair pickup replication');
  const inventoryAfterPickup=await api<{items:{id:string;prototypeId:string;state:string;appearance:unknown}[]}>(alice,'/api/inventory');
  if(!styledChair||!inventoryAfterPickup.items.some(item=>item.id===styledChair.id&&item.state==='inventory'&&item.appearance))errors.push('inventory: styled chair lost its appearance after pickup');

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

  // Alice lists the styled chair; Bob buys that exact item instance and receives its recipe.
  await alice.locator('lobby-shell .nav button').filter({hasText:'My Items'}).click();const items=alice.locator('inventory-page');await items.waitFor({state:'visible'});
  const styledCard=items.locator('.item').filter({hasText:'Styled'}).first();await styledCard.waitFor({state:'visible'});await styledCard.locator('button').filter({hasText:'List for trade'}).click();
  let styledListing:any=null;await waitFor(async()=>{const response=await api<{listings:any[]}>(alice,'/api/market/listings');styledListing=response.listings.find(l=>l.sellerUsername===aliceName&&l.appearance);return Boolean(styledListing);},5_000,'styled market listing');
  await bob.locator('lobby-shell .nav button').filter({hasText:'Shop'}).click();const bobShop=bob.locator('shop-page');await bobShop.waitFor({state:'visible'});await bobShop.locator('.tab').filter({hasText:'Marketplace'}).click();
  const marketCard=bobShop.locator('.offer').filter({hasText:aliceName}).first();await marketCard.waitFor({state:'visible',timeout:5_000});await marketCard.locator('button.primary').click();
  await waitFor(async()=> !(await api<{listings:any[]}>(bob,'/api/market/listings')).listings.some(l=>l.sellerUsername===aliceName),5_000,'market transfer close');
  const bobInventory=await api<{items:{id:string;appearance:unknown}[]}>(bob,'/api/inventory');
  if(!styledListing||!bobInventory.items.some(item=>item.id===styledListing.itemId&&item.appearance))errors.push('market: styled item lost its appearance during transfer');

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
  if(!process.env.ONLINE_SMOKE_URL){expectedDisconnect=true;try{await restartServer();await waitFor(async()=> (await connectionStatus())!=='connected',8_000,'restart disconnect observed');await waitFor(async()=> (await connectionStatus())==='connected',20_000,'post-restart reconnect');await game(alice).waitFor({state:'visible'});}finally{expectedDisconnect=false;}if(oldGame===game(alice)){/* locator identity is not meaningful; keyed DOM replacement is covered by fresh hello. */}}
  const persisted=await api<{rooms:{name:string}[]}>(alice,'/api/rooms?scope=mine');if(!persisted.rooms.some(r=>r.name===`Open Beta ${suffix}`))errors.push('persistence: room missing after restart');

  const finalAlice=await canvasData(alice);
  if(finalAlice.humanReady!=='true')errors.push(`avatar: ${finalAlice.humanError||finalAlice.humanReady}`);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ok:true,users:[aliceName,bobName],roomPath,screenshots:['artifacts/online-lobby.png','artifacts/online-material-studio.png','artifacts/online-multiplayer-room.png','artifacts/online-shop.png','artifacts/online-friends.png']},null,2));
} finally {
  await browser?.close().catch(()=>{});
  if(!process.env.ONLINE_SMOKE_URL){server?.kill();await server?.exited.catch(()=>{});rmSync(dbPath,{force:true});rmSync(`${dbPath}-wal`,{force:true});rmSync(`${dbPath}-shm`,{force:true});}
}
