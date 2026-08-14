import type { PrototypeCapabilityKey } from '../domain/prototype-components';

export function capabilityUiLabel(key: PrototypeCapabilityKey, fallback: string): string {
  if (key === 'sit') return 'Can sit';
  if (key === 'surface') return 'Supports objects';
  if (key === 'traversal') return 'Walkable piece';
  if (key === 'teleport') return 'Teleporter';
  if (key === 'toggle') return 'Has states';
  if (key === 'gate') return 'Gate';
  return fallback;
}
