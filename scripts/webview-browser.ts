type Listener = (...args: any[]) => void;
type Step = { kind:'query'; selector:string } | { kind:'filter'; text:string } | { kind:'first' };

export type ConsoleMessage = { type(): string; text(): string };

const queryRuntime = String.raw`
const splitTop=(source, delimiter)=>{const out=[];let start=0,quote='',square=0,round=0;for(let i=0;i<source.length;i++){const c=source[i];if(quote){if(c==='\\')i++;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='[')square++;else if(c===']')square--;else if(c==='(')round++;else if(c===')')round--;else if(c===delimiter&&square===0&&round===0){out.push(source.slice(start,i).trim());start=i+1;}}out.push(source.slice(start).trim());return out.filter(Boolean);};
const parts=(group)=>{const out=[];let buf='',quote='',square=0,round=0,pending='deep';const push=()=>{const value=buf.trim();if(value){out.push({selector:value,combinator:pending});buf='';pending='descendant';}};for(let i=0;i<group.length;i++){const c=group[i];if(quote){buf+=c;if(c==='\\'&&i+1<group.length)buf+=group[++i];else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;buf+=c;continue;}if(c==='['){square++;buf+=c;continue;}if(c===']'){square--;buf+=c;continue;}if(c==='('){round++;buf+=c;continue;}if(c===')'){round--;buf+=c;continue;}if(square===0&&round===0&&c==='>'){push();pending='child';continue;}if(square===0&&round===0&&/\s/.test(c)){if(buf.trim())push();continue;}buf+=c;}push();return out;};
const deep=(root,selector)=>{const out=[];const visit=(scope)=>{if(!scope?.querySelectorAll)return;try{out.push(...scope.querySelectorAll(selector));}catch{}for(const el of scope.querySelectorAll('*'))if(el.shadowRoot)visit(el.shadowRoot);};if(root instanceof Element&&root.shadowRoot)visit(root.shadowRoot);visit(root);return out;};
const children=(el)=>[...(el?.children??[]),...(el?.shadowRoot?.children??[])];
const resolveSelector=(root,selector)=>{const result=[];for(const group of splitTop(selector,',')){let current=[root];for(const part of parts(group)){const next=[];for(const node of current){if(part.combinator==='child')next.push(...children(node).filter((el)=>{try{return el.matches(part.selector);}catch{return false;}}));else next.push(...deep(node,part.selector));}current=[...new Set(next)];}result.push(...current);}return [...new Set(result)];};
const resolve=(steps)=>{let current=[document];for(const step of steps){if(step.kind==='query'){const next=[];for(const root of current)next.push(...resolveSelector(root,step.selector));current=[...new Set(next)];}else if(step.kind==='filter')current=current.filter((el)=>(el.textContent||'').includes(step.text));else if(step.kind==='first')current=current.slice(0,1);}return current;};
`;

function expr(body: string) { return `(() => { ${queryRuntime} ${body} })()`; }
function arg(value: unknown) { return JSON.stringify(value); }

