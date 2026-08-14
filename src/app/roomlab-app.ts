import { LitElement, css, html } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { api } from '../online/api-client';
import type { AccountDto } from '../online/types';
import './landing-page';
import './lobby-shell';
import './online-room-page';

type LobbySection='rooms'|'shop'|'items'|'friends'|'me';

export class RoomLabApp extends LitElement{
  static override styles=css`:host{display:block;min-height:100vh;min-height:100dvh;background:#082a45}.boot{min-height:100vh;min-height:100dvh;display:grid;place-items:center;background:#061f35;color:#dff7ff;font:700 14px system-ui}`;
  #account:AccountDto|null=null;
  #booting=true;
  #path=location.pathname;

  override connectedCallback():void{super.connectedCallback();window.addEventListener('popstate',this.onPopState);void this.bootstrap();}
  override disconnectedCallback():void{window.removeEventListener('popstate',this.onPopState);super.disconnectedCallback();}
  override render(){if(this.#booting)return html`<div class="boot">Opening Room Lab…</div>`;if(!this.#account)return html`<landing-page @account-ready=${this.onAccountReady}></landing-page>`;const roomId=roomIdFromPath(this.#path);if(roomId)return keyed(roomId,html`<online-room-page .account=${this.#account} .roomId=${roomId} @room-navigate=${this.onRoomNavigate}></online-room-page>`);const section=sectionFromPath(this.#path);return html`<lobby-shell .account=${this.#account} .section=${section} @lobby-navigate=${this.onLobbyNavigate} @join-room=${this.onJoinRoom} @account-balance=${this.onBalance} @account-updated=${this.onAccountUpdated} @signed-out=${this.onSignedOut}></lobby-shell>`;}
  private async bootstrap():Promise<void>{try{this.#account=await api.session();}catch{this.#account=null;}this.#booting=false;if(this.#account&&this.#path==='/')this.replace('/rooms');if(!this.#account&&this.#path!=='/')this.replace('/');this.requestUpdate();}
  private readonly onAccountReady=(event:CustomEvent<AccountDto>):void=>{this.#account=event.detail;this.navigate('/rooms');};
  private readonly onAccountUpdated=(event:CustomEvent<AccountDto>):void=>{this.#account=event.detail;this.requestUpdate();};
  private readonly onBalance=(event:CustomEvent<{balance:number}>):void=>{if(!this.#account)return;this.#account={...this.#account,balance:event.detail.balance};this.requestUpdate();};
  private readonly onSignedOut=():void=>{this.#account=null;this.navigate('/');};
  private readonly onLobbyNavigate=(event:CustomEvent<{section:LobbySection}>):void=>{this.navigate(`/${event.detail.section}`);void this.refreshAccount();};
  private readonly onJoinRoom=(event:CustomEvent<{roomId:string}>):void=>this.navigate(`/room/${encodeURIComponent(event.detail.roomId)}`);
  private readonly onRoomNavigate=(event:CustomEvent<{path:string}>):void=>{this.navigate(event.detail.path);void this.refreshAccount();};
  private readonly onPopState=():void=>{this.#path=location.pathname;window.scrollTo({top:0,left:0});this.requestUpdate();};
  private async refreshAccount():Promise<void>{try{const account=await api.session();if(account){this.#account=account;this.requestUpdate();}}catch{/* keep current session display until a request proves it expired */}}
  private navigate(path:string):void{if(location.pathname!==path)history.pushState({},'',path);this.#path=path;window.scrollTo({top:0,left:0});this.requestUpdate();}
  private replace(path:string):void{history.replaceState({},'',path);this.#path=path;}
}
function roomIdFromPath(path:string):string|null{const match=path.match(/^\/room\/([^/]+)$/);return match?decodeURIComponent(match[1]!):null;}
function sectionFromPath(path:string):LobbySection{const value=path.slice(1);return value==='shop'||value==='items'||value==='friends'||value==='me'?value:'rooms';}
customElements.define('roomlab-app',RoomLabApp);
