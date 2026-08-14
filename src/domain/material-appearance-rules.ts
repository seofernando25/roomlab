import { parseAppearanceComponent, type AppearanceComponent } from './material-design';
import { getEntityPrototype } from './prototype-registry';
import type { PrototypeId } from './types';

export function materialAppearanceError(prototypeId: PrototypeId, value: unknown): string | null {
  const appearance = parseAppearanceComponent(value);
  if (!appearance) return 'Material appearance is malformed or exceeds its complexity limits.';
  const slots = getEntityPrototype(prototypeId).renderable.materialSlots ?? [];
  const allowed = new Set(slots.map((slot) => slot.id));
  for (const slotId of Object.keys(appearance.materials)) {
    if (!allowed.has(slotId)) return `Material slot ${slotId} is not supported by ${prototypeId}.`;
  }
  return null;
}

export function materialAppearanceAllowed(prototypeId: PrototypeId, appearance: AppearanceComponent): boolean {
  return materialAppearanceError(prototypeId, appearance) === null;
}
