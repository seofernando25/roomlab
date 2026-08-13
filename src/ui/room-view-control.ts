import { html, nothing } from 'lit';
import { CAMERA_TURN_MODES, type CameraTurnMode } from '../rendering/isometric-camera';
import { AVATAR_MORPH_MODES, type AvatarMorphMode } from '../rendering/avatar-morph-material';

export interface RoomViewControlOptions {
  readonly open: boolean;
  readonly turnMode: CameraTurnMode;
  readonly morphMode: AvatarMorphMode;
  readonly toggle: () => void;
  readonly setTurnMode: (mode: CameraTurnMode) => void;
  readonly setMorphMode: (mode: AvatarMorphMode) => void;
  readonly beginTurn: (direction: -1 | 1) => void;
  readonly endTurn: (direction?: -1 | 1) => void;
}

export function roomViewControl(options: RoomViewControlOptions) {
  return html`<div class="view-control">
    <button class="view-open" @click=${options.toggle} aria-expanded=${options.open ? 'true' : 'false'}>View ▾</button>
    ${options.open ? html`<div class="view-menu">
      <label><span>Camera</span><select class="turn-select" .value=${options.turnMode} @change=${(event: Event) => options.setTurnMode((event.currentTarget as HTMLSelectElement).value as CameraTurnMode)}>
        ${CAMERA_TURN_MODES.map((mode) => html`<option value=${mode}>${cameraLabel(mode)}</option>`)}
      </select></label>
      <label><span>Avatar turn</span><select class="morph-select" .value=${options.morphMode} @change=${(event: Event) => options.setMorphMode((event.currentTarget as HTMLSelectElement).value as AvatarMorphMode)}>
        ${AVATAR_MORPH_MODES.map((mode) => html`<option value=${mode}>${morphLabel(mode)}</option>`)}
      </select></label>
      <div class="view-turn-row"><span>Rotate view</span><div><button title="Rotate camera left" @pointerdown=${() => options.beginTurn(-1)} @pointerup=${() => options.endTurn(-1)} @pointercancel=${() => options.endTurn(-1)}>↺</button><button title="Rotate camera right" @pointerdown=${() => options.beginTurn(1)} @pointerup=${() => options.endTurn(1)} @pointercancel=${() => options.endTurn(1)}>↻</button></div></div>
    </div>` : nothing}
  </div>`;
}

function cameraLabel(mode: CameraTurnMode): string { return mode === 'free' ? 'Free' : mode === 'snap-45' ? '45° snap' : '90° snap'; }
function morphLabel(mode: AvatarMorphMode): string { return mode === 'off' ? 'Off' : mode === 'dither' ? 'Dither' : mode === 'grid-warp' ? 'Grid warp' : 'Pixel transport'; }
