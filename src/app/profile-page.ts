import { LitElement, css, html } from 'lit';
import { api } from '../online/api-client';
import type { AccountDto } from '../online/types';
import { appTheme } from './app-theme';

export class ProfilePage extends LitElement {
  static override properties={account:{attribute:false}};
  declare account:AccountDto;
  static override styles=[appTheme,css`:host{display:block}.profile{max-width:620px;padding:18px}.hero{display:flex;align-items:center;gap:14px;margin-bottom:18px}.avatar{width:72px;height:72px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#35a8d6,#155d88);border:2px solid #a7e4f8;font-size:30px;font-weight:950}.profile h2{margin:0}.rows{display:grid;gap:12px}.row{padding:12px;border-radius:9px;background:rgba(255,255,255,.06);border:1px solid rgba(153,208,231,.18)}.rename{display:flex;gap:8px}.notice{padding:10px 12px;border-radius:8px;background:#71303a;margin-bottom:12px}.danger-zone{margin-top:22px;padding-top:16px;border-top:1px solid rgba(151,204,224,.2)}`];
  #message='';
  constructor(){super();this.account={id:'',username:'',createdAt:'',balance:0};}
  override render(){return html`<div class="section-head"><div><div class="eyebrow">Account</div><h2>Me</h2><p>Your public identity and this browser's beta session.</p></div></div>${this.#message?html`<div class="notice">${this.#message}</div>`:null}<section class="panel profile"><div class="hero"><div class="avatar">${this.account.username.slice(0,1).toUpperCase()}</div><div><h2>${this.account.username}</h2><div class="credits">◈ ${this.account.balance} credits</div></div></div><div class="rows"><div class="row"><strong>Change username</strong><form class="rename" @submit=${this.rename}><input name="username" minlength="3" maxlength="18" .value=${this.account.username} required><button class="secondary">Save</button></form></div><div class="row"><strong>Browser-bound beta account</strong><p class="muted">This beta account stays on this browser for now. Account recovery and cross-device sign-in will come with stronger login options later.</p></div></div><div class="danger-zone"><button class="danger" @click=${this.logout}>Sign out on this browser</button></div></section>`;}
  private readonly rename=async(event:SubmitEvent):Promise<void>=>{event.preventDefault();const username=String(new FormData(event.currentTarget as HTMLFormElement).get('username')??'');try{const account=await api.rename(username);this.dispatchEvent(new CustomEvent('account-updated',{detail:account,bubbles:true,composed:true}));this.#message='Username updated.';}catch(error){this.#message=messageOf(error);}this.requestUpdate();};
  private readonly logout=async():Promise<void>=>{try{await api.logout();localStorage.removeItem('roomlab-profile');this.dispatchEvent(new CustomEvent('signed-out',{bubbles:true,composed:true}));}catch(error){this.#message=messageOf(error);this.requestUpdate();}};
}
function messageOf(error:unknown):string{return error instanceof Error?error.message:'Something went wrong.';}
customElements.define('profile-page',ProfilePage);
