import { LitElement, html, nothing } from 'lit';
import {
  CATALOGUE_OBJECT_CATEGORIES,
  getCatalogueObjectCategory,
  listCatalogueObjects,
  type CatalogueObjectId,
} from '../domain/catalogue-registry';
import { FLOOR_FINISHES, WALL_FINISHES } from '../domain/room-finishes';
import { MAX_PLACEMENT_Y, MIN_PLACEMENT_Y, normalizeY } from '../domain/room-topology';
import type { EditorState, EntityId, FloorFinishId, RoomEditorTool, WallFinishId, WorldState } from '../domain/types';
import { teleporterPairs } from '../gameplay/teleporter-editor';
import type { InventoryItemDto } from '../online/types';
import { catalogueExplorerStyles } from './catalogue-explorer.styles';
import './catalogue-object-preview';
import './hotel-panel';

type Section='objects'|'floor'|'walls'|'travel';
type ObjectCategory='all'|(typeof CATALOGUE_OBJECT_CATEGORIES)[number]['id'];

export class CatalogueExplorer extends LitElement {
  static override properties={world:{attribute:false},editor:{attribute:false},inventory:{attribute:false},section:{state:true},search:{state:true},category:{state:true}};
  static override styles=catalogueExplorerStyles;
  declare world:WorldState;
  declare editor:EditorState;
  declare inventory:readonly InventoryItemDto[]|null;
  declare section:Section;
  declare search:string;
  declare category:ObjectCategory;

  constructor(){
    super();
    this.world={id:'',revision:0,topology:{cells:[],walls:[]},entities:[]};
    this.editor={selectedEntityId:null,tool:'select',placementY:0,floorFinish:'wood',wallFinish:'cream-brick',pendingAnchor:null,placementPrototypeId:null,placementRotation:0,placementAppearance:null};
    this.inventory=null;this.section='objects';this.search='';this.category='all';
  }

  override render(){
    return html`<hotel-panel heading="Catalogue" tone="blue">
      <button slot="actions" class="close" title="Close Catalogue" @click=${this.close}>×</button>
      <div class="layout">
        <nav class="rail" aria-label="Catalogue sections">
          ${this.sectionButton('objects','◆','Objects')}${this.sectionButton('floor','▦','Floor')}${this.sectionButton('walls','▥','Walls')}${this.sectionButton('travel','↔','Travel')}
          <button @click=${this.openMaterials}><span class="mark">▧</span>Materials</button>
        </nav>
        <main class="main">${this.renderPlacementPlane()}${this.section==='objects'?this.renderObjects():this.section==='floor'?this.renderFloor():this.section==='walls'?this.renderWalls():this.renderTravel()}</main>
      </div>
    </hotel-panel>`;
  }

  private renderPlacementPlane(){
    return html`<section class="height-context placement-plane" aria-label="Virtual placement plane">
      <div class="height-heading">
        <span><strong>Placement plane</strong><small>Y ${formatY(this.editor.placementY)}</small></span>
        <input class="height-input plane-number" type="number" min=${MIN_PLACEMENT_Y} max=${MAX_PLACEMENT_Y} step="0.05" .value=${formatY(this.editor.placementY)} aria-label="Placement plane Y" @change=${this.setPlacementFromInput} />
      </div>
      <input class="plane-slider" type="range" min=${MIN_PLACEMENT_Y} max=${MAX_PLACEMENT_Y} step="0.05" .value=${String(this.editor.placementY)} aria-label="Placement plane Y slider" @input=${this.setPlacementFromSlider} />
    </section>`;
  }

