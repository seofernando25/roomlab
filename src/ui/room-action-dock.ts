import { LitElement, css, html } from 'lit';
import * as THREE from 'three';
import { createRoomDockAsset, disposeRoomDockAsset, type RoomDockAction } from '../rendering/room-dock-assets';

const ACTIONS: readonly { action: RoomDockAction; label: string }[] = [
  { action: 'lobby', label: 'Lobby' },
  { action: 'rooms', label: 'Rooms' },
  { action: 'shop', label: 'Shop' },
  { action: 'items', label: 'Inventory' },
  { action: 'profile', label: 'Profile' },
];

export class RoomActionDock extends LitElement {
  static override styles = css`
    :host{display:block;width:min(390px,calc(100vw - 24px));height:78px;contain:layout}
    .dock{position:relative;width:100%;height:100%;overflow:visible;border:3px solid #17262c;border-radius:8px;background:linear-gradient(#45585b,#32464a);box-shadow:4px 4px 0 rgba(0,0,0,.38),inset 0 0 0 2px #718985}
    canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;image-rendering:pixelated}
    .hit-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(5,1fr)}
    button{position:relative;min-width:0;border:0;background:transparent;cursor:pointer;color:#fff;font:900 9px system-ui;outline:none}
    button::after{content:'';position:absolute;left:8px;right:8px;bottom:5px;height:3px;border-radius:2px;background:transparent;transition:background .1s ease}
    button:hover::after,button:focus-visible::after{background:#f3c85a}
    button:focus-visible{box-shadow:inset 0 0 0 2px #f3c85a}
    .label{position:absolute;left:50%;bottom:calc(100% + 7px);transform:translate(-50%,4px);padding:4px 7px;border:2px solid #17262c;border-radius:4px;background:#e9efed;color:#344a50;box-shadow:2px 2px 0 rgba(0,0,0,.28);opacity:0;pointer-events:none;white-space:nowrap;transition:opacity .08s ease,transform .08s ease}
    button:hover .label,button:focus-visible .label{opacity:1;transform:translate(-50%,0)}
    @media(max-width:600px){:host{width:min(330px,calc(100vw - 20px));height:68px}.dock{border-width:2px}.label{font-size:8px}}
  `;

  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(28, 5, 0.1, 30);
  readonly #assets = new Map<RoomDockAction, THREE.Group>();
  #renderer: THREE.WebGLRenderer | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #frame = 0;
  #hovered: RoomDockAction | null = null;

  override render() {
    return html`<div class="dock" role="toolbar" aria-label="Room navigation">
      <canvas aria-hidden="true"></canvas>
      <div class="hit-grid">${ACTIONS.map(({ action, label }) => html`
        <button aria-label=${label} @mouseenter=${() => this.setHovered(action)} @mouseleave=${this.clearHovered}
          @focus=${() => this.setHovered(action)} @blur=${this.clearHovered} @click=${() => this.activate(action)}>
          <span class="label">${label}</span>
        </button>`)}
      </div>
    </div>`;
  }

  override firstUpdated(): void {
    const canvas = this.renderRoot.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    this.#renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.#camera.position.set(0, 4.2, 7.2);
    this.#camera.lookAt(0, 0.45, 0);
    this.#scene.add(new THREE.HemisphereLight(0xf6fbf8, 0x25343a, 2.1));
    const key = new THREE.DirectionalLight(0xffe7b6, 2.7); key.position.set(-4, 6, 5); this.#scene.add(key);
    ACTIONS.forEach(({ action }, index) => {
      const asset = createRoomDockAsset(action);
      asset.position.x = (index - 2) * 1.35;
      asset.scale.setScalar(0.66);
      asset.rotation.y = -0.36;
      asset.userData.baseX = asset.position.x;
      this.#assets.set(action, asset);
      this.#scene.add(asset);
    });
    this.#resizeObserver = new ResizeObserver(() => this.resize());
    this.#resizeObserver.observe(this);
    this.resize();
    this.renderFrame();
  }

  override disconnectedCallback(): void {
    cancelAnimationFrame(this.#frame);
    this.#resizeObserver?.disconnect(); this.#resizeObserver = null;
    for (const asset of this.#assets.values()) disposeRoomDockAsset(asset);
    this.#assets.clear();
    this.#renderer?.dispose(); this.#renderer = null;
    super.disconnectedCallback();
  }

  private resize(): void {
    const renderer = this.#renderer; if (!renderer) return;
    const width = Math.max(1, this.clientWidth), height = Math.max(1, this.clientHeight);
    renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  private renderFrame = (): void => {
    const time = performance.now() * 0.001;
    for (const [action, asset] of this.#assets) {
      const active = action === this.#hovered;
      const targetY = active ? 0.18 : 0;
      const targetScale = active ? 0.73 : 0.66;
      asset.position.y += (targetY - asset.position.y) * 0.18;
      const scale = asset.scale.x + (targetScale - asset.scale.x) * 0.18;
      asset.scale.setScalar(scale);
      const targetRotation = active ? -0.36 + Math.sin(time * 4) * 0.13 : -0.36;
      asset.rotation.y += (targetRotation - asset.rotation.y) * 0.16;
    }
    if (this.offsetParent !== null) this.#renderer?.render(this.#scene, this.#camera);
    this.#frame = requestAnimationFrame(this.renderFrame);
  };

  private setHovered(action: RoomDockAction): void { this.#hovered = action; this.dataset.hovered = action; }
  private readonly clearHovered = (): void => { this.#hovered = null; delete this.dataset.hovered; };
  private activate(action: RoomDockAction): void {
    this.dispatchEvent(new CustomEvent('room-dock-action', { detail: { action }, bubbles: true, composed: true }));
  }
}

customElements.define('room-action-dock', RoomActionDock);
