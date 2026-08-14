import { LitElement, css, html } from 'lit';
import { getCatalogueObject } from '../domain/catalogue-registry';
import { api } from '../online/api-client';
import type { InventoryItemDto } from '../online/types';
import '../ui/catalogue-object-preview';
import { appTheme } from './app-theme';

export class InventoryPage extends LitElement {
  static override styles = [appTheme, css`
    :host{display:block}.item{display:grid;grid-template-columns:82px 1fr;gap:12px;align-items:center}.preview{height:82px;border-radius:9px;background:#dcecf1;overflow:hidden}.meta{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.price{width:100px}.message{margin-bottom:12px;padding:9px 11px;border-radius:8px;background:#71303a}
  `];
  #items: readonly InventoryItemDto[]=[];
  #loading=true;
  #message='';

  override connectedCallback():void{super.connectedCallback();void this.load();}
  override render(){const available=this.#items.filter(i=>i.state==='inventory');const placed=this.#items.filter(i=>i.state==='placed');const listed=this.#items.filter(i=>i.state==='listed');return html`
    <div class="section-head"><div><div class="eyebrow">Collection</div><h2>My Items</h2><p>Each card is a real owned item instance. Placed and listed items cannot be duplicated.</p></div><span class="badge">${available.length} ready to place</span></div>
    ${this.#message?html`<div class="message">${this.#message}</div>`:null}
    ${this.#loading?html`<div class="empty">Loading your items…</div>`:html`
      ${this.section('Inventory',available,true)}
      ${placed.length?this.section('Placed in rooms',placed,false):null}
      ${listed.length?this.section('Listed',listed,false):null}
    `}
  `;}
  private section(title:string,items:readonly InventoryItemDto[],canList:boolean){return html`<section><div class="section-head mini"><div><h2>${title}</h2></div></div>${items.length?html`<div class="card-grid">${items.map(item=>this.card(item,canList))}</div>`:html`<div class="empty">Nothing here yet.</div>`}</section>`;}
  private card(item:InventoryItemDto,canList:boolean){const def=getCatalogueObject(item.prototypeId);return html`<article class="card item"><div class="preview"><catalogue-object-preview .prototypeId=${item.prototypeId} .appearance=${item.appearance}></catalogue-object-preview></div><div><h3>${def.label}</h3><div class="meta"><span class="badge">${stateLabel(item)}</span>${item.appearance?html`<span class="badge">Styled</span>`:null}</div>${canList?html`<div class="actions"><input class="price" type="number" min="1" max="1000000" value="25" aria-label="Listing price"><button class="secondary" @click=${(event:Event)=>this.listItem(item,event)}>List for trade</button></div>`:null}</div></article>`;}
  private async load():Promise<void>{this.#loading=true;this.requestUpdate();try{this.#items=await api.inventory();}catch(error){this.#message=messageOf(error);}finally{this.#loading=false;this.requestUpdate();}}
  private async listItem(item:InventoryItemDto,event:Event):Promise<void>{const card=(event.currentTarget as HTMLElement).closest('.item');const input=card?.querySelector('.price');const price=input instanceof HTMLInputElement?Number(input.value):0;try{await api.createListing(item.id,price);this.#message='Item listed in the Marketplace.';await this.load();}catch(error){this.#message=messageOf(error);this.requestUpdate();}}
}
function stateLabel(item:InventoryItemDto):string{return item.state==='inventory'?'In inventory':item.state==='placed'?'Placed in a room':'Marketplace listing';}
function messageOf(error:unknown):string{return error instanceof Error?error.message:'Something went wrong.';}
customElements.define('inventory-page',InventoryPage);
