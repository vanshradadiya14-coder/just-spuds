/**
 * Fullscreen raymarched backdrop.
 *
 * Three signed-distance spheres drifting on slow orbits, lit by a key and a rim
 * light, with soft shadows, cheap ambient occlusion and a fog falloff. Entirely
 * greyscale, so it sits underneath the interface without competing with the
 * food.
 *
 * Kept deliberately cheap: 56 march steps, no reflections, no AA. Rendered at
 * a fraction of device resolution and upscaled.
 */
export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

export const FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;      // 0..1
uniform float uDark;       // 1 = dark section, 0 = light section
uniform float uIntensity;

out vec4 outColor;

// --- sdf helpers ----------------------------------------------------------
float sdSphere(vec3 p, float r) { return length(p) - r; }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Three slow orbits, blended so they read as one soft mass when they meet.
float map(vec3 p) {
  float t = uTime * 0.16;

  vec3 a = vec3(sin(t * 0.9) * 1.30, cos(t * 0.7) * 0.55, cos(t * 0.5) * 0.60);
  vec3 b = vec3(cos(t * 0.6) * -1.45, sin(t * 1.1) * 0.70, sin(t * 0.8) * 0.50);
  vec3 c = vec3(sin(t * 1.3) * 0.55, cos(t * 0.9) * -0.85, cos(t * 1.2) * 0.70);

  float d = sdSphere(p - a, 1.00);
  d = smin(d, sdSphere(p - b, 0.78), 0.95);
  d = smin(d, sdSphere(p - c, 0.62), 0.85);
  return d;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0016, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.08;
  for (int i = 0; i < 20; i++) {
    float h = map(ro + rd * t);
    if (h < 0.001) return 0.0;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.03, 0.35);
    if (t > 6.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float ao(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 4; i++) {
    float h = 0.03 + 0.14 * float(i);
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // camera drifts gently with the pointer
  vec2 m = (uMouse - 0.5) * 0.7;
  vec3 ro = vec3(m.x * 1.1, m.y * 0.7, 5.2);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 fwd = normalize(ta - ro);
  vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 upv = cross(fwd, rgt);
  vec3 rd  = normalize(uv.x * rgt + uv.y * upv + 1.7 * fwd);

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 56; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.0012) { hit = 1.0; break; }
    t += d * 0.92;
    if (t > 12.0) break;
  }

  float lum = 0.0;

  if (hit > 0.5) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);

    vec3 keyDir = normalize(vec3(-0.55, 0.85, 0.5));
    vec3 rimDir = normalize(vec3(0.7, -0.2, -0.6));

    float key  = clamp(dot(n, keyDir), 0.0, 1.0);
    float rim  = pow(clamp(1.0 - dot(n, -rd), 0.0, 1.0), 2.6);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));

    float sh  = softShadow(p + n * 0.02, keyDir);
    float occ = ao(p, n);

    lum  = key * sh * 0.72;
    lum += fill * 0.20;
    lum += rim * 0.55;
    lum *= occ;

    // fog: let distant geometry dissolve rather than end abruptly
    lum *= exp(-0.055 * t * t * 0.25);
  }

  // a wide, very soft glow so the shapes bleed into the panel
  float glow = exp(-1.5 * length(uv)) * 0.10;
  lum += glow;

  lum *= uIntensity;

  // On dark panels the forms are lighter than the ground; on light panels
  // they read as soft shadow instead.
  float v = mix(-lum * 0.55, lum, uDark);
  outColor = vec4(vec3(v), abs(v));
}
`
