import { LitElement, css, html } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { api } from '../online/api-client';
import { DelegatingRoomGameNetwork } from '../online/delegating-game-network';
import { RoomConnection } from '../online/room-connection';
import { RoomGameNetworkAdapter } from '../online/room-game-network';
import type { AccountDto, InventoryItemDto, JoinRoomDto, RoomServerMessage } from '../online/types';
import type { HabboGame } from '../ui/habbo-game';
import type { RoomDockAction } from '../rendering/room-dock-assets';
import '../ui/habbo-game';
import '../ui/room-action-dock';
import './room-browser-panel';
import './room-identity-card';
import './room-settings-panel';

export class OnlineRoomPage extends LitElement {
  static override properties = { account: { attribute: false }, roomId: { type: String } };
  declare account: AccountDto;
  declare roomId: string;
  static override styles = css`
    :host{display:block;position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;overflow:hidden;background:#102635;z-index:1;overscroll-behavior:none;touch-action:manipulation}
    habbo-game{display:block;width:100%;height:100%;--room-chat-bottom:18px}
    .loading{position:absolute;inset:0;display:grid;place-items:center;color:#dff5ff;font:700 15px system-ui;background:#102635}
    .status{position:fixed;right:16px;bottom:16px;z-index:80;padding:7px 10px;border-radius:999px;background:#08263b;color:#bde6f7;border:1px solid #317b9e;font:700 11px system-ui}
    .toast{position:fixed;left:50%;bottom:62px;z-index:90;max-width:min(360px,calc(100vw - 24px));transform:translateX(-50%);padding:9px 13px;border-radius:8px;background:#7b2e38;color:#fff;font:700 12px system-ui;text-align:center}
    room-action-dock{position:fixed;left:14px;bottom:14px;z-index:78}
    room-identity-card{position:fixed;right:14px;bottom:14px;z-index:78}
    room-browser-panel{position:fixed;left:14px;bottom:106px;z-index:82}
    habbo-game[material-studio-open]~room-action-dock,habbo-game[material-studio-open]~room-identity-card,habbo-game[material-studio-open]~room-browser-panel,habbo-game[material-studio-open]~.status,habbo-game[editing]~room-action-dock,habbo-game[editing]~room-identity-card,habbo-game[editing]~room-browser-panel{display:none}
    @media(max-width:1000px){
      .status{top:calc(12px + env(safe-area-inset-top));left:10px;right:auto;bottom:auto;padding:5px 8px;font-size:10px}
      .toast{top:calc(66px + env(safe-area-inset-top));bottom:auto}
    }
    @media(max-width:1100px){habbo-game{--room-chat-bottom:106px}}
    @media(max-width:680px){
      habbo-game{--room-chat-bottom:calc(88px + env(safe-area-inset-bottom))}
      room-action-dock{left:10px;bottom:calc(10px + env(safe-area-inset-bottom))}
      room-identity-card{right:10px;bottom:calc(148px + env(safe-area-inset-bottom))}
      room-browser-panel{left:10px;bottom:calc(88px + env(safe-area-inset-bottom))}
    }
  `;

  #join: JoinRoomDto | null = null;
  #inventory: readonly InventoryItemDto[] = [];
  #connection: RoomConnection | null = null;
  #network: RoomGameNetworkAdapter | null = null;
  readonly #gameNetwork = new DelegatingRoomGameNetwork(() => this.#network);
  #status: 'connecting'|'connected'|'reconnecting'|'closed' = 'connecting';
  #message = '';
  #settingsOpen = false;
  #browserOpen = false;

  constructor(){super();this.account={id:'',username:'',createdAt:'',balance:0};this.roomId='';}
  override connectedCallback():void{
    super.connectedCallback();
    this.dataset.connectionStatus=this.#status;
    this.addEventListener('touchstart',this.preventBrowserPinch,{passive:false});
    this.addEventListener('touchmove',this.preventBrowserPinch,{passive:false});
    this.addEventListener('gesturestart',this.preventBrowserGesture,{passive:false});
    this.addEventListener('gesturechange',this.preventBrowserGesture,{passive:false});
    void this.enter();
  }
  override disconnectedCallback():void{
    this.removeEventListener('touchstart',this.preventBrowserPinch);
    this.removeEventListener('touchmove',this.preventBrowserPinch);
    this.removeEventListener('gesturestart',this.preventBrowserGesture);
    this.removeEventListener('gesturechange',this.preventBrowserGesture);
    this.#connection?.close();this.#connection=null;super.disconnectedCallback();
  }