export class Locator {
  constructor(private page: Page, private steps: Step[]) {}
  locator(selector: string) { return new Locator(this.page, [...this.steps, {kind:'query',selector}]); }
  filter(options: {hasText: string}) { return new Locator(this.page, [...this.steps, {kind:'filter',text:String(options.hasText)}]); }
  first() { return new Locator(this.page, [...this.steps, {kind:'first'}]); }
  async count() { return Number(await this.page.raw(expr(`return resolve(${arg(this.steps)}).length;`))); }
  async textContent() { return await this.page.raw(expr(`return resolve(${arg(this.steps)})[0]?.textContent ?? null;`)) as string|null; }
  async getAttribute(name:string) { return await this.page.raw(expr(`return resolve(${arg(this.steps)})[0]?.getAttribute(${arg(name)}) ?? null;`)) as string|null; }
  async inputValue() { return String(await this.page.raw(expr(`return resolve(${arg(this.steps)})[0]?.value ?? '';`))); }
  async isVisible() { return Boolean(await this.page.raw(expr(`const el=resolve(${arg(this.steps)})[0]; if(!el)return false; const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';`))); }
  async boundingBox() { return await this.page.raw(expr(`const r=resolve(${arg(this.steps)})[0]?.getBoundingClientRect(); return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;`)) as {x:number;y:number;width:number;height:number}|null; }
  async click(options: {button?:'left'|'right'|'middle';clickCount?:number} = {}) { const p=await this.point(); await this.page.mouse.click(p.x,p.y,options); }
  async hover() { const p=await this.point(); await this.page.mouse.move(p.x,p.y); }
  async fill(value:string) { await this.waitFor({state:'visible'}); await this.page.raw(expr(`const el=resolve(${arg(this.steps)})[0]; if(!el)throw new Error('input not found: '+${arg(JSON.stringify(this.steps))}); el.focus(); el.value=${arg(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;`)); }
  async blur() { await this.page.raw(expr(`resolve(${arg(this.steps)})[0]?.blur(); return true;`)); }
  async press(key:string) { await this.page.raw(expr(`resolve(${arg(this.steps)})[0]?.focus(); return true;`)); await this.page.keyboard.press(key); }
  async selectOption(value:string) { await this.page.raw(expr(`const el=resolve(${arg(this.steps)})[0]; if(!el)throw new Error('select not found'); el.value=${arg(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return el.value;`)); }
  async scrollIntoViewIfNeeded() { await this.page.raw(expr(`resolve(${arg(this.steps)})[0]?.scrollIntoView({block:'nearest',inline:'nearest'}); return true;`)); }
  async evaluate<T>(fn:(element:any,arg?:any)=>T|Promise<T>, value?:unknown):Promise<T> { const end=Date.now()+30_000; while(Date.now()<end){if(await this.count())return await this.page.raw(expr(`const el=resolve(${arg(this.steps)})[0]; return (${fn.toString()})(el,${arg(value)});`)) as T;await Bun.sleep(50);}throw new Error(`locator not found: ${JSON.stringify(this.steps)} @ ${this.page.url()}`); }
  async waitFor(options:{state:'visible'|'detached';timeout?:number}) { const end=Date.now()+(options.timeout??30_000); while(Date.now()<end){if(options.state==='detached'?(await this.count())===0:await this.isVisible())return;await Bun.sleep(50);}const detail=await this.page.raw(`({url:location.href,title:document.title,body:(document.body?.innerText??'').slice(0,500)})`).catch(()=>null);throw new Error(`timeout waiting for ${options.state} ${JSON.stringify(this.steps)}: ${JSON.stringify(detail)}`); }
  private async point() { await this.waitFor({state:'visible'}); await this.scrollIntoViewIfNeeded(); const b=await this.boundingBox(); if(!b)throw new Error('locator has no box'); return {x:b.x+b.width/2,y:b.y+b.height/2}; }
  private async focusAndSelect() { await this.page.raw(expr(`const el=resolve(${arg(this.steps)})[0]; if(!el)throw new Error('input not found'); el.focus(); el.select?.(); return true;`)); }
}

class Keyboard {
  constructor(private page:Page) {}
  async press(key:string){if(key==='Enter'||key==='Backspace')return this.page.view.press(key);const mapped=keyInfo(key);await this.dispatch('keyDown',mapped);await this.dispatch('keyUp',mapped);}
  async down(key:string){await this.dispatch('rawKeyDown',keyInfo(key));}
  async up(key:string){await this.dispatch('keyUp',keyInfo(key));}
  private async dispatch(type:string,k:{key:string;code:string;keyCode:number;text?:string}) { const data:any={type,key:k.key,code:k.code,windowsVirtualKeyCode:k.keyCode,nativeVirtualKeyCode:k.keyCode};if(type==='keyDown'&&k.text)data.text=k.text;await this.page.view.cdp('Input.dispatchKeyEvent',data); }
}

