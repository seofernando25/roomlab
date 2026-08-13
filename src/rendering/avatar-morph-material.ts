import * as THREE from 'three';

export const AVATAR_MORPH_MODES = ['off', 'dither', 'grid-warp', 'pixel-transport'] as const;
export type AvatarMorphMode = (typeof AVATAR_MORPH_MODES)[number];

export function isAvatarMorphMode(value: string): value is AvatarMorphMode {
  return (AVATAR_MORPH_MODES as readonly string[]).includes(value);
}

export function createAvatarMorphMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthTest: true,
    depthWrite: true,
    transparent: false,
    side: THREE.DoubleSide,
    uniforms: {
      uFrom: { value: null },
      uTo: { value: null },
      uProgress: { value: 0 },
      uMode: { value: 2 },
      uTexel: { value: new THREE.Vector2(1 / 64, 1 / 96) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uFrom;
      uniform sampler2D uTo;
      uniform float uProgress;
      uniform int uMode;
      uniform vec2 uTexel;
      varying vec2 vUv;

      float bayer4(vec2 pixel) {
        vec2 p = mod(floor(pixel), 4.0);
        float x = p.x;
        float y = p.y;
        if (y < 0.5) {
          if (x < 0.5) return 0.0 / 16.0;
          if (x < 1.5) return 8.0 / 16.0;
          if (x < 2.5) return 2.0 / 16.0;
          return 10.0 / 16.0;
        }
        if (y < 1.5) {
          if (x < 0.5) return 12.0 / 16.0;
          if (x < 1.5) return 4.0 / 16.0;
          if (x < 2.5) return 14.0 / 16.0;
          return 6.0 / 16.0;
        }
        if (y < 2.5) {
          if (x < 0.5) return 3.0 / 16.0;
          if (x < 1.5) return 11.0 / 16.0;
          if (x < 2.5) return 1.0 / 16.0;
          return 9.0 / 16.0;
        }
        if (x < 0.5) return 15.0 / 16.0;
        if (x < 1.5) return 7.0 / 16.0;
        if (x < 2.5) return 13.0 / 16.0;
        return 5.0 / 16.0;
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(0.1031, 0.1030));
        p += dot(p, p.yx + 33.33);
        return fract((p.x + p.y) * p.x);
      }

      vec2 nearestUv(vec2 uv) {
        vec2 pixel = floor(uv / uTexel) + 0.5;
        return clamp(pixel * uTexel, uTexel * 0.5, vec2(1.0) - uTexel * 0.5);
      }

      vec2 gridWarp(vec2 uv, float phase, float direction) {
        vec2 gridSize = vec2(8.0, 12.0);
        vec2 cell = (floor(uv * gridSize) + 0.5) / gridSize;
        vec2 p = cell - 0.5;
        return vec2(direction * (0.028 + abs(p.y) * 0.020), -direction * p.x * 0.024) * phase;
      }

      void main() {
        float t = clamp(uProgress, 0.0, 1.0);
        float phase = sin(3.14159265359 * t);
        float direction = 1.0;
        vec2 fromUv = vUv;
        vec2 toUv = vUv;

        if (uMode == 2) {
          vec2 flow = gridWarp(vUv, phase, direction);
          fromUv += flow * t;
          toUv -= flow * (1.0 - t);
        }

        vec4 fromColor = texture2D(uFrom, nearestUv(fromUv));
        vec4 toColor = texture2D(uTo, nearestUv(toUv));
        vec4 color;
        float threshold = bayer4(gl_FragCoord.xy);
        color = t > threshold ? toColor : fromColor;
        if (color.a < 0.10) discard;
        gl_FragColor = vec4(color.rgb, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function avatarMorphModeId(mode: AvatarMorphMode): number {
  if (mode === 'dither') return 1;
  if (mode === 'grid-warp') return 2;
  return 0;
}
