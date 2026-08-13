import { LitElement, css, html } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { api } from '../online/api-client';
import { RoomConnection } from '../online/room-connection';
import { RoomGameNetworkAdapter } from '../online/room-game-network';
import type { AccountDto, InventoryItemDto, JoinRoomDto, RoomServerMessage } from '../online/types';
import type { HabboGame } from '../ui/habbo-game';
import '../ui/habbo-game';
import './room-settings-panel';

export class OnlineRoomPage extends LitElement {
  static override properties = { account: { attribute: false }, roomId: { type: String } };
  declare account: AccountDto;
  declare roomId: string;
  static override styles = css`
    :host{display:block;position:fixed;inset:0;background:#102635;z-index:1}.loading{position:absolute;inset:0;display:grid;place-items:center;color:#dff5ff;font:700 15px system-ui;background:#102635}.back{position:fixed;left:16px;bottom:16px;z-index:80;border:1px solid #8cc9e9;border-radius:9px;padding:9px 13px;background:#0a527d;color:#fff;font:800 13px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.25)}.settings{position:fixed;left:112px;bottom:16px;z-index:80;border:1px solid #8cc9e9;border-radius:9px;padding:9px 13px;background:#123d58;color:#fff;font:800 13px system-ui}.status{position:fixed;right:16px;bottom:16px;z-index:80;padding:7px 10px;border-radius:999px;background:#08263b;color:#bde6f7;border:1px solid #317b9e;font:700 11px system-ui}.status.connected{color:#7ee69e}.toast{position:fixed;left:50%;bottom:62px;z-index:90;transform:translateX(-50%);padding:9px 13px;border-radius:8px;background:#7b2e38;color:#fff;font:700 12px system-ui}
  `;

  #join: JoinRoomDto | null = null;
  #inventory: readonly InventoryItemDto[] = [];
  #connection: RoomConnection | null = null;
  #network: RoomGameNetworkAdapter | null = null;
  #status: 'connecting'|'connected'|'reconnecting'|'closed' = 'connecting';
  #message = '';
  #settingsOpen = false;

  constructor(){super();this.account={id:'',username:'',createdAt:'',balance:0};this.roomId='';}
  override connectedCallback():void{super.connectedCallback();void this.enter();}
  override disconnectedCallback():void{this.#connection?.close();this.#connection=null;super.disconnectedCallback();}

  override render(){
    const join=this.#join; if(!join||!this.#network)return html`<div class="loading">Entering room…</div>`;
    return html`${keyed(join.roomSessionId,html`<habbo-game
      .initialWorld=${join.snapshot}
      .network=${this.#network}
      .inventory=${this.#inventory}
      .roomName=${join.room.name}
      .roomSubtitle=${`by ${join.room.ownerUsername}`}
      .canEdit=${join.room.role!=='visitor'}
      @inventory-refresh=${this.refreshInventory}></habbo-game>`)}
      <button class="back" @click=${this.leave}>← Rooms</button>
      ${join.room.role==='owner'?html`<button class="settings" @click=${()=>{this.#settingsOpen=true;this.requestUpdate();}}>Room settings</button>`:null}
      <div class="status ${this.#status}">${statusLabel(this.#status)}</div>
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
        onStatus:(status)=>{this.#status=status;this.requestUpdate();},
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
    if(this.#connection)this.#network=this.makeNetwork(join,this.#connection);
    this.requestUpdate();
  }
  private makeNetwork(join:JoinRoomDto,connection:RoomConnection):RoomGameNetworkAdapter{
    return new RoomGameNetworkAdapter(join.actorId,this.account.id,join.room.role,connection,(message)=>this.showMessage(message));
  }
  private onMessage(message:RoomServerMessage):void{
    this.#network?.observe(message);
    if(message.type==='role'){
      this.#network?.updateRole(message.role);
      if(this.#join)this.#join={...this.#join,room:{...this.#join.room,role:message.role}};
      this.requestUpdate();
      return;
    }
    if (message.type !== 'manipulation' || message.userId !== this.account.id) this.game()?.applyServerMessage(message);
    if(message.type==='world')void this.refreshInventory();
  }
  private game():HabboGame|null{return this.renderRoot.querySelector('habbo-game') as HabboGame|null;}
  private readonly refreshInventory=async():Promise<void>=>{try{this.#inventory=await api.inventory();this.requestUpdate();}catch{/* keep the last known inventory while reconnecting */}};
  private readonly onSettingsUpdated=(event:Event):void=>{const room=(event as CustomEvent<JoinRoomDto['room']>).detail;if(this.#join)this.#join={...this.#join,room};this.requestUpdate();};
  private readonly leave=():void=>{this.#connection?.close();this.dispatchEvent(new CustomEvent('leave-room',{bubbles:true,composed:true}));};
  private showMessage(message:string):void{this.#message=message;this.requestUpdate();window.setTimeout(()=>{if(this.#message===message){this.#message='';this.requestUpdate();}},2500);}
}
function statusLabel(status:'connecting'|'connected'|'reconnecting'|'closed'):string{return status==='connected'?'Live':status==='reconnecting'?'Reconnecting…':status==='connecting'?'Connecting…':'Offline';}
customElements.define('online-room-page',OnlineRoomPage);
