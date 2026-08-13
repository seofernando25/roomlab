import { isCatalogueObjectId } from '../domain/catalogue-registry';
import { entityById } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import { nextRotation } from '../domain/world-state';
import type { RoomGameNetwork } from '../online/game-network';
import type { ActorMotionSystem } from '../gameplay/actor-motion-system';
import type { IsometricCameraController } from './isometric-camera';
import type { RoomInteractionMode } from './room-interaction-controller';

export class RoomKeyboardControls {
  constructor(
    private readonly store: GameStore,
    private readonly camera: IsometricCameraController,
    private readonly player: ActorMotionSystem,
    private readonly network: RoomGameNetwork | null,
    private readonly mode: () => RoomInteractionMode,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyQ' || event.code === 'KeyE') {
      if (event.repeat && this.camera.turnMode !== 'free') return;
      this.camera.beginTurn(event.code === 'KeyQ' ? -1 : 1);
      return;
    }
    if (this.mode() !== 'edit') {
      if (event.code === 'Escape') this.player.cancelMovement();
      return;
    }
    if (event.code === 'KeyR' && this.store.editorState.tool === 'place-prototype') {
      this.store.dispatchEditor({ type: 'placement-rotation/set', rotation: nextRotation(this.store.editorState.placementRotation) });
      return;
    }
    if (this.store.editorState.tool === 'select') this.handleSelectionKey(event);
    else if (event.code === 'Escape') this.store.dispatchEditor({ type: 'tool/set', tool: 'select' });
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'KeyQ') this.camera.endTurn(-1);
    if (event.code === 'KeyE') this.camera.endTurn(1);
  };

  private readonly onBlur = (): void => this.camera.endTurn();

  private handleSelectionKey(event: KeyboardEvent): void {
    const selectedId = this.store.editorState.selectedEntityId;
    const entity = selectedId ? entityById(this.store.state, selectedId) : undefined;
    if (event.code === 'KeyR' && entity && isCatalogueObjectId(entity.prototypeId)) {
      this.store.dispatch({ type: 'transform/rotate', id: entity.id, rotation: nextRotation(entity.components.transform.rotation) });
    }
    if (event.code === 'Escape') this.store.dispatchEditor({ type: 'selection/set', id: null });
    if ((event.code === 'Delete' || event.code === 'Backspace') && entity && isCatalogueObjectId(entity.prototypeId)) {
      const result = this.store.dispatch({ type: 'entity/remove', id: entity.id });
      if (result.accepted) this.network?.pickup(entity.id);
    }
  }
}
