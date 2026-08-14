import type { MaterialProgram, MaterialStyle } from './material-design';

export interface MaterialPresetDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly style: MaterialStyle;
}

const style = (program: MaterialProgram, repeatX = 1, repeatY = 1): MaterialStyle => ({ program, repeatX, repeatY });
const program = (baseColor: string, layers: MaterialProgram['layers'], resolution: 16 | 32 | 64 = 32): MaterialProgram => ({
  version: 1,
  resolution,
  baseColor,
  layers,
});

export const MATERIAL_PRESETS: readonly MaterialPresetDefinition[] = [
  {
    id: 'clean-ivory', label: 'Clean Ivory', description: 'A quiet warm solid for cleaner contemporary furniture.',
    style: style(program('#e8e3d8', [])),
  },
  {
    id: 'studio-charcoal', label: 'Studio Charcoal', description: 'A crisp near-black solid with a subtle grid detail.',
    style: style(program('#30383b', [{ kind: 'grid', color: '#667276', opacity: 0.22, spacing: 10, thickness: 1 }])),
  },
  {
    id: 'fine-linen', label: 'Fine Linen', description: 'Soft woven upholstery without noisy pixel clutter.',
    style: style(program('#d9d1c2', [
      { kind: 'grid', color: '#f5f0e7', opacity: 0.34, spacing: 6, thickness: 1 },
      { kind: 'stripes', color: '#8e8477', opacity: 0.12, spacing: 9, thickness: 1, angle: 45 },
    ]), 1.5, 1.5),
  },
  {
    id: 'walnut-grain', label: 'Walnut Grain', description: 'Warm architectural timber with restrained procedural grain.',
    style: style(program('#8b5a3b', [
      { kind: 'grain', color: '#4f3023', opacity: 0.45, spacing: 7, thickness: 1, seed: 91 },
      { kind: 'stripes', color: '#c78a5d', opacity: 0.18, spacing: 14, thickness: 1, angle: 0 },
    ]), 1.3, 1.3),
  },
  {
    id: 'mint-check', label: 'Mint Check', description: 'A friendly small-scale checker for playful rooms.',
    style: style(program('#a9d2c4', [{ kind: 'checker', color: '#6fa995', opacity: 0.52, size: 5 }]), 1.4, 1.4),
  },
  {
    id: 'terracotta-speckle', label: 'Terracotta Speckle', description: 'Warm ceramic-like speckles with deterministic seeded detail.',
    style: style(program('#c97d5d', [
      { kind: 'speckles', color: '#7f493d', opacity: 0.42, density: 0.12, size: 1, seed: 412 },
      { kind: 'speckles', color: '#efb189', opacity: 0.34, density: 0.08, size: 1, seed: 719 },
    ])),
  },
  {
    id: 'navy-pinstripe', label: 'Navy Pinstripe', description: 'A sharper tailored textile for lounge and office pieces.',
    style: style(program('#314a61', [{ kind: 'stripes', color: '#b8d0dc', opacity: 0.46, spacing: 8, thickness: 1, angle: 90 }]), 1.25, 1.25),
  },
  {
    id: 'pixel-dots', label: 'Pixel Dots', description: 'A compact staggered-dot pattern suited to accent pieces.',
    style: style(program('#ead879', [{ kind: 'dots', color: '#a34f5d', opacity: 0.72, spacing: 8, radius: 2, stagger: true }]), 1.2, 1.2),
  },
  {
    id: 'leaf-green', label: 'Leaf Green', description: 'Natural layered green with restrained vein-like grain for foliage.',
    style: style(program('#638e57', [
      { kind: 'grain', color: '#355d3b', opacity: 0.28, spacing: 9, thickness: 1, seed: 233 },
      { kind: 'speckles', color: '#a6c98e', opacity: 0.22, density: 0.08, size: 1, seed: 901 },
    ]), 1.1, 1.1),
  },
] as const;

export function materialPreset(id: string): MaterialPresetDefinition | undefined {
  return MATERIAL_PRESETS.find((preset) => preset.id === id);
}