class Mouse {
  x=0;y=0;pressed=false;
  constructor(private page:Page) {}
  async move(x:number,y:number,options:{steps?:number}={}){const steps=Math.max(1,options.steps??1),sx=this.x,sy=this.y;for(let i=1;i<=steps;i++){const t=i/steps;this.x=sx+(x-sx)*t;this.y=sy+(y-sy)*t;await this.page.view.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:this.x,y:this.y,button:this.pressed?'left':'none',buttons:this.pressed?1:0});}}
  async down(){this.pressed=true;await this.page.view.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:this.x,y:this.y,button:'left',buttons:1,clickCount:1});}
  async up(){await this.page.view.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:this.x,y:this.y,button:'left',buttons:0,clickCount:1});this.pressed=false;}
  async click(x:number,y:number,options:{button?:'left'|'right'|'middle';clickCount?:number}={}){const button=options.button??'left',clickCount=options.clickCount??1;await this.move(x,y);await this.page.view.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button,buttons:button==='left'?1:button==='right'?2:4,clickCount});await this.page.view.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button,buttons:0,clickCount});}
}

class Touchscreen { constructor(private page:Page){} async tap(x:number,y:number){await this.page.view.cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await this.page.view.cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});} }
class Response { constructor(private code:number){} ok(){return this.code>=200&&this.code<400;} status(){return this.code;} }
class RequestEvent { constructor(private data:any){} method(){return this.data.request.method;} url(){return this.data.request.url;} }
class SocketEvent { private listeners=new Map<string,Listener[]>(); on(type:string,fn:Listener){const list=this.listeners.get(type)??[];list.push(fn);this.listeners.set(type,list);} emit(type:string,payload:string){for(const fn of this.listeners.get(type)??[])fn({payload});} }

