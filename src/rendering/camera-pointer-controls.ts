import type { IsometricCameraController } from './isometric-camera';

interface DragGesture {
  readonly pointerId: number;
  readonly button: number;
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  mode: 'camera' | 'placement';
}

interface PointerPosition { readonly x: number; readonly y: number; }
interface PinchGesture {
  readonly firstId: number;
  readonly secondId: number;
  lastDistance: number;
  lastMidX: number;
  lastMidY: number;
}

interface PrimaryPlacementCallbacks {
  readonly begin: (clientX: number, clientY: number) => boolean;
  readonly move: (clientX: number, clientY: number) => void;
  readonly end: (clientX: number, clientY: number) => void;
  readonly cancel: () => void;
}

export class CameraPointerControls {
  readonly #canvas: HTMLCanvasElement;
  readonly #camera: IsometricCameraController;
  readonly #canInteract: () => boolean;
  readonly #onPrimaryClick: (clientX: number, clientY: number) => void;
  readonly #placement: PrimaryPlacementCallbacks;
  readonly #pointers = new Map<number, PointerPosition>();
  #drag: DragGesture | null = null;
  #pinch: PinchGesture | null = null;
  #suppressTapUntilClear = false;

  constructor(
    canvas: HTMLCanvasElement,
    camera: IsometricCameraController,
    canInteract: () => boolean,
    onPrimaryClick: (clientX: number, clientY: number) => void,
    placement: PrimaryPlacementCallbacks,
  ) {
    this.#canvas = canvas;
    this.#camera = camera;
    this.#canInteract = canInteract;
    this.#onPrimaryClick = onPrimaryClick;
    this.#placement = placement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  dispose(): void {
    this.#canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.#canvas.removeEventListener('pointermove', this.onPointerMove);
    this.#canvas.removeEventListener('pointerup', this.onPointerUp);
    this.#canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.#canvas.removeEventListener('wheel', this.onWheel);
    this.#canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.#pointers.clear();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.#canInteract()) return;
    event.preventDefault();
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.#canvas.setPointerCapture(event.pointerId);

    if (event.pointerType === 'touch' && this.#pointers.size >= 2) {
      if (this.#drag?.mode === 'placement') this.#placement.cancel();
      this.#drag = null;
      this.#suppressTapUntilClear = true;
      this.beginPinch();
      return;
    }
    if (this.#pinch) return;

    const mode = event.button === 0 && this.#placement.begin(event.clientX, event.clientY)
      ? 'placement'
      : 'camera';
    this.#drag = {
      pointerId: event.pointerId,
      button: event.button,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      mode,
    };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.#pointers.has(event.pointerId)) this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!this.#canInteract()) return;
    if (this.#pinch && (event.pointerId === this.#pinch.firstId || event.pointerId === this.#pinch.secondId)) {
      event.preventDefault();
      this.updatePinch();
      return;
    }
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.mode === 'placement') this.#placement.move(event.clientX, event.clientY);
    else this.#camera.panScreen(event.clientX - drag.lastX, event.clientY - drag.lastY, this.#canvas.clientHeight);
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    event.preventDefault();
    if (this.#canvas.hasPointerCapture(event.pointerId)) this.#canvas.releasePointerCapture(event.pointerId);
    this.#pointers.delete(event.pointerId);
    if (this.#pinch) {
      this.#pinch = null;
      this.#drag = null;
      if (this.#pointers.size === 0) this.#suppressTapUntilClear = false;
      return;
    }
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      if (this.#pointers.size === 0) this.#suppressTapUntilClear = false;
      return;
    }
    this.#drag = null;
    if (drag.mode === 'placement') this.#placement.end(event.clientX, event.clientY);
    else if (!drag.moved && drag.button === 0 && !this.#suppressTapUntilClear && this.#canInteract()) {
      this.#onPrimaryClick(event.clientX, event.clientY);
    }
    if (this.#pointers.size === 0) this.#suppressTapUntilClear = false;
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.#pointers.delete(event.pointerId);
    if (this.#pinch) {
      this.#pinch = null;
      this.#drag = null;
    } else if (this.#drag?.pointerId === event.pointerId) {
      if (this.#drag.mode === 'placement') this.#placement.cancel();
      this.#drag = null;
    }
    if (this.#pointers.size === 0) this.#suppressTapUntilClear = false;
  };

  private beginPinch(): void {
    const entries = [...this.#pointers.entries()].slice(0, 2);
    const first = entries[0];
    const second = entries[1];
    if (!first || !second) return;
    const metrics = pinchMetrics(first[1], second[1]);
    this.#pinch = {
      firstId: first[0], secondId: second[0],
      lastDistance: metrics.distance, lastMidX: metrics.midX, lastMidY: metrics.midY,
    };
  }

  private updatePinch(): void {
    const pinch = this.#pinch;
    if (!pinch) return;
    const first = this.#pointers.get(pinch.firstId);
    const second = this.#pointers.get(pinch.secondId);
    if (!first || !second) return;
    const metrics = pinchMetrics(first, second);
    this.#camera.panScreen(metrics.midX - pinch.lastMidX, metrics.midY - pinch.lastMidY, this.#canvas.clientHeight);
    if (pinch.lastDistance > 4 && metrics.distance > 4) this.#camera.zoomByFactor(pinch.lastDistance / metrics.distance);
    pinch.lastDistance = metrics.distance;
    pinch.lastMidX = metrics.midX;
    pinch.lastMidY = metrics.midY;
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.#camera.zoom(event.deltaY);
  };

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();
}

function pinchMetrics(first: PointerPosition, second: PointerPosition) {
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    midX: (first.x + second.x) / 2,
    midY: (first.y + second.y) / 2,
  };
}
