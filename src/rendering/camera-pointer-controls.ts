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
  #drag: DragGesture | null = null;

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
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.#canInteract()) return;
    event.preventDefault();
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
    this.#canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId || !this.#canInteract()) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.mode === 'placement') this.#placement.move(event.clientX, event.clientY);
    else this.#camera.panScreen(event.clientX - drag.lastX, event.clientY - drag.lastY, this.#canvas.clientHeight);
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (this.#canvas.hasPointerCapture(event.pointerId)) this.#canvas.releasePointerCapture(event.pointerId);
    this.#drag = null;
    if (drag.mode === 'placement') {
      this.#placement.end(event.clientX, event.clientY);
      return;
    }
    if (!drag.moved && drag.button === 0 && this.#canInteract()) this.#onPrimaryClick(event.clientX, event.clientY);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.#drag?.pointerId !== event.pointerId) return;
    if (this.#drag.mode === 'placement') this.#placement.cancel();
    this.#drag = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.#camera.zoom(event.deltaY);
  };

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();
}
