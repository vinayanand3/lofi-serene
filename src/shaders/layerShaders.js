import * as THREE from 'three';

export const TERRACE_BEAT_SECONDS = 6;

const LAYER_VERTEX_SHADER = /* glsl */ `
  uniform sampler2D uDepthMap;
  uniform float uDepthRelief;

  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vUv = uv;
    float d = texture2D(uDepthMap, uv).r;
    vDepth = d;

    vec3 pos = position;
    pos.z += (d - 0.5) * uDepthRelief;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const LAYER_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform sampler2D uDepthMap;
  uniform sampler2D uMaskEnv;   // R: water, G: sky, B: foliage
  uniform sampler2D uMaskGlow;  // R: primary lantern/lamp, G: secondary diya/lantern, B: valley mist

  uniform float uTime;
  uniform int uLayerIndex;
  uniform int uInspectMode;     // 0: scene, 1: depth map, 2: semantic masks
  uniform int uMood;            // 0: default, 1: deep night, 2: golden warm
  uniform float uReducedMotion;

  uniform vec2 uLanternPivot;
  uniform float uLanternSwing;
  uniform float uLanternPulse;
  uniform float uStonePulse;
  uniform vec2 uMoonCenter;

  uniform float uPendulumEnabled;
  uniform float uStarsEnabled;
  uniform vec2 uStarLuma;
  uniform float uMoonGlow;
  uniform float uCloudStrength;
  uniform float uCloudDrift;
  uniform float uMistStrength;
  uniform float uRainStrength;
  uniform float uNaturalWater;
  uniform float uFoliageSway;
  uniform float uFoliageSpeed;
  uniform vec3 uMistColor;
  uniform vec3 uCloudColor;

  #ifdef SLEEPER_BREATH
    uniform vec4 uSleeperBreath[2]; // xy: garment center, zw: feather radii
  #endif
  #if defined(AWAKE_GESTURES) || defined(CONSTELLATION_GUIDE)
    uniform float uConstellationTime;
    const float TERRACE_BEAT_SECONDS = ${TERRACE_BEAT_SECONDS.toFixed(1)};
  #endif
  #ifdef AWAKE_GESTURES
    uniform float uTerraceTime;
    uniform vec4 uAwakeGestures[3]; // Chuckle, pointing hand, and feet
  #endif
  #ifdef TERRACE_INTERACTIONS
    uniform vec2 uTorchResolution;
    uniform vec3 uTorch; // xy: screen position, z: on/off
    uniform vec2 uTerraceLampCenter;
    uniform float uTerraceLampOn;
  #endif

  // Interactive pond ripples: xy = UV center, z = startTime, w = strength
  uniform vec4 uRipples[4];

  varying vec2 vUv;
  varying float vDepth;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise(p);
      p = p * 2.04 + vec2(17.1, 9.3);
      amp *= 0.5;
    }
    return v;
  }

  vec3 depthPalette(float t) {
    vec3 c0 = vec3(0.06, 0.08, 0.22);
    vec3 c1 = vec3(0.16, 0.34, 0.58);
    vec3 c2 = vec3(0.42, 0.68, 0.64);
    vec3 c3 = vec3(0.95, 0.78, 0.42);
    vec3 c4 = vec3(1.00, 0.96, 0.84);
    if (t < 0.25) return mix(c0, c1, t / 0.25);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
    return mix(c3, c4, (t - 0.75) / 0.25);
  }

  #if defined(SLEEPER_BREATH) || defined(AWAKE_GESTURES)
    float gestureFeather(vec2 uv, vec4 region) {
      vec2 local = (uv - region.xy) / region.zw;
      return 1.0 - smoothstep(0.08, 1.0, dot(local, local));
    }
  #endif

  #ifdef AWAKE_GESTURES
    vec2 gestureTurn(vec2 uv, vec2 pivot, float angle) {
      vec2 aspect = vec2(1.7778, 1.0);
      vec2 rel = (uv - pivot) * aspect;
      float c = cos(angle);
      float s = sin(angle);
      vec2 turned = vec2(c * rel.x - s * rel.y, s * rel.x + c * rel.y);
      return (turned - rel) / aspect;
    }
  #endif

  #ifdef CONSTELLATION_GUIDE
    float constellationLine(vec2 p, vec2 a, vec2 b) {
      vec2 edge = b - a;
      vec2 closest = a + edge * clamp(dot(p - a, edge) / dot(edge, edge), 0.0, 1.0);
      return 1.0 - smoothstep(0.002, 0.015, distance(p, closest));
    }

    vec2 constellationShape(vec2 uv, int index) {
      vec2 origin;
      vec2 stars[7];
      if (index == 0) {
        // The Big Dipper
        origin = vec2(0.584, 0.817);
        stars = vec2[7](vec2(-0.67, 0.23), vec2(-0.45, 0.18), vec2(-0.25, 0.08),
                        vec2(-0.08, -0.05), vec2(0.34, -0.03), vec2(0.30, -0.32),
                        vec2(-0.12, -0.30));
      } else if (index == 1) {
        // Boötes, with Arcturus at the bottom of the kite
        origin = vec2(0.646, 0.807);
        stars = vec2[7](vec2(-0.10, -0.40), vec2(-0.30, -0.11), vec2(-0.43, 0.18),
                        vec2(-0.08, 0.40), vec2(0.28, 0.28), vec2(0.20, 0.03), vec2(0.0));
      } else {
        // Corona Borealis
        origin = vec2(0.707, 0.777);
        stars = vec2[7](vec2(-0.52, 0.23), vec2(-0.40, 0.02), vec2(-0.22, -0.14),
                        vec2(0.02, -0.22), vec2(0.23, -0.18), vec2(0.41, -0.05),
                        vec2(0.53, 0.13));
      }
      vec2 p = (uv - origin) * vec2(1.7778, 1.0) / 0.108;
      if (abs(p.x) > 0.75 || abs(p.y) > 0.48) return vec2(0.0);
      float points = 0.0;
      float lines = 0.0;
      int count = index == 1 ? 6 : 7;
      for (int i = 0; i < 7; i++) {
        if (i < count) {
          float d = distance(p, stars[i]);
          points = max(points, 0.7 * (1.0 - smoothstep(0.006, 0.023, d))
                               + 0.3 * (1.0 - smoothstep(0.01, 0.047, d)));
        }
      }
      for (int i = 0; i < 6; i++) {
        if (i + 1 < count) lines = max(lines, constellationLine(p, stars[i], stars[i + 1]));
      }
      if (index == 0) lines = max(lines, constellationLine(p, stars[6], stars[3]));
      if (index == 1) lines = max(lines, constellationLine(p, stars[5], stars[0]));
      return vec2(points, lines);
    }
  #endif

  void main() {
    float motion = 1.0 - uReducedMotion;
    vec2 uv = vUv;

    vec3 envMask = texture2D(uMaskEnv, uv).rgb;
    vec3 glowMask = texture2D(uMaskGlow, uv).rgb;

    float waterM = envMask.r;
    float skyM = envMask.g;
    float foliageM = envMask.b;
    float hangingM = glowMask.r;
    float stoneM = glowMask.g;
    float mistM = glowMask.b;

    vec2 sampleUv = uv;

    #ifdef SLEEPER_BREATH
      if (uLayerIndex == 4 && motion > 0.01) {
        for (int i = 0; i < 2; i++) {
          vec4 region = uSleeperBreath[i];
          vec2 rel = uv - region.xy;
          float feather = gestureFeather(uv, region);
          float cycle = uTime * (1.28 - float(i) * 0.16) + float(i) * 1.9;
          float rise = (0.5 - 0.5 * cos(cycle)) * feather * motion;
          sampleUv -= vec2(rel.x * 0.055, 0.0031) * rise;
        }
      }
    #endif

    #ifdef AWAKE_GESTURES
      float laugh = pow(max(0.0, cos(uTerraceTime * 1.16 + 0.8)), 4.0);
      float chuckle = (0.5 - 0.5 * cos(uTerraceTime * 10.5)) * laugh;
      vec4 mouth = uAwakeGestures[0];
      // Anchor the upper lip and soften the movement before the cheek outline.
      float lowerLip = 1.0 - smoothstep(-0.002, 0.002, uv.y - mouth.y);
      sampleUv.y += 0.0025 * chuckle * lowerLip * gestureFeather(uv, mouth);

      float beat = uConstellationTime / TERRACE_BEAT_SECONDS;
      float cue = mod(floor(beat), 3.0);
      float previous = mod(cue + 2.0, 3.0);
      float turn = mix(previous, cue, smoothstep(0.02, 0.21, fract(beat))) * 0.15 - 0.15;
      vec4 pointing = uAwakeGestures[1];
      vec2 wrist = pointing.xy + pointing.zw * vec2(-0.55, -0.57);
      sampleUv += gestureTurn(uv, wrist, turn * gestureFeather(uv, pointing));

      vec4 feet = uAwakeGestures[2];
      vec2 ankles = feet.xy + feet.zw * vec2(0.13, -0.69);
      float swing = sin(uTerraceTime * 1.9 + 1.7) * 0.14;
      sampleUv += gestureTurn(uv, ankles, swing * gestureFeather(uv, feet));
    #endif

    // Move the painted cloud texture only inside the feathered valley mask.
    if (uLayerIndex == 0 && uCloudDrift > 0.0 && mistM > 0.0) {
      float roll = uv.y * 11.0 + uv.x * 4.0;
      vec2 drift = vec2(
        sin(uTime * 0.13) * 0.8 + sin(uTime * 0.17 + roll) * 0.2,
        sin(uTime * 0.15 + roll) * 0.18
      );
      sampleUv += drift * uCloudDrift * mistM * motion;
    }

    // 1. Hanging lantern pendulum sway strictly on Layer 4 (where the entire atomic lantern lives)
    if (uLayerIndex == 4 && uPendulumEnabled > 0.5 && motion > 0.01) {
      vec2 rel = uv - uLanternPivot;
      float inLanternBox = smoothstep(0.088, 0.052, abs(rel.x))
                         * smoothstep(0.0, -0.015, rel.y)
                         * smoothstep(-0.44, -0.39, rel.y);
      if (inLanternBox > 0.001) {
        float angle = uLanternSwing * inLanternBox;
        float ca = cos(angle);
        float sa = sin(angle);
        vec2 aspectRel = vec2(rel.x * 1.7778, rel.y);
        vec2 rot = vec2(aspectRel.x * ca - aspectRel.y * sa, aspectRel.x * sa + aspectRel.y * ca);
        sampleUv = uLanternPivot + vec2(rot.x / 1.7778, rot.y);
      }
    }

    // 2. Gentle breeze sway on foliage, palms, evergreens & prayer flags
    if ((uLayerIndex >= 1 && uLayerIndex <= 4) && foliageM > 0.02 && motion > 0.01) {
      float windBoost = 1.0 + uRainStrength * 0.45;
      float breezeTime = uTime * uFoliageSpeed;
      float gust = sin(breezeTime * 1.15 * windBoost + uv.y * 10.0 + uv.x * 6.0) * 0.55
                 + sin(breezeTime * 2.10 * windBoost + uv.x * 14.0) * 0.45;
      float swayAmt = uFoliageSway * windBoost * foliageM * motion;
      sampleUv.x += gust * swayAmt;
      sampleUv.y += cos(breezeTime * 1.45 + uv.x * 9.0) * swayAmt * 0.45;
    }

    // 3. Water shimmer, procedural raindrop rings & interactive click ripples
    float rippleSpec = 0.0;
    if (uLayerIndex <= 1 && waterM > 0.02 && motion > 0.01) {
      if (uNaturalWater > 0.5) {
        // Disturb the painted reflections with overlapping wavelets.
        float phase = noise(uv * vec2(19.0, 8.0) + vec2(uTime * 0.16, 0.0)) * 6.283;
        float swell = sin(uv.y * 170.0 + uv.x * 19.0 - uTime * 2.8 + phase);
        float chop = sin(uv.y * 295.0 - uv.x * 37.0 + uTime * 3.9 + phase * 2.0);
        sampleUv += vec2(0.0019 * swell + 0.0007 * chop, 0.00055 * chop) * waterM * motion;
      } else {
        float wave1 = sin(uv.y * 135.0 + uTime * 1.65 + uv.x * 24.0);
        float wave2 = sin(uv.y * 210.0 - uTime * 1.15 + noise(uv * 28.0) * 6.0);
        float gentleWave = (wave1 * 0.55 + wave2 * 0.45);
        sampleUv.x += gentleWave * (0.0014 + uRainStrength * 0.0008) * waterM;
        sampleUv.y += wave2 * 0.0005 * waterM;
      }

      // Ambient raindrop rings for scenes that use the stylized water effect.
      if (uRainStrength > 0.15 && uNaturalWater < 0.5) {
        vec2 gridUv = uv * vec2(14.0, 9.0);
        vec2 cell = floor(gridUv);
        vec2 local = fract(gridUv) - 0.5;
        float rnd = hash(cell);
        float dropT = fract(uTime * (0.55 + rnd * 0.45) + rnd * 7.1);
        float radius = dropT * 0.46;
        float ring = smoothstep(0.06, 0.0, abs(length(local) - radius)) * (1.0 - dropT);
        rippleSpec += ring * uRainStrength * waterM * 0.24;
        sampleUv += normalize(local + 0.0001) * ring * 0.0015 * uRainStrength * waterM;
      }

      // Interactive click ripples
      for (int i = 0; i < 4; i++) {
        vec4 rp = uRipples[i];
        if (rp.w > 0.001) {
          float age = uTime - rp.z;
          if (age > 0.0 && age < 4.5) {
            vec2 d = (uv - rp.xy) * vec2(1.7778, mix(1.0, 3.0, uNaturalWater));
            float dist = length(d);
            float radius = age * 0.095;
            float ring = sin((dist - radius) * 95.0) * exp(-abs(dist - radius) * 28.0);
            float fade = exp(-age * 0.95) * rp.w * waterM;
            vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);
            sampleUv += dir * ring * mix(0.0032, 0.0018, uNaturalWater) * fade;
            rippleSpec += max(0.0, ring) * fade * 0.35 * (1.0 - uNaturalWater);
          }
        }
      }
    }

    vec4 tex = texture2D(uMap, clamp(sampleUv, 0.001, 0.999));
    if (tex.a < 0.015) discard;

    vec3 col = tex.rgb;

    #ifdef CONSTELLATION_GUIDE
      // Blend adjacent sky over the line drawing in the source illustration.
      vec2 guideOffset = abs(uv - vec2(0.565, 0.836));
      vec2 edge = smoothstep(vec2(0.036, 0.034), vec2(0.045, 0.046), guideOffset);
      float skyBlend = (1.0 - max(edge.x, edge.y)) * skyM;
      if (skyBlend > 0.0) {
        vec3 leftSky = texture2D(uMap, vec2(0.512, uv.y)).rgb;
        vec3 rightSky = texture2D(uMap, vec2(0.618, uv.y)).rgb;
        col = mix(col, mix(leftSky, rightSky, smoothstep(0.52, 0.61, uv.x)), skyBlend);
      }
    #endif

    // 4. Mood color grading
    if (uMood == 1) {
      col *= vec3(0.76, 0.83, 1.02);
      col += vec3(0.01, 0.02, 0.05) * (1.0 - hangingM);
    } else if (uMood == 2) {
      col *= vec3(1.07, 1.01, 0.93);
      col += vec3(0.04, 0.022, 0.005) * (skyM + mistM * 0.8);
    }

    // 5. Sky: twinkling stars + crescent moon halo OR drifting painterly clouds
    if (uLayerIndex == 0 && skyM > 0.04) {
      #ifdef CONSTELLATION_GUIDE
        float beat = uConstellationTime / TERRACE_BEAT_SECONDS;
        float phase = fract(beat);
        float reveal = smoothstep(0.12, 0.29, phase) * (1.0 - smoothstep(0.78, 0.99, phase));
        vec2 guide = constellationShape(uv, int(mod(floor(beat), 3.0)));
        col += vec3(0.26, 0.53, 1.0) * dot(guide, vec2(0.70, 0.075)) * reveal * skyM;
      #endif
      if (uStarsEnabled > 0.5) {
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        float starMask = smoothstep(uStarLuma.x, uStarLuma.y, luma)
                       * smoothstep(0.60, 0.92, uv.y) * skyM;
        float twinkle = 0.72 + 0.38 * sin(uTime * (2.4 + hash(floor(uv * 160.0)) * 3.5) + hash(floor(uv * 90.0)) * 6.283);
        col += vec3(0.82, 0.89, 1.0) * starMask * (twinkle - 0.7) * 0.55 * motion;

        vec2 md = (uv - uMoonCenter) * vec2(1.7778, 1.0);
        float moonHalo = exp(-dot(md, md) * 42.0) * skyM;
        float moonBreath = 0.88 + 0.12 * sin(uTime * 0.7);
        col += vec3(0.76, 0.84, 1.0) * moonHalo * uMoonGlow * moonBreath;
      }

      if (uCloudStrength > 0.01) {
        vec2 cUv1 = vec2(uv.x * 2.6 - uTime * 0.014 * motion, uv.y * 4.5);
        vec2 cUv2 = vec2(uv.x * 4.2 - uTime * 0.022 * motion + 3.1, uv.y * 6.0);
        float c1 = fbm(cUv1);
        float c2 = fbm(cUv2);
        float cloudLayer = smoothstep(0.38, 0.78, c1 * 0.65 + c2 * 0.35) * skyM * uCloudStrength * 0.42;
        col = mix(col, uCloudColor, cloudLayer);
      }
    }

    // 6. Water specular shimmer & ripples
    if (uLayerIndex <= 1 && waterM > 0.05 && uNaturalWater < 0.5) {
      float glint = smoothstep(0.68, 0.96, noise(vec2(uv.x * 46.0 + uTime * 0.25, uv.y * 120.0 - uTime * 0.6)));
      col += vec3(0.74, 0.85, 1.0) * glint * waterM * 0.14 * motion;
      col += vec3(0.86, 0.93, 1.0) * rippleSpec;
    }

    // 7. Drifting mountain valley mist / fog corridor
    if (uLayerIndex <= 1 && mistM > 0.02 && uMistStrength > 0.01) {
      vec2 mistUv = vec2(uv.x * 3.0 - uTime * 0.018 * motion, uv.y * 4.6 + sin(uTime * 0.16) * 0.08);
      float n = fbm(mistUv);
      float mistDensity = smoothstep(0.30, 0.78, n) * mistM * uMistStrength * (uMood == 2 ? 1.25 : 1.0);
      vec3 mc = uMood == 2 ? mix(uMistColor, vec3(0.92, 0.80, 0.72), 0.35) : uMistColor;
      col = mix(col, mc, clamp(mistDensity, 0.0, 0.65));
    }

    // 8. Primary lantern / banker's lamp warm breathing glow
    #ifdef TERRACE_INTERACTIONS
      hangingM *= uTerraceLampOn;
      if (uTerraceLampOn < 0.5) {
        vec2 lampDelta = uv - uTerraceLampCenter;
        float wallGlow = 1.0 - smoothstep(0.18, 1.0, length(lampDelta / vec2(0.039, 0.072)));
        float bulb = 1.0 - smoothstep(0.25, 1.0, length(lampDelta / vec2(0.010, 0.022)));
        col *= mix(vec3(1.0), vec3(0.48, 0.60, 0.83), wallGlow) * (1.0 - 0.50 * bulb);
      }
    #endif
    if (hangingM > 0.02) {
      float flicker = 1.0
        + (0.045 * sin(uTime * 2.3) + 0.025 * sin(uTime * 5.7 + 1.4)) * motion
        + uLanternPulse * 0.36;
      vec3 warmTint = vec3(1.0, 0.66, 0.26);
      float boost = (uLayerIndex >= 3 ? 0.22 : 0.08) * hangingM * (flicker - 0.85);
      col += warmTint * max(0.0, boost);
    }

    // 9. Secondary lantern / diya flame flicker
    if (stoneM > 0.02) {
      float candle = 1.0
        + (0.07 * sin(uTime * 3.9 + 0.5) + 0.04 * sin(uTime * 8.3)) * motion
        + uStonePulse * 0.55;
      vec3 candleCol = vec3(1.0, 0.78, 0.38);
      col += candleCol * stoneM * 0.22 * max(0.0, candle - 0.82);
    }

    #ifdef TERRACE_INTERACTIONS
      if (uTorch.z > 0.5) {
        vec2 delta = gl_FragCoord.xy / uTorchResolution - uTorch.xy;
        delta.x *= uTorchResolution.x / uTorchResolution.y;
        float beam = 1.0 - smoothstep(0.08, 0.24, length(delta));
        col = col * (1.0 + 0.85 * beam) + vec3(0.017, 0.021, 0.025) * beam;
      }
    #endif

    // 10. Live inspection modes (AI Depth Map / Semantic Pixel Stencils)
    if (uInspectMode == 1) {
      float d = texture2D(uDepthMap, uv).r;
      col = depthPalette(d);
    } else if (uInspectMode == 2) {
      vec3 stencilVis = vec3(0.08, 0.10, 0.14);
      stencilVis = mix(stencilVis, vec3(0.20, 0.78, 1.00), waterM);
      stencilVis = mix(stencilVis, vec3(0.32, 0.42, 0.96), skyM * 0.6);
      stencilVis = mix(stencilVis, vec3(0.26, 0.85, 0.48), foliageM);
      stencilVis = mix(stencilVis, vec3(1.00, 0.64, 0.18), hangingM);
      stencilVis = mix(stencilVis, vec3(1.00, 0.92, 0.36), stoneM);
      stencilVis = mix(stencilVis, vec3(0.76, 0.56, 0.96), mistM * 0.75);
      col = mix(col * 0.28, stencilVis, 0.82);
    }

    gl_FragColor = vec4(col, tex.a);
    #ifdef SOURCE_COLOR
      #include <colorspace_fragment>
    #endif
  }
`;

