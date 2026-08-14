import { parseMaterialStyle, type MaterialStyle } from '../domain/material-design';

const STORAGE_KEY = 'roomlab.material-presets.v1';
const MAX_SAVED = 24;

export interface SavedMaterialPreset {
  readonly id: string;
  readonly name: string;
  readonly style: MaterialStyle;
  readonly createdAt: string;
}

export function loadSavedMaterialPresets(): readonly SavedMaterialPreset[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    const raw = JSON.parse(value);
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.createdAt !== 'string') return [];
      const style = parseMaterialStyle(entry.style);
      const name = cleanName(entry.name);
      return style && name ? [{ id: entry.id.slice(0, 64), name, style, createdAt: entry.createdAt }] : [];
    }).slice(0, MAX_SAVED);
  } catch { return []; }
}

export function saveMaterialPreset(name: string, style: MaterialStyle): readonly SavedMaterialPreset[] {
  const normalized = cleanName(name);
  if (!normalized) throw new Error('Give this pattern a short name first.');
  const parsed = parseMaterialStyle(style);
  if (!parsed) throw new Error('This material recipe is not valid.');
  const prior = loadSavedMaterialPresets();
  const entry: SavedMaterialPreset = { id: crypto.randomUUID(), name: normalized, style: parsed, createdAt: new Date().toISOString() };
  const next = [entry, ...prior].slice(0, MAX_SAVED);
  persist(next);
  return next;
}

export function removeMaterialPreset(id: string): readonly SavedMaterialPreset[] {
  const next = loadSavedMaterialPresets().filter((entry) => entry.id !== id);
  persist(next);
  return next;
}

function persist(entries: readonly SavedMaterialPreset[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
  catch { throw new Error('Your browser could not save another pattern locally.'); }
}
function cleanName(value: string): string { return value.trim().replace(/\s+/g, ' ').slice(0, 32); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
