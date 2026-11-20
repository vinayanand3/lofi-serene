import * as THREE from 'three';

/**
 * Volumetric Tea / Chai / Coffee Steam — smooth curled FBM wisps rising upward.
 */
export function createSteamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uSwirl: { value: 0 },
      uOpacity: { value: 0.42 },
      uSurfaceSource: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uSwirl;
      uniform float uOpacity;
      uniform float uSurfaceSource;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.5);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.1 + vec2(5.2, 1.3);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = vUv;
        float drift = sin(uv.y * 5.2 - uTime * 1.15) * (0.08 + uSwirl * 0.14) * uv.y;
        vec2 p = vec2((uv.x - 0.5 + drift) * 3.4, uv.y * 2.8 - uTime * 0.42);

        float n1 = fbm(p);
        float n2 = fbm(p * 1.6 + vec2(n1 * 0.8, -uTime * 0.18));
        float wisp = smoothstep(0.38, 0.82, n2);

        float halfWidth = mix(0.20, 0.46, uv.y);
        float xFade = 1.0 - smoothstep(halfWidth * 0.35, halfWidth, abs(uv.x - 0.5 + drift * 0.5));
        float yFade = smoothstep(0.0, 0.16, uv.y) * (1.0 - smoothstep(0.55, 1.0, uv.y));

        float sourceFade = smoothstep(0.0, 0.05, uv.y);
        float sourceX = (uv.x - 0.5 + drift) / mix(0.08, 0.19, uv.y);
        float sourceCore = exp(-sourceX * sourceX)
                         * (1.0 - smoothstep(0.08, 0.53, uv.y)) * 0.48;
        float attachedWisp = max(wisp * xFade * yFade, sourceCore * sourceFade);
        float alpha = mix(wisp * xFade * yFade, attachedWisp, uSurfaceSource) * uOpacity;
        if (alpha < 0.004) discard;

        vec3 col = mix(vec3(0.95, 0.90, 0.82), vec3(0.84, 0.88, 0.96), uv.y * 0.55);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * Floating 3D Valley Mist / Forest Fog / Himalayan Cloud Sea Veil.
 */
export function createMistVeilMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x9cb4d4) },
      uOpacity: { value: 0.18 },
      uSpeed: { value: 0.024 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSpeed;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        float edgeX = smoothstep(0.0, 0.22, vUv.x) * (1.0 - smoothstep(0.78, 1.0, vUv.x));
        float edgeY = smoothstep(0.0, 0.30, vUv.y) * (1.0 - smoothstep(0.70, 1.0, vUv.y));
        float n1 = fbm(vec2(vUv.x * 3.4 - uTime * uSpeed, vUv.y * 2.4 + sin(uTime * 0.12) * 0.12));
        float n2 = fbm(vec2(vUv.x * 5.2 - uTime * uSpeed * 1.45 + 4.1, vUv.y * 3.2));
        float a = smoothstep(0.28, 0.76, n1 * 0.65 + n2 * 0.35) * edgeX * edgeY * uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

/**
 * Live GLSL Falling Rain Sheet — renders in 3D space BEHIND indoor veranda/window
 * foreground layers (z = 0.08) and gated by depth_map so indoor benches stay 100% dry.
 */
export function createRainSheetMaterial(depthTexture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.0 },
      uDepthMap: { value: depthTexture },
      uTint: { value: new THREE.Color(0xbcd8eb) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uIntensity;
      uniform sampler2D uDepthMap;
      uniform vec3 uTint;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float rainLayer(vec2 uv, float cols, float rows, float speed, float slant) {
        vec2 st = vec2(uv.x + uv.y * slant, uv.y);
        st.x *= cols;
        st.y *= rows;
        float colId = floor(st.x);
        float colRnd = hash(vec2(colId, cols));
        st.y += uTime * speed * (0.75 + colRnd * 0.55) + colRnd * 19.0;

        float rowId = floor(st.y);
        float dropRnd = hash(vec2(colId, rowId));
        if (dropRnd < 0.52) return 0.0;

        vec2 f = fract(st);
        float xCenter = 0.25 + fract(dropRnd * 13.7) * 0.5;
        float dx = abs(f.x - xCenter);
        float streak = smoothstep(0.085, 0.0, dx) * smoothstep(0.0, 0.25, f.y) * smoothstep(1.0, 0.2, f.y);
        return streak * (0.5 + 0.5 * dropRnd);
      }

      void main() {
        if (uIntensity < 0.01) discard;

        // Smart depth stencil: keep close indoor foreground dry
        float d = texture2D(uDepthMap, vUv).r;
        float outdoorMask = smoothstep(0.56, 0.34, d);
        if (outdoorMask < 0.01) discard;

        float r1 = rainLayer(vUv, 52.0, 6.5, 4.8, 0.10);
        float r2 = rainLayer(vUv, 84.0, 10.0, 3.6, 0.08) * 0.65;
        float r3 = rainLayer(vUv, 120.0, 14.0, 2.7, 0.06) * 0.42;

        float alpha = (r1 + r2 + r3) * outdoorMask * uIntensity * 0.34;
        if (alpha < 0.005) discard;

        gl_FragColor = vec4(uTint, alpha);
      }
    `,
  });
}

/**
 * Interactive Bioluminescent Fireflies — soft bokeh particles drifting in 3D space.
 */
export function createFirefliesMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uPointer: { value: new THREE.Vector2(99, 99) },
      uReducedMotion: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aScale;
      attribute float aSpeed;

      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec2 uPointer;
      uniform float uReducedMotion;

      varying float vGlow;
      varying float vPhase;

      void main() {
        vPhase = aPhase;
        float m = 1.0 - uReducedMotion;
        vec3 pos = position;

        float t = uTime * aSpeed * m + aPhase * 12.0;
        pos.x += sin(t * 0.72 + aPhase * 6.28) * 0.26 * m;
        pos.y += cos(t * 0.55 + aPhase * 4.13) * 0.18 * m + sin(t * 0.28) * 0.08 * m;
        pos.z += sin(t * 0.41 + aPhase * 2.5) * 0.12 * m;

        vec2 toPtr = pos.xy - uPointer;
        float dist = length(toPtr);
        if (dist < 1.15 && dist > 0.001) {
          float push = (1.0 - dist / 1.15) * 0.22 * m;
          pos.xy += normalize(toPtr) * push;
        }

        float pulse = 0.5 + 0.5 * sin(uTime * (0.9 + aSpeed * 1.1) + aPhase * 19.0);
        vGlow = smoothstep(0.18, 0.96, pulse);

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = (14.0 + 18.0 * aScale) * (0.6 + 0.5 * vGlow) * uPixelRatio * (5.2 / max(1.0, -mvPosition.z));
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying float vGlow;
      varying float vPhase;

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        if (r > 1.0) discard;

        float core = exp(-r * r * 7.5);
        float halo = exp(-r * r * 2.2) * 0.45;
        float alpha = (core + halo) * vGlow * 0.88;

        vec3 warmGold = vec3(1.00, 0.86, 0.42);
        vec3 softLime = vec3(0.86, 0.98, 0.52);
        vec3 col = mix(warmGold, softLime, fract(vPhase * 3.7) * 0.55);
        col += vec3(0.35, 0.30, 0.15) * core;

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * Additive radial warm aura around lanterns / banker's lamp / diya.
 */
export function createGlowHaloMaterial(colorHex = 0xffa84c, baseOpacity = 0.24) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: baseOpacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 c = (vUv - 0.5) * 2.0;
        float d = dot(c, c);
        if (d > 1.0) discard;
        float a = exp(-d * 3.4) * (1.0 - d) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}
