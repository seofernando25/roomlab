import { LitElement, css, html, nothing } from 'lit';
import './hotel-panel';

export interface SelectionCapabilityChip { readonly label: string; }

export class SelectionInspector extends LitElement {
  static override properties = { label: { type: String }, meta: { type: String }, capabilities: { attribute: false } };
  static override styles = css`
    :host{display:block}.title{font-size:12px;font-weight:950;color:#324b50}.meta{margin-top:3px;color:#718084;font-size:8px;line-height:1.3}.chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}.chip{padding:3px 5px;border-radius:999px;background:#dce9df;color:#456454;font-size:7px;font-weight:900}.row{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap}.row button{min-height:34px;border:2px solid #71827e;border-radius:5px;background:#edf2f0;color:#40565b;font:900 8px inherit;padding:0 9px;cursor:pointer}.row .danger{border-color:#6d4649;background:#995f63;color:white}@media(max-width:680px){.row button{min-height:44px;flex:1 1 92px}}
  `;
  declare label: string;
  declare meta: string;
  declare capabilities: readonly SelectionCapabilityChip[];
  constructor(){super();this.label='';this.meta='';this.capabilities=[];}
  override render(){return html`<hotel-panel heading="Selected" tone="green" compact><div class="title">${this.label}</div><div class="meta">${this.meta}</div>${this.capabilities.length?html`<div class="chips">${this.capabilities.map((capability)=>html`<span class="chip">${capability.label}</span>`)}</div>`:nothing}<div class="row"><button @click=${()=>this.emit('selection-rotate')}>Rotate 90°</button><button class="danger" @click=${()=>this.emit('selection-pickup')}>Pick up</button></div></hotel-panel>`;}
  private emit(type:string):void{this.dispatchEvent(new CustomEvent(type,{bubbles:true,composed:true}));}
}
customElements.define('selection-inspector',SelectionInspector);