  private renderObjects(){
    const query=this.search.trim().toLowerCase(),inventoryByPrototype=this.availableInventory();
    const objects=listCatalogueObjects().filter(object=>{
      if(this.inventory&&!(inventoryByPrototype.get(object.id)?.length))return false;
      if(this.category!=='all'&&object.category!==this.category)return false;
      return !query||[object.label,object.description,...object.tags,getCatalogueObjectCategory(object.category).label].join(' ').toLowerCase().includes(query);
    });
    return html`<div class="toolbar"><input type="search" placeholder="Search objects…" .value=${this.search} @input=${this.onSearch}/><select .value=${this.category} @change=${this.onCategory} aria-label="Object category"><option value="all">All objects</option>${CATALOGUE_OBJECT_CATEGORIES.map(category=>html`<option value=${category.id}>${category.label}</option>`)}</select></div>
      <div class="grid">${objects.length?objects.map(object=>{const items=inventoryByPrototype.get(object.id)??[],item=items[0];return html`<div class="object-wrap"><button class="object-card ${this.editor.tool==='place-prototype'&&this.editor.placementPrototypeId===object.id?'active':''}" @click=${()=>this.placeObject(object.id as CatalogueObjectId,item?.id)} title=${object.description}><span class="preview"><catalogue-object-preview .prototypeId=${object.id} .appearance=${item?.appearance??null}></catalogue-object-preview><span class="footprint-badge" title="${object.placement.footprint.width}×${object.placement.footprint.depth} footprint">${footprintPreview(object.placement.footprint.width,object.placement.footprint.depth)}</span></span><span><span class="name">${object.label}</span><span class="meta">${getCatalogueObjectCategory(object.category).shortLabel} · ${object.placement.footprint.width}×${object.placement.footprint.depth}${this.inventory?` · ${items.length} owned`:''}</span></span></button></div>`;}):html`<div class="empty">No Catalogue objects match.</div>`}</div>`;
  }

  private renderFloor(){return html`
    <div class="section-title">Floor slabs</div><div class="tools">${this.tool('floor-shape','Slab','Place or remove floating tiles')}${this.tool('floor-raise','Raise','Move slab up 0.25')}${this.tool('floor-lower','Lower','Move slab down 0.25')}</div>
    <div class="section-title" style="margin-top:9px">Floor finishes</div><div class="finishes">${FLOOR_FINISHES.map(finish=>html`<button class="finish ${this.editor.tool==='floor-paint'&&this.editor.floorFinish===finish.id?'active':''}" @click=${()=>this.chooseFloorFinish(finish.id)} title=${finish.description}><span class="swatch" style="background:#${finish.color.toString(16).padStart(6,'0')}"></span><span>${finish.label}</span></button>`)}</div>`;}

  private renderWalls(){return html`
    <div class="section-title">Walls</div><div class="tools">${this.tool('wall-shape','Wall line','Place or remove a straight line')}</div>
    <div class="section-title" style="margin-top:9px">Wall finishes</div><div class="finishes">${WALL_FINISHES.map(finish=>html`<button class="finish ${this.editor.tool==='wall-paint'&&this.editor.wallFinish===finish.id?'active':''}" @click=${()=>this.chooseWallFinish(finish.id)} title=${finish.description}><span class="swatch" style="background:#${finish.color.toString(16).padStart(6,'0')}"></span><span>${finish.label}</span></button>`)}</div>`;}

  private renderTravel(){
    const pairs=teleporterPairs(this.world);
    return html`<div class="pairing"><div><strong>Linked teleporters</strong><span>${this.editor.pendingAnchor?'Entrance A selected':'A ↔ B'}</span></div><button class="action primary" @click=${this.togglePairing}>${this.editor.tool==='teleport-pair'?'Cancel':'Link pair'}</button></div>
      ${this.editor.tool==='teleport-pair'&&this.editor.pendingAnchor?html`<div class="hint"><strong>A</strong> · Y ${formatY(this.editor.pendingAnchor.y)} · ${coord(this.editor.pendingAnchor.position)}</div>`:nothing}
      <div class="pair-list">${pairs.length?pairs.map((pair,index)=>html`<div class="pair" @mouseenter=${()=>this.focusPair(pair.first.id)} @mouseleave=${()=>this.focusPair(null)}><div><strong>Pair ${index+1}</strong><span>${this.endpointLabel(pair.first)} ↔ ${this.endpointLabel(pair.second)}</span></div><button class="remove" @click=${()=>this.removePair(pair.first.id)}>Remove</button></div>`):html`<div class="empty">No teleport pairs yet.</div>`}</div>`;
  }

