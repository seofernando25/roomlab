import { LitElement, css, html } from 'lit';
import { getCatalogueObject } from '../domain/catalogue-registry';
import { api } from '../online/api-client';
import type { AccountDto, MarketListingDto, StoreOfferDto } from '../online/types';
import '../ui/catalogue-object-preview';
import { appTheme } from './app-theme';

export class ShopPage extends LitElement {
  static override properties={account:{attribute:false}};
  declare account:AccountDto;
  static override styles=[appTheme,css`
    :host{display:block}.tabs{display:flex;gap:8px;margin-bottom:16px}.tab{min-height:44px;padding:8px 13px;border-radius:999px;border:1px solid #377b9d;background:#0d4769;color:#e6f8ff}.tab.active{background:#edf9fd;color:#17465f}.offer{display:grid;grid-template-rows:120px auto auto;gap:9px}.preview{background:#dcecf1;border-radius:9px;overflow:hidden}.offer-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}.seller{font-size:12px;color:#98bfd1}.notice{padding:10px 12px;border-radius:8px;background:#79303a;margin-bottom:12px}
  `];
  #tab:'official'|'market'='official';#offers:readonly StoreOfferDto[]=[];#listings:readonly MarketListingDto[]=[];#loading=true;#message='';#pending=new Set<string>();
  constructor(){super();this.account={id:'',username:'',createdAt:'',balance:0};}
  override connectedCallback():void{super.connectedCallback();void this.load();}
  override render(){return html`<div class="section-head"><div><div class="eyebrow">Economy</div><h2>Shop</h2><p>Official furniture and player listings use real owned item instances.</p></div><div class="credits">◈ ${this.account.balance} credits</div></div><div class="tabs"><button class="tab ${this.#tab==='official'?'active':''}" @click=${()=>this.setTab('official')}>Official</button><button class="tab ${this.#tab==='market'?'active':''}" @click=${()=>this.setTab('market')}>Marketplace</button></div>${this.#message?html`<div class="notice">${this.#message}</div>`:null}${this.#loading?html`<div class="empty">Loading Shop…</div>`:this.#tab==='official'?this.offersView():this.marketView()}`;}
  private offersView(){return this.#offers.length?html`<div class="card-grid">${this.#offers.map(offer=>{const def=getCatalogueObject(offer.prototypeId);return html`<article class="card offer"><div class="preview"><catalogue-object-preview prototype-id=${offer.prototypeId}></catalogue-object-preview></div><div><h3>${def.label}</h3><p>${def.description}</p></div><div class="offer-foot"><strong class="credits">◈ ${offer.price}</strong><button class="primary" ?disabled=${this.#pending.has(offer.id)} @click=${()=>this.buyOffer(offer)}>${this.#pending.has(offer.id)?'Buying…':'Buy'}</button></div></article>`;})}</div>`:html`<div class="empty">No official offers right now.</div>`;}
  private marketView(){return this.#listings.length?html`<div class="card-grid">${this.#listings.map(listing=>{const def=getCatalogueObject(listing.prototypeId);const mine=listing.sellerUserId===this.account.id;return html`<article class="card offer"><div class="preview"><catalogue-object-preview prototype-id=${listing.prototypeId}></catalogue-object-preview></div><div><h3>${def.label}</h3><div class="seller">Listed by ${listing.sellerUsername}</div></div><div class="offer-foot"><strong class="credits">◈ ${listing.price}</strong>${mine?html`<button class="ghost" ?disabled=${this.#pending.has(listing.id)} @click=${()=>this.cancel(listing.id)}>Cancel</button>`:html`<button class="primary" ?disabled=${this.#pending.has(listing.id)} @click=${()=>this.buyListing(listing)}>${this.#pending.has(listing.id)?'Buying…':'Buy'}</button>`}</div></article>`;})}</div>`:html`<div class="empty">Nobody has listed anything yet.</div>`;}
  private setTab(tab:'official'|'market'):void{this.#tab=tab;this.requestUpdate();}
  private async load():Promise<void>{this.#loading=true;this.requestUpdate();try{[this.#offers,this.#listings]=await Promise.all([api.offers(),api.market()]);}catch(error){this.#message=messageOf(error);}finally{this.#loading=false;this.requestUpdate();}}
  private async buyOffer(offer:StoreOfferDto):Promise<void>{if(this.#pending.has(offer.id))return;this.#pending.add(offer.id);this.requestUpdate();try{const result=await api.buyOffer(offer.id);this.balance(result.balance);this.#message=`${offer.label} added to My Items.`;}catch(error){this.#message=messageOf(error);}finally{this.#pending.delete(offer.id);this.requestUpdate();}}
  private async buyListing(listing:MarketListingDto):Promise<void>{if(this.#pending.has(listing.id))return;this.#pending.add(listing.id);this.requestUpdate();try{const result=await api.buyListing(listing.id);this.balance(result.balance);this.#message='Marketplace purchase complete.';await this.load();}catch(error){this.#message=messageOf(error);}finally{this.#pending.delete(listing.id);this.requestUpdate();}}
  private async cancel(id:string):Promise<void>{if(this.#pending.has(id))return;this.#pending.add(id);this.requestUpdate();try{await api.cancelListing(id);await this.load();}catch(error){this.#message=messageOf(error);}finally{this.#pending.delete(id);this.requestUpdate();}}
  private balance(balance:number):void{this.dispatchEvent(new CustomEvent('account-balance',{detail:{balance},bubbles:true,composed:true}));}
}
function messageOf(error:unknown):string{return error instanceof Error?error.message:'Something went wrong.';}
customElements.define('shop-page',ShopPage);
