import { LitElement, css, html } from 'lit';
import type { AccountDto } from '../online/types';
import { appTheme } from './app-theme';
import './friends-page';
import './inventory-page';
import './profile-page';
import './rooms-page';
import './shop-page';

type LobbySection = 'rooms' | 'shop' | 'items' | 'friends' | 'me';

export class LobbyShell extends LitElement {
  static override properties = { account: { attribute: false }, section: { type: String } };
  declare account: AccountDto;
  declare section: LobbySection;
  static override styles = [appTheme, css`
    :host{display:block;min-height:100vh;background:linear-gradient(#0b4d78,#0a3657 420px,#082a45)}
    .header{position:sticky;top:0;z-index:10;background:#061f35;border-bottom:3px solid #1e8bb8;box-shadow:0 4px 18px rgba(0,20,34,.24)}
    .header-inner{max-width:1180px;margin:auto;min-height:66px;padding:8px 18px;display:flex;align-items:center;gap:18px}
    .brand{font-size:19px;white-space:nowrap}.nav{display:flex;gap:4px;align-self:stretch}
    .nav button{min-width:78px;padding:7px 12px;border:0;border-bottom:3px solid transparent;background:transparent;color:#b8ddec;font-weight:800}
    .nav button.active{color:#fff;border-bottom-color:#f8ca4a;background:rgba(255,255,255,.05)}
    .account{margin-left:auto;display:flex;gap:10px;align-items:center}.account .name{font-weight:800}
    .main{max-width:1180px;margin:auto;padding:28px 20px 60px}
    @media(max-width:760px){.header-inner{flex-wrap:wrap;gap:8px}.nav{order:3;width:100%;overflow:auto}.nav button{flex:1;min-width:72px}.account .name{display:none}.main{padding:20px 12px}.brand{font-size:16px}}
  `];

  constructor(){ super(); this.account={id:'',username:'',createdAt:'',balance:0}; this.section='rooms'; }
  override render(){return html`
    <header class="header"><div class="header-inner">
      <div class="brand"><span class="brand-mark">R</span>ROOM LAB</div>
      <nav class="nav">${(['rooms','shop','items','friends','me'] as const).map(section=>html`<button class=${section===this.section?'active':''} @click=${()=>this.navigate(section)}>${label(section)}</button>`)}</nav>
      <div class="account"><span class="credits">◈ ${this.account.balance}</span><span class="name">${this.account.username}</span></div>
    </div></header>
    <main class="main">${this.page()}</main>`;}
  private page(){
    if(this.section==='rooms')return html`<rooms-page .account=${this.account}></rooms-page>`;
    if(this.section==='shop')return html`<shop-page .account=${this.account}></shop-page>`;
    if(this.section==='items')return html`<inventory-page></inventory-page>`;
    if(this.section==='friends')return html`<friends-page></friends-page>`;
    return html`<profile-page .account=${this.account}></profile-page>`;
  }
  private navigate(section:LobbySection):void{this.dispatchEvent(new CustomEvent('lobby-navigate',{detail:{section},bubbles:true,composed:true}));}
}
function label(section:LobbySection):string{return section==='rooms'?'Rooms':section==='shop'?'Shop':section==='items'?'My Items':section==='friends'?'Friends':'Me';}
customElements.define('lobby-shell', LobbyShell);