export function createLayerMaterial({
  layerTexture,
  depthTexture,
  maskEnvTexture,
  maskGlowTexture,
  layerIndex,
  depthRelief,
  manifest,
}) {
  const fx = manifest.effects || {};
  const anchors = manifest.anchors;
  const breathing = layerIndex === 4 && fx.sleeperBreath;
  const awake = layerIndex === 4 && fx.awakeGestures;
  return new THREE.ShaderMaterial({
    vertexShader: LAYER_VERTEX_SHADER,
    fragmentShader: LAYER_FRAGMENT_SHADER,
    transparent: layerIndex > 0,
    depthWrite: layerIndex === 0,
    side: THREE.FrontSide,
    defines: {
      ...(fx.sourceColor ? { SOURCE_COLOR: 1 } : {}),
      ...(breathing ? { SLEEPER_BREATH: 1 } : {}),
      ...(awake ? { AWAKE_GESTURES: 1 } : {}),
      ...(layerIndex === 0 && fx.awakeGestures ? { CONSTELLATION_GUIDE: 1 } : {}),
      ...(fx.terraceInteractions ? { TERRACE_INTERACTIONS: 1 } : {}),
    },
    uniforms: {
      uMap: { value: layerTexture },
      uDepthMap: { value: depthTexture },
      uMaskEnv: { value: maskEnvTexture },
      uMaskGlow: { value: maskGlowTexture },
      uTime: { value: 0 },
      uTerraceTime: { value: 0 },
      uConstellationTime: { value: 0 },
      uTorchResolution: { value: new THREE.Vector2(1, 1) },
      uTorch: { value: new THREE.Vector3() },
      uTerraceLampCenter: {
        value: new THREE.Vector2(anchors.hangingLanternCenter[0], 1.0 - anchors.hangingLanternCenter[1]),
      },
      uTerraceLampOn: { value: 1 },
      uLayerIndex: { value: layerIndex },
      uDepthRelief: { value: depthRelief },
      uInspectMode: { value: 0 },
      uMood: { value: 0 },
      uReducedMotion: { value: 0 },
      uLanternPivot: {
        value: new THREE.Vector2(anchors.hangingLanternPivot[0], 1.0 - anchors.hangingLanternPivot[1]),
      },
      uLanternSwing: { value: 0 },
      uLanternPulse: { value: 0 },
      uStonePulse: { value: 0 },
      uMoonCenter: {
        value: new THREE.Vector2(anchors.moonCenter[0], 1.0 - anchors.moonCenter[1]),
      },
      uPendulumEnabled: { value: fx.pendulumLantern ? 1.0 : 0.0 },
      uStarsEnabled: { value: fx.stars ? 1.0 : 0.0 },
      uStarLuma: { value: new THREE.Vector2(...(fx.starLuma ?? [0.55, 0.88])) },
      uMoonGlow: { value: fx.moonGlow ?? 0.16 },
      uCloudStrength: { value: fx.clouds || 0.0 },
      uCloudDrift: { value: fx.cloudDrift ?? 0.0 },
      uMistStrength: { value: fx.mist ?? 0.2 },
      uRainStrength: { value: fx.rain || 0.0 },
      uNaturalWater: { value: fx.naturalWater ? 1.0 : 0.0 },
      uFoliageSway: { value: fx.foliageSway ?? 0.0022 },
      uFoliageSpeed: { value: fx.foliageSpeed ?? 1.0 },
      uSleeperBreath: {
        value: breathing ? breathing.map(([u, v, rx, ry]) => new THREE.Vector4(u, 1.0 - v, rx, ry)) : [],
      },
      uAwakeGestures: {
        value: awake ? [awake.chuckle, awake.point, awake.feet]
          .map(([u, v, rx, ry]) => new THREE.Vector4(u, 1.0 - v, rx, ry)) : [],
      },
      uMistColor: { value: new THREE.Color(Number(fx.mistColor || 0x9cb4d4)) },
      uCloudColor: { value: new THREE.Color(Number(fx.cloudColor || 0xa8b8d8)) },
      uRipples: {
        value: [
          new THREE.Vector4(0, 0, -10, 0),
          new THREE.Vector4(0, 0, -10, 0),
          new THREE.Vector4(0, 0, -10, 0),
          new THREE.Vector4(0, 0, -10, 0),
        ],
      },
    },
  });
}
