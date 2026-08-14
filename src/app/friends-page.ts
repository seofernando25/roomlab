import { LitElement, css, html } from 'lit';
import { api } from '../online/api-client';
import type { FriendDto } from '../online/types';
import { appTheme } from './app-theme';

export class FriendsPage extends LitElement {
  static override styles=[appTheme,css`
    :host{display:block}.request{display:flex;gap:8px;margin-bottom:16px}.request input{max-width:280px}.friend{display:flex;align-items:center;justify-content:space-between;gap:12px}.friend-main{display:flex;align-items:center;gap:10px}.avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#1d6c94;border:2px solid #86c9e5;font-weight:900}.status{font-size:12px;color:#9cc3d5}.online{color:#70e895}.actions{display:flex;gap:7px;flex-wrap:wrap}.message{margin-bottom:12px;padding:9px 11px;border-radius:8px;background:#71303a}@media(max-width:600px){.request{flex-direction:column}.request input{max-width:none}.friend{align-items:flex-start;flex-direction:column}.actions{width:100%}.actions button{flex:1}}
  `];
  #friends:readonly FriendDto[]=[];#loading=true;#message='';#pollTimer=0;
  override connectedCallback():void{super.connectedCallback();void this.load();this.#pollTimer=window.setInterval(()=>void this.load(false),5000);}
  override disconnectedCallback():void{window.clearInterval(this.#pollTimer);super.disconnectedCallback();}
  override render(){return html`<div class="section-head"><div><div class="eyebrow">Social</div><h2>Friends</h2><p>Find people by username and jump into their room when it is joinable.</p></div></div><form class="request" @submit=${this.requestFriend}><input name="username" minlength="3" maxlength="18" placeholder="Username" required><button class="primary">Add friend</button></form>${this.#message?html`<div class="message">${this.#message}</div>`:null}${this.#loading?html`<div class="empty">Loading friends…</div>`:this.#friends.length?html`<div class="card-grid">${this.#friends.map(friend=>this.card(friend))}</div>`:html`<div class="empty">No friends yet. Add somebody by username.</div>`}`;}
  private card(friend:FriendDto){return html`<article class="card friend"><div class="friend-main"><div class="avatar">${friend.username.slice(0,1).toUpperCase()}</div><div><h3>${friend.username}</h3><div class="status ${friend.online?'online':''}">${statusLabel(friend)}</div></div></div><div class="actions">${friend.status==='incoming'?html`<button class="primary" @click=${()=>this.accept(friend.friendshipId)}>Accept</button>`:null}${friend.status==='accepted'&&friend.roomId?html`<button class="secondary" @click=${()=>this.join(friend.roomId!)}>Join</button>`:null}<button class="ghost" @click=${()=>this.removeFriendEntry(friend.friendshipId)}>Remove</button></div></article>`;}
  private async load(showLoading=true):Promise<void>{if(showLoading){this.#loading=true;this.requestUpdate();}try{this.#friends=await api.friends();}catch(error){this.#message=messageOf(error);}finally{if(showLoading)this.#loading=false;this.requestUpdate();}}
  private readonly requestFriend=async(event:SubmitEvent):Promise<void>=>{event.preventDefault();const form=event.currentTarget as HTMLFormElement;const username=String(new FormData(form).get('username')??'');try{await api.requestFriend(username);form.reset();this.#message='Friend request sent.';await this.load();}catch(error){this.#message=messageOf(error);this.requestUpdate();}};
  private async accept(id:string):Promise<void>{try{await api.acceptFriend(id);await this.load();}catch(error){this.#message=messageOf(error);this.requestUpdate();}}
  private async removeFriendEntry(id:string):Promise<void>{try{await api.removeFriend(id);await this.load();}catch(error){this.#message=messageOf(error);this.requestUpdate();}}
  private join(roomId:string):void{this.dispatchEvent(new CustomEvent('join-room',{detail:{roomId},bubbles:true,composed:true}));}
}
function statusLabel(friend:FriendDto):string{return friend.status==='incoming'?'Wants to be friends':friend.status==='outgoing'?'Request sent':friend.online?(friend.roomName?`In ${friend.roomName}`:'Online'):'Offline';}
function messageOf(error:unknown):string{return error instanceof Error?error.message:'Something went wrong.';}
customElements.define('friends-page',FriendsPage);