export class Page {
  readonly keyboard=new Keyboard(this);readonly mouse=new Mouse(this);readonly touchscreen=new Touchscreen(this);
  private listeners=new Map<string,Listener[]>();private sockets=new Map<string,SocketEvent>();
  private constructor(public view:any){}
  static async create(options:any={},launch:any={}){
    let page!:Page;
    const argv=[...(launch.args??[]),'--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox','--enable-gpu','--ignore-gpu-blocklist'];
    const backend:any=launch.executablePath?{type:'chrome',path:launch.executablePath,argv}:{type:'chrome',argv};
    const view=new Bun.WebView({width:options.viewport?.width??800,height:options.viewport?.height??600,backend,console:(type:string,...values:any[])=>page?.emit('console',{type:()=>type,text:()=>values.map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' ')})});
    page=new Page(view);await view.navigate('about:blank');await view.cdp('Runtime.enable');await view.cdp('Page.enable');await view.cdp('Network.enable');
    if(options.viewport||options.isMobile||options.deviceScaleFactor){const width=options.viewport?.width??800,height=options.viewport?.height??600;await view.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:options.deviceScaleFactor??1,mobile:Boolean(options.isMobile)});if(options.hasTouch)await view.cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});}
    view.addEventListener('Runtime.exceptionThrown',(event:any)=>page.emit('pageerror',new Error(event.data?.exceptionDetails?.exception?.description||event.data?.exceptionDetails?.text||'Page error')));
    view.addEventListener('Network.requestWillBeSent',(event:any)=>page.emit('request',new RequestEvent(event.data)));
    view.addEventListener('Network.webSocketCreated',(event:any)=>{const socket=new SocketEvent();page.sockets.set(event.data.requestId,socket);page.emit('websocket',socket);});
    view.addEventListener('Network.webSocketFrameSent',(event:any)=>page.sockets.get(event.data.requestId)?.emit('framesent',event.data.response?.payloadData??''));
    view.addEventListener('Network.webSocketFrameReceived',(event:any)=>page.sockets.get(event.data.requestId)?.emit('framereceived',event.data.response?.payloadData??''));
    return page;
  }
  locator(selector:string){return new Locator(this,[{kind:'query',selector}]);}
  async goto(url:string,_options:any={}){let status=200;try{status=(await fetch(url,{redirect:'manual'})).status}catch{status=0}await this.view.navigate(url);return new Response(status);}
  async reload(options:any={}){return this.goto(this.view.url,options);}
  url(){return this.view.url;}
  async evaluate<T>(fn:(arg?:any)=>T|Promise<T>,value?:unknown):Promise<T>{return await this.raw(`(${fn.toString()})(${arg(value)})`) as T;}
  async waitForFunction(fn:(arg?:any)=>any,value?:unknown,options:{timeout?:number}={}){const end=Date.now()+(options.timeout??30_000);while(Date.now()<end){if(await this.evaluate(fn,value))return;await Bun.sleep(50);}throw new Error(`timeout waiting for function: ${fn.toString()}`);}
  async waitForTimeout(ms:number){await Bun.sleep(ms);}
  async screenshot(options:{path:string;fullPage?:boolean}){await Bun.write(options.path,options.fullPage?await this.fullPageScreenshot():await this.view.screenshot({encoding:'buffer'}));}
  on(type:string,fn:Listener){const list=this.listeners.get(type)??[];list.push(fn);this.listeners.set(type,list);}
  once(type:string,fn:Listener){const wrapper=(...args:any[])=>{this.off(type,wrapper);fn(...args)};this.on(type,wrapper);}
  off(type:string,fn:Listener){this.listeners.set(type,(this.listeners.get(type)??[]).filter(item=>item!==fn));}
  emit(type:string,...args:any[]){for(const fn of this.listeners.get(type)??[])fn(...args);}
  async raw(script:string){return this.view.evaluate(script);}
  close(){this.view.close();}
  private async fullPageScreenshot(){const metrics=await this.view.cdp('Page.getLayoutMetrics');const size=metrics.cssContentSize;const shot=await this.view.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.width,height:size.height,scale:1}});return Buffer.from(shot.data,'base64');}
}

export class BrowserContext {
  private pages:Page[]=[];
  constructor(private options:any,private launch:any){}
  async newPage(){const page=await Page.create(this.options,this.launch);this.pages.push(page);return page;}
  async newCDPSession(page:Page){return{send:(method:string,params:any={})=>page.view.cdp(method,params),detach:async()=>{}};}
  async close(){for(const page of this.pages)page.close();}
}

export class Browser {
  private contexts:BrowserContext[]=[];
  constructor(private launch:any){}
  async newContext(options:any={}){const context=new BrowserContext(options,this.launch);this.contexts.push(context);return context;}
  async newPage(options:any={}){return(await this.newContext(options)).newPage();}
  async close(){for(const context of this.contexts)await context.close();Bun.WebView.closeAll();}
}

export const chromium={launch:async(options:any={})=>new Browser(options)};

function keyInfo(name:string){const named:any={Escape:['Escape','Escape',27],Enter:['Enter','Enter',13],Backspace:['Backspace','Backspace',8],Delete:['Delete','Delete',46],Equal:['=','Equal',187,'='],Minus:['-','Minus',189,'-'],Space:[' ','Space',32,' '],ArrowLeft:['ArrowLeft','ArrowLeft',37],ArrowRight:['ArrowRight','ArrowRight',39],ArrowUp:['ArrowUp','ArrowUp',38],ArrowDown:['ArrowDown','ArrowDown',40],Home:['Home','Home',36],End:['End','End',35]};if(named[name]){const[k,c,v,t]=named[name];return{key:k,code:c,keyCode:v,text:t};}if(name.length===1){const u=name.toUpperCase();return{key:name,code:/[A-Z]/.test(u)?`Key${u}`:'',keyCode:u.charCodeAt(0),text:name};}throw new Error(`Unsupported key ${name}`);}