  override render(){
    const join=this.#join; if(!join||!this.#network)return html`<div class="loading">Entering room…</div>`;
    return html`${keyed(join.roomSessionId,html`<habbo-game
      .initialWorld=${join.snapshot}
      .network=${this.#gameNetwork}
      .inventory=${this.#inventory}
      .canEdit=${join.room.role!=='visitor'}
      ?room-browser-open=${this.#browserOpen}
      @inventory-refresh=${this.refreshInventory}
      @inventory-item-pending=${this.onInventoryItemPending}></habbo-game>`)}
      <room-action-dock @room-dock-action=${this.onDockAction}></room-action-dock>
      ${this.#browserOpen ? null : html`<room-identity-card .room=${join.room} @room-settings-open=${this.openSettings}></room-identity-card>`}
      ${this.#browserOpen ? html`<room-browser-panel .currentRoomId=${this.roomId} @room-browser-close=${this.closeBrowser} @room-browser-join=${this.onBrowserJoin}></room-browser-panel>` : null}
      ${this.#status === 'connected' ? null : html`<div class="status ${this.#status}">${statusLabel(this.#status)}</div>`}
      ${this.#message?html`<div class="toast">${this.#message}</div>`:null}
      ${this.#settingsOpen&&join.room.role==='owner'?html`<room-settings-panel .room=${join.room} @room-settings-close=${()=>{this.#settingsOpen=false;this.requestUpdate();}} @room-settings-updated=${this.onSettingsUpdated}></room-settings-panel>`:null}`;
  }

  private async enter():Promise<void>{
    try{
      const [join,inventory]=await Promise.all([api.joinRoom(this.roomId),api.inventory()]);
      this.#inventory=inventory;
      this.configureJoin(join);
      const connection=new RoomConnection(join,()=>api.joinRoom(this.roomId),{
        onMessage:(message)=>this.onMessage(message),
        onStatus:(status)=>{this.#status=status;this.dataset.connectionStatus=status;this.requestUpdate();},
        onJoinChanged:(next)=>this.configureJoin(next),
        onError:(message)=>this.showMessage(message),
      });
      this.#connection=connection;
      this.#network=this.makeNetwork(join,connection);
      connection.connect();
      this.requestUpdate();
    }catch(error){this.showMessage(error instanceof Error?error.message:'Could not enter room.');window.setTimeout(()=>this.leave(),1200);}
  }

  private configureJoin(join:JoinRoomDto):void{
    this.#join=join;
    if(this.#connection){
      if(this.#network?.actorId===join.actorId)this.#network.updateRole(join.room.role);
      else this.#network=this.makeNetwork(join,this.#connection);
    }
    this.requestUpdate();
  }
  private makeNetwork(join:JoinRoomDto,connection:RoomConnection):RoomGameNetworkAdapter{
    return new RoomGameNetworkAdapter(join.actorId,this.account.id,join.room.role,connection,(message)=>this.showMessage(message));
  }
  private onMessage(message:RoomServerMessage):void{
    this.#network?.observe(message);
    if(message.type==='inventory'){
      this.#inventory=message.items;
      this.requestUpdate();
      return;
    }
    if(message.type==='role'){
      this.#network?.updateRole(message.role);
      if(this.#join)this.#join={...this.#join,room:{...this.#join.room,role:message.role}};
      this.requestUpdate();
      return;
    }
    if (message.type !== 'manipulation' || message.userId !== this.account.id) this.game()?.applyServerMessage(message);
  }
  private game():HabboGame|null{return this.renderRoot.querySelector('habbo-game') as HabboGame|null;}
  private readonly refreshInventory=async():Promise<void>=>{try{this.#inventory=await api.inventory();this.requestUpdate();}catch{/* keep the last known inventory while reconnecting */}};
  private readonly onInventoryItemPending=(event:Event):void=>{
    const {id,state}=(event as CustomEvent<{id:string;state:'inventory'|'placed'}>).detail;
    this.#inventory=this.#inventory.map((item)=>item.id!==id?item:{...item,state,roomId:state==='placed'?this.roomId:null,entityId:state==='inventory'?null:item.entityId});
    this.requestUpdate();
  };
  private readonly onSettingsUpdated=(event:Event):void=>{const room=(event as CustomEvent<JoinRoomDto['room']>).detail;if(this.#join)this.#join={...this.#join,room};this.requestUpdate();};
  private readonly openSettings=():void=>{this.#settingsOpen=true;this.#browserOpen=false;this.requestUpdate();};
  private readonly closeBrowser=():void=>{this.#browserOpen=false;this.requestUpdate();};
  private readonly onBrowserJoin=(event:Event):void=>{const roomId=(event as CustomEvent<{roomId:string}>).detail.roomId;this.navigate(`/room/${encodeURIComponent(roomId)}`);};
  private readonly onDockAction=(event:Event):void=>{
    const action=(event as CustomEvent<{action:RoomDockAction}>).detail.action;
    if(action==='rooms'){this.#browserOpen=!this.#browserOpen;this.requestUpdate();return;}
    const path=action==='lobby'?'/rooms':action==='shop'?'/shop':action==='items'?'/items':'/me';
    this.navigate(path);
  };
  private readonly preventBrowserPinch=(event:TouchEvent):void=>{if(event.touches.length<2)return;if(event.composedPath().some((node)=>node instanceof HTMLCanvasElement))return;event.preventDefault();};
  private readonly preventBrowserGesture=(event:Event):void=>{if(event.composedPath().some((node)=>node instanceof HTMLCanvasElement))return;event.preventDefault();};
  private navigate(path:string):void{this.#connection?.close();this.dispatchEvent(new CustomEvent('room-navigate',{detail:{path},bubbles:true,composed:true}));}
  private readonly leave=():void=>this.navigate('/rooms');
  private showMessage(message:string):void{this.#message=message;this.requestUpdate();window.setTimeout(()=>{if(this.#message===message){this.#message='';this.requestUpdate();}},2500);}
}
function statusLabel(status:'connecting'|'connected'|'reconnecting'|'closed'):string{return status==='reconnecting'?'Reconnecting…':status==='connecting'?'Connecting…':'Offline';}
customElements.define('online-room-page',OnlineRoomPage);