  private sectionButton(section:Section,mark:string,label:string){return html`<button class=${this.section===section?'active':''} @click=${()=>this.changeSection(section)}><span class="mark">${mark}</span>${label}</button>`;}
  private tool(tool:RoomEditorTool,label:string,meta:string){return html`<button class="tool-card ${this.editor.tool===tool?'active':''}" @click=${()=>this.setTool(tool)}><strong>${label}</strong>${meta}</button>`;}
  private placeObject(prototypeId:CatalogueObjectId,itemInstanceId?:string):void{emit(this,'catalogue-place-object',{prototypeId,...(itemInstanceId?{itemInstanceId}:{})});}
  private readonly openMaterials=():void=>emit(this,'catalogue-open-materials',{});
  private chooseFloorFinish(finish:FloorFinishId):void{emit(this,'catalogue-floor-finish',{finish});}
  private chooseWallFinish(finish:WallFinishId):void{emit(this,'catalogue-wall-finish',{finish});}
  private setTool(tool:RoomEditorTool):void{emit(this,'catalogue-tool',{tool});}
  private readonly togglePairing=():void=>this.setTool(this.editor.tool==='teleport-pair'?'select':'teleport-pair');
  private readonly setPlacementFromInput=(event:Event):void=>this.setPlacementY(Number((event.currentTarget as HTMLInputElement).value));
  private readonly setPlacementFromSlider=(event:Event):void=>this.setPlacementY(Number((event.currentTarget as HTMLInputElement).value));
  private setPlacementY(y:number):void{emit(this,'catalogue-placement-y',{y:normalizeY(y)});}
  private removePair(id:EntityId):void{emit(this,'catalogue-remove-teleport',{id});}
  private focusPair(id:EntityId|null):void{emit(this,'catalogue-teleport-focus',{id});}
  private readonly close=():void=>emit(this,'catalogue-close',{});
  private readonly onSearch=(event:Event):void=>{this.search=(event.currentTarget as HTMLInputElement).value;};
  private readonly onCategory=(event:Event):void=>{this.category=(event.currentTarget as HTMLSelectElement).value as ObjectCategory;};
  private availableInventory():Map<string,InventoryItemDto[]>{const result=new Map<string,InventoryItemDto[]>();for(const item of this.inventory??[]){if(item.state!=='inventory')continue;result.set(item.prototypeId,[...(result.get(item.prototypeId)??[]),item]);}return result;}
  private changeSection(section:Section):void{this.section=section;const tool=this.editor.tool;if(section==='objects'&&tool!=='select'&&tool!=='place-prototype')this.setTool('select');if(section==='floor'&&!isFloorTool(tool))this.setTool('floor-shape');if(section==='walls'&&!isWallTool(tool))this.setTool('wall-shape');if(section==='travel'&&tool!=='teleport-pair')this.setTool('select');}
  private endpointLabel(entity:{components:{transform:{y:number;position:{x:number;z:number}}}}):string{const transform=entity.components.transform;return `Y ${formatY(transform.y)} · ${coord(transform.position)}`;}
}

customElements.define('catalogue-explorer',CatalogueExplorer);
function emit<T>(target:HTMLElement,name:string,detail:T):void{target.dispatchEvent(new CustomEvent<T>(name,{detail,bubbles:true,composed:true}));}
function footprintPreview(width:number,depth:number){return html`<span class="footprint" style="grid-template-columns:repeat(${width},12px)">${Array.from({length:width*depth},()=>html`<i></i>`)}</span>`;}
function coord(position:{x:number;z:number}):string{return`${position.x},${position.z}`;}
function formatY(value:number):string{return normalizeY(value).toFixed(2);}
function isFloorTool(tool:RoomEditorTool):boolean{return['floor-shape','floor-paint','floor-raise','floor-lower'].includes(tool);}
function isWallTool(tool:RoomEditorTool):boolean{return tool==='wall-shape'||tool==='wall-paint';}
