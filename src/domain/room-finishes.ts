import type { FloorFinishId, WallFinishId } from './types';

export interface FloorFinishDefinition {
  readonly id: FloorFinishId;
  readonly label: string;
  readonly description: string;
  readonly color: number;
  readonly pattern: 'woodFloor' | 'tile' | 'rug';
}

export interface WallFinishDefinition {
  readonly id: WallFinishId;
  readonly label: string;
  readonly description: string;
  readonly color: number;
  readonly pattern: 'brick' | 'wallpaper';
}

export const FLOOR_FINISHES: readonly FloorFinishDefinition[] = [
  { id: 'wood', label: 'Warm wood', description: 'Classic warm planks for living spaces.', color: 0xffffff, pattern: 'woodFloor' },
  { id: 'cream-tile', label: 'Cream tile', description: 'Clean ceramic tile for kitchens and baths.', color: 0xf2e0cf, pattern: 'tile' },
  { id: 'terracotta', label: 'Terracotta', description: 'Warm red-orange tile with stronger contrast.', color: 0xd68767, pattern: 'tile' },
  { id: 'slate', label: 'Slate', description: 'Cool grey-blue tile for modern rooms.', color: 0x7e9296, pattern: 'tile' },
  { id: 'mint-carpet', label: 'Mint carpet', description: 'Soft patterned floor for lounges and bedrooms.', color: 0x75b9a4, pattern: 'rug' },
] as const;

export const WALL_FINISHES: readonly WallFinishDefinition[] = [
  { id: 'cream-brick', label: 'Cream brick', description: 'Warm masonry with visible mortar.', color: 0xfff4e9, pattern: 'brick' },
  { id: 'mint-wallpaper', label: 'Mint wallpaper', description: 'Light geometric wallpaper.', color: 0xe1f1df, pattern: 'wallpaper' },
  { id: 'warm-plaster', label: 'Warm plaster', description: 'Subtle warm plaster pattern.', color: 0xe8cfc1, pattern: 'wallpaper' },
  { id: 'blue-panel', label: 'Blue panel', description: 'Cool blue patterned wall finish.', color: 0xb8d7df, pattern: 'wallpaper' },
] as const;

export function getFloorFinish(id: FloorFinishId): FloorFinishDefinition {
  const finish = FLOOR_FINISHES.find((entry) => entry.id === id);
  if (!finish) throw new Error(`Unknown floor finish: ${id}`);
  return finish;
}

export function getWallFinish(id: WallFinishId): WallFinishDefinition {
  const finish = WALL_FINISHES.find((entry) => entry.id === id);
  if (!finish) throw new Error(`Unknown wall finish: ${id}`);
  return finish;
}
