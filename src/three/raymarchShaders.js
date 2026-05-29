// Fullscreen raymarcher that renders the blob AND the "start" word as signed
// distance fields in one pass, so they smoothly metaball-merge (smin) and share
// the same dark/rim-lit material.

// Fullscreen triangle/quad: emit clip-space directly, ignore camera matrices.
export const raymarchVertexShader = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SIMPLEX_NOISE = /* glsl */ `
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const raymarchFragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform vec3 uCamPos;
uniform mat4 uProjInv;
uniform mat4 uViewInv;

uniform float uTime;
uniform float uSpeed;
uniform float uEdgePhase; // advances only while the cursor moves
uniform float uFrequency;
uniform float uAmplitude;
uniform float uRoughness;

uniform float uFresnelPower;
uniform float uRimStrength;
uniform vec3 uBaseColor;
uniform vec3 uRimColor;
uniform vec3 uLightDir;
uniform vec3 uBg;

uniform float uHover;
uniform float uBulge;
uniform vec3 uMouse;
uniform vec3 uScale;
uniform float uMergeK;
uniform float uBelt;

// Soft-body transforms (spring driven on the CPU).
uniform mat3 uModelRotInv; // world -> blob local frame (lean + idle sway)
uniform vec3 uTranslate;   // whole-body drift toward the cursor
uniform vec3 uLeadOffset;  // top-leads / bottom-lags bend

uniform sampler2D uTextSDF;
uniform vec2 uTextHalf;
uniform float uTextThickness;
uniform float uHasText;
uniform vec3 uLabelColor;
uniform float uLabelStrength;
uniform float uPlateFollow; // how far the plate slides toward the cursor
uniform float uSlabWidth;        // slab half-width as a multiple of the text width
uniform float uSlabHeight;       // slab half-height as a multiple of the text height
uniform float uSlabTranslucency; // 0 = same as body, 1 = light/glassy translucent
uniform float uProtrude;         // how far the slab pushes out of the front face
uniform float uEdgeAmount;       // edge refraction displacement amplitude
uniform float uEdgeAsym;         // edge refraction asymmetry (which side/corner flows more)
uniform float uPress;            // click press (0 = released, 1 = fully pressed)
uniform float uRestReveal;       // faint label visibility at rest, before hover

// --- Interior reveal: clicking "start" dives the camera through the slab and the
// scene crossfades from the exterior blob button to an interior room (ceiling
// light + floor cutout + volumetric beam). uEnter (0..1) is the single source of
// truth, eased on the CPU; everything else is derived from it. ---
uniform float uEnter;       // 0 = exterior button, 1 = fully inside the room
uniform float uRoomFog;     // depth fog density inside the room
uniform float uCeilLight;   // top-down ceiling light strength
uniform float uSlitWidth;   // half-width (in z, depth) of the floor light bar
uniform float uSlitLen;     // half-length (in x, across) of the floor light bar
uniform float uBeam;        // volumetric light-shaft intensity through the bar
uniform vec3 uRoomColor;    // dark wall / floor base color
uniform vec3 uLightColor;   // light + glow color

${SIMPLEX_NOISE}

const float RADIUS = 1.4;

// Radius of the cull sphere around the body (covers the blob, its displacement,
// and the fully-grown "start" slab including its follow offset).
const float BOUND_R = 2.4;

float fbm(vec3 p){
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for(int i = 0; i < 2; i++){
    sum += amp * snoise(p * freq);
    freq *= 1.9;
    amp *= uRoughness;
  }
  return sum;
}

// Ridged noise (sharp creases) for ridges rather than smooth lumps. ~[-0.5,0.5].
float ridged(vec3 p){
  return (1.0 - abs(snoise(p))) - 0.5;
}

// dir is already in the blob's local frame (the body rotates with it).
//
// Pressure-redistribution model (NOT waves/ripples): the deformation is a
// single low-frequency field that slowly FLOWS across the skin, so the whole
// silhouette swells and relaxes coherently — like a sealed air membrane under
// tension — instead of high-frequency surface chatter. There is no per-point
// sine oscillation; neighbouring points share the same field and move together.
float displacement(vec3 dir){
  float t = uTime * uSpeed;

  // The field drifts (advects) across the surface very slowly. As it slides, the
  // big lobes migrate, so the OUTLINE redistributes its volume rather than the
  // surface rippling in place. This is the primary motion.
  vec3 flow = vec3(0.13, 0.09, 0.11) * t;
  float base = fbm(dir * uFrequency + flow);

  // One gentle whole-body breath: identical phase everywhere, so the skin
  // inflates and relaxes as a single pressurized volume (no surface oscillation).
  float breath = 0.92 + 0.08 * sin(t * 0.6);

  float d = uAmplitude * base * breath;

  // Localized pressure swell under the cursor (cursor dir mapped into local frame).
  vec3 lm = normalize(uModelRotInv * uMouse);
  float md = distance(dir, lm);
  float bump = exp(-md * md * 4.0);
  d += uHover * uBulge * bump;
  return d;
}

// Approximate signed distance to an ellipsoid (iq) — gives a flat, wide,
// button-like resting form rather than a full sphere.
float sdEllipsoid(vec3 p, vec3 r){
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-5);
}

float sdBlob(vec3 p){
  vec3 dir = normalize(p + 1e-5);
  float disp = displacement(dir);
  // Press feedback: the whole body squishes slightly inward on click, so the
  // button physically gives when pressed and springs back on release.
  vec3 bodyScale = uScale * (1.0 - 0.05 * uPress);
  // Equator "belt": a gentle band that swells the middle so the front reads as
  // a face the decal is embedded in.
  float belt = uBelt * exp(-(p.y / bodyScale.y) * (p.y / bodyScale.y) * 5.0);
  return sdEllipsoid(p, bodyScale) - disp - belt;
}

float sdRoundBox(vec3 p, vec3 b, float r){
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// 2D rounded rectangle with an INDEPENDENT radius per corner (iq). r =
// (top-right, bottom-right, top-left, bottom-left). Lets each corner round out by
// a different amount while the shape stays a clean 4-sided rectangle.
float sdRoundRect2D(vec2 p, vec2 b, vec4 r){
  r.xy = (p.x > 0.0) ? r.xy : r.zw;
  r.x  = (p.y > 0.0) ? r.x  : r.y;
  vec2 q = abs(p) - b + r.x;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

// How far the label plate has grown out of the blob (eased hover, 0..1).
float plateGrow(){
  return uHasText * uHover;
}

// Where the plate sits on the blob's face (local x/y). It tracks the cursor's
// actual position ON the body's front face — not a tiny fraction of the raw
// direction vector — so the "start" slab rides AROUND the blob under the cursor
// instead of staying pinned near the center. We map the cursor direction onto
// the ellipsoid's x/y extent (lm.xy * radii) to get the on-face point, scale by
// uPlateFollow (how far it's allowed to roam), and clamp so the slab's body
// always stays on the face and keeps merging with the blob.
vec2 plateCenter(){
  vec3 lm = normalize(uModelRotInv * uMouse); // cursor dir in local frame
  // The cursor's x/y position on the body's surface (its footprint on the face).
  vec2 onFace = vec2(lm.x * uScale.x, lm.y * uScale.y);
  vec2 c = onFace * uPlateFollow * uHover;
  // Keep the slab from sliding off the body: leave room for half the slab so its
  // back stays embedded and the metaball merge never breaks.
  vec2 hw = vec2(uTextHalf.x * uSlabWidth, uTextHalf.y * uSlabHeight);
  vec2 lim = max(uScale.xy - hw * 0.5, vec2(0.0));
  return clamp(c, -lim, lim);
}

// The slab's frame on the body. Its face ALWAYS points radially outward from the
// blob center, so as the slab rides around the body it stays tangent to the
// surface and faces directly out (never locked to a single direction). We find
// the surface point under the cursor, take the radial direction there as the
// slab's outward (+z) axis, and build horizontal/vertical axes around it (the
// horizontal axis is derived from world-up so the text stays upright).
//   origin = slab center (back tucked under the surface, face lifted out)
//   tx,ty  = in-face axes (text right / up)   nrm = outward face normal
void plateFrame(out vec3 origin, out vec3 tx, out vec3 ty, out vec3 nrm){
  vec2 c = plateCenter();
  float g = plateGrow();
  // Ellipsoid front z at the plate center -> the surface point the slab sits on.
  float kk = clamp(1.0 - (c.x * c.x) / (uScale.x * uScale.x)
                       - (c.y * c.y) / (uScale.y * uScale.y), 0.0, 1.0);
  float zFront = uScale.z * sqrt(kk);
  vec3 surf = vec3(c, zFront);
  // Radial direction from the body center = the way the face points. This is what
  // makes the slab face "directly outward" wherever it travels.
  nrm = normalize(surf);
  // Horizontal in-face axis from world-up (keeps the word upright); flip the
  // reference near the poles to avoid a degenerate cross product.
  vec3 up = abs(nrm.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  tx = normalize(cross(up, nrm));
  ty = cross(nrm, tx);
  // Back stays embedded under the surface; the face lifts out along the normal as
  // it grows. Press sinks it back in. Because the back is always inside the body,
  // the metaball merge never breaks -> "start" stays fused to the blob.
  float protr = g * uProtrude * (1.0 - 0.6 * uPress);
  origin = surf + nrm * (protr - uTextThickness);
}

// A point expressed in the slab's outward-facing frame: xy = in-face plane,
// z = depth along the outward normal (0 at center, + toward the face).
vec3 plateLocal(vec3 p){
  vec3 o, tx, ty, nrm;
  plateFrame(o, tx, ty, nrm);
  vec3 rel = p - o;
  return vec3(dot(tx, rel), dot(ty, rel), dot(nrm, rel));
}

// The "start" plate: a separate rounded-rectangular slab whose face always faces
// radially outward from the blob (see plateFrame). At rest it is small and tucked
// inside the body; as the cursor approaches it grows out through the surface so it
// metaball-merges with the blob and reads as "start". Its center tracks the cursor
// (plateCenter) so the button rides around the body under the mouse.
float sdPlate(vec3 p){
  float g = plateGrow();
  float sxy = mix(0.4, 1.0, g);
  // Into the slab's outward-facing frame: lp.xy is the face plane, lp.z the
  // thickness axis pointing radially out of the body.
  vec3 lp = plateLocal(p);

  // Base rounded rectangle (the object is wider than the word; the glyph mapping
  // still uses the unpadded text bounds, so the text stays the same size).
  vec2 hw = vec2(uTextHalf.x * sxy * uSlabWidth, uTextHalf.y * sxy * uSlabHeight);

  // The slab behaves like an elastic-gel rounded rectangle that periodically LOSES
  // STRUCTURAL RIGIDITY: as it softens, the contour relaxes from a crisp rounded
  // rectangle toward a soft organic (ellipse-like) form — corners lose definition
  // first, then the sides bow pillowy — and then it firms back up. It drifts
  // between rectangle and blob but, crucially, is clamped so it NEVER fully becomes
  // a blob (its rectangular identity always survives). Driven by uEdgePhase, so the
  // softening only breathes while the cursor moves.
  //   uEdgeAmount = how much rigidity it can lose (0 = always crisp, 1 = very soft)
  //   uEdgeAsym   = asymmetry (one side/corner flows more than another)
  float ph = uEdgePhase;
  float asym = uEdgeAsym;

  // Rigidity loss oscillates so stiffness continuously comes and goes. Clamped so
  // the rectangle never melts all the way to a blob.
  float melt = uEdgeAmount * (0.5 + 0.5 * sin(ph));
  melt = min(melt, 0.82);

  vec2 e = lp.xy;

  // Structured rounded rect (with a touch of independent per-corner life).
  vec4 off = vec4(0.0, 1.9, 3.6, 5.2) * asym;
  vec4 radii = 0.16 + 0.06 * (0.5 + 0.5 * sin(ph * 0.9 + off));
  radii = min(radii, vec4(min(hw.x, hw.y)));
  float dRect = sdRoundRect2D(e, hw, radii);

  // Mild, uniform softening toward an ellipse (overall loss of stiffness).
  float dEll = (length(e / hw) - 1.0) * min(hw.x, hw.y);
  float d2 = mix(dRect, dEll, 0.35 * melt);

  // The important part: an ASYMMETRIC stretch/pull, not uniform rounding. A couple
  // of slow lobes drift around the perimeter (not noise) and push the contour
  // OUTWARD on one side while drawing it IN elsewhere, so the slab stretches and
  // pulls toward the blob lopsidedly. The pulled region drifts as the cursor moves.
  float ang = atan(e.y, e.x);
  float lobe = 0.65 * sin(ang + ph) + 0.35 * sin(2.0 * ang - ph * 0.6 + asym);
  d2 -= melt * 0.32 * lobe * min(hw.x, hw.y);

  // Extrude along z to give the slab its thickness.
  float dz = abs(lp.z) - uTextThickness * 0.6;
  return length(max(vec2(d2, dz), 0.0)) + min(max(d2, dz), 0.0);
}

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Move a world point into the blob's soft-body frame: global drift, rotate into
// the leaning/swaying local frame, then a height-dependent bend so the top leads
// and the bottom lags (the sense of mass). The label plate lives in this same
// frame, so it leans and flows with the body.
vec3 toLocal(vec3 p){
  vec3 q = p - uTranslate;
  q = uModelRotInv * q;
  float v = smoothstep(-uScale.y, uScale.y, q.y);
  q.xy -= uLeadOffset.xy * v;
  return q;
}

float map(vec3 p){
  vec3 q = toLocal(p);
  float blob = sdBlob(q);
  // Uniform branch (plateGrow depends only on uHover): when not hovering, skip
  // the plate entirely so its noise is never evaluated during the march.
  if(plateGrow() < 0.0001) return blob;
  return smin(blob, sdPlate(q), uMergeK);
}

// At a surface point, how much the label plate dominates the merged field
// (1 = on the plate, 0 = pure blob). Used to read "start" off the plate.
float plateWeight(vec3 q){
  float blob = sdBlob(q);
  float plate = sdPlate(q);
  return clamp(0.5 - 0.5 * (plate - blob) / uMergeK, 0.0, 1.0);
}

// 4-tap tetrahedron normal: 4 map() evaluations instead of the 6 a central
// difference needs.
vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0018;
  return normalize(
    k.xyy * map(p + k.xyy * h) +
    k.yyx * map(p + k.yyx * h) +
    k.yxy * map(p + k.yxy * h) +
    k.xxx * map(p + k.xxx * h));
}

// The blob alone (no plate), in world space — used so the glass slab can show the
// body's curved shading THROUGH itself instead of a flat panel.
float mapBlob(vec3 p){ return sdBlob(toLocal(p)); }
vec3 calcBlobNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.002;
  return normalize(
    k.xyy * mapBlob(p + k.xyy * h) +
    k.yyx * mapBlob(p + k.yyx * h) +
    k.yxy * mapBlob(p + k.yxy * h) +
    k.xxx * mapBlob(p + k.xxx * h));
}

// The smoked-glass body material for a surface with normal N seen along rd.
// Factored out so both the primary surface and the glass-transmitted body
// (seen through the slab) use identical shading.
vec3 shadeBody(vec3 N, vec3 rd){
  vec3 V = -rd;
  vec3 L = normalize(uLightDir);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, uFresnelPower);

  vec3 c = uBaseColor * mix(0.35, 1.0, fres);     // near-black interior, lifts at edge
  c += uRimColor * fres * uRimStrength;            // broad rim glow
  c += uRimColor * smoothstep(0.78, 1.0, fres) * 0.7; // thin silhouette contour
  vec3 H = normalize(L + V);
  c += vec3(0.85, 0.95, 0.9) * pow(clamp(dot(N, H), 0.0, 1.0), 200.0) * 0.3; // spec
  c += uRimColor * clamp(dot(N, L), 0.0, 1.0) * 0.05; // faint diffuse
  return c;
}

// The exterior "start" button scene (blob + merged slab + label). Returns the
// shaded color for a camera ray. This is the original main() body, factored out
// so the interior reveal can crossfade away from it.
vec3 renderExterior(vec3 ro, vec3 rd){
  // Bounding-sphere cull: analytically intersect the ray with a sphere around
  // the blob. Pixels that miss it are pure background (no marching at all), and
  // those that hit only march the span inside the sphere. This skips the huge
  // empty region that otherwise marched the full distance every frame.
  vec3 oc = ro - uTranslate;
  float bb = dot(oc, rd);
  float cc = dot(oc, oc) - BOUND_R * BOUND_R;
  float disc = bb * bb - cc;
  if(disc < 0.0) return uBg;
  float sq = sqrt(disc);
  float tEnter = max(-bb - sq, 0.0);
  float tExit = -bb + sq;

  float t = tEnter;
  bool hit = false;
  for(int i = 0; i < 80; i++){
    vec3 p = ro + rd * t;
    float d = map(p);
    if(d < 0.0008){ hit = true; break; }
    t += d * 0.8;
    if(t > tExit) break;
  }

  vec3 col = uBg;
  if(hit){
    vec3 p = ro + rd * t;
    vec3 N = calcNormal(p);
    vec3 V = -rd;

    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, uFresnelPower);

    // Smoked-glass body material.
    vec3 col3 = shadeBody(N, rd);

    // --- "start" read off the merged label plate ---
    vec3 q = toLocal(p);
    float g = plateGrow();
    float sxy = mix(0.4, 1.0, g);
    vec3 lp = plateLocal(q);
    float frontFace = smoothstep(-0.06, 0.04, lp.z); // only paint on the outward face

    float slab = plateWeight(q) * g;
    vec3 behind = shadeBody(calcBlobNormal(p), rd);     // body seen through the glass
    vec3 glass = mix(behind, uRimColor, pow(fres, 1.5) * 0.25);
    col3 = mix(col3, glass, slab * uSlabTranslucency);

    vec2 luv = vec2(
      lp.x / (2.0 * uTextHalf.x * sxy) + 0.5,
      lp.y / (2.0 * uTextHalf.y * sxy) + 0.5
    );
    float inb =
      step(0.0, luv.x) * step(luv.x, 1.0) * step(0.0, luv.y) * step(luv.y, 1.0);
    float cov = texture2D(uTextSDF, clamp(luv, 0.0, 1.0)).a;
    float glyph = smoothstep(0.42, 0.6, cov);
    float reveal = max(g, uRestReveal * uHasText);
    float restDim = mix(0.6, 1.0, g);
    vec3 labelCol = uLabelColor * (0.7 + 0.45 * fres) * restDim * (1.0 + 0.4 * uPress);
    float textA = glyph * inb * frontFace * reveal * uLabelStrength;
    col3 = mix(col3, labelCol, textA * 0.85);

    col = col3;
  }
  return col;
}

// ============================ INTERIOR ROOM ============================
// A dark, enclosed box the camera flies into. Lighting is top-down (an emissive
// ceiling panel), so horizontal surfaces catch light while the vertical walls
// stay dark. The center of the floor has a round cutout with an emissive disc
// just beneath it, so light reads as shining UP through the opening. The opening
// is the portal: on the way out it recenters and crossfades back into the blob.

const float FLOOR_Y   = -1.60;
const float CEIL_Y    =  2.10;
const float WALL_X    =  3.40; // side walls at +/-x
const float WALL_ZB   = -7.50; // back wall
const float WALL_ZF   =  3.50; // front wall (behind the arrival pose)
const float SLIT_Z    = -3.00; // floor light-bar center (ahead of the camera)

float sdBoxR(vec3 p, vec3 b){
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Planar distance to the light-bar center line (0 along the bar, growing away
// from it). Used to place the light bounce and the volumetric beam.
float slitDist(vec3 p){
  float dx = max(abs(p.x) - uSlitLen, 0.0);
  float dz = p.z - SLIT_Z;
  return length(vec2(dx, dz));
}

// Interior distance field. Walls are half-spaces (positive inside the room); the
// floor has a long slit carved out of its center; an emissive box sits just
// below the slit.
//   mat: 0 = dark shell, 1 = ceiling light panel, 2 = under-floor glow
float roomMap(vec3 p, out int mat){
  // Solid floor, no recess — the light bar lies flat ON the ground surface.
  float floorD = p.y - FLOOR_Y;
  float ceilD  = CEIL_Y - p.y;
  float leftD  = p.x + WALL_X;
  float rightD = WALL_X - p.x;
  float backD  = p.z - WALL_ZB;
  float frontD = WALL_ZF - p.z;
  float shell  = min(min(min(floorD, ceilD), min(leftD, rightD)), min(backD, frontD));

  mat = 0;
  // Where the floor is the nearest surface and we're inside the bar footprint,
  // the floor itself is emissive -> a flat horizontal bar of light on the ground.
  if(floorD <= ceilD && floorD <= leftD && floorD <= rightD
     && floorD <= backD && floorD <= frontD){
    if(abs(p.x) < uSlitLen && abs(p.z - SLIT_Z) < uSlitWidth) mat = 2;
  } else if(ceilD <= leftD && ceilD <= rightD && ceilD <= backD && ceilD <= frontD){
    if(abs(p.x) < uSlitLen + 0.8 && abs(p.z - SLIT_Z) < uSlitWidth + 1.2) mat = 1;
  }
  return shell;
}

float roomDist(vec3 p){ int m; return roomMap(p, m); }

vec3 roomNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.003;
  return normalize(
    k.xyy * roomDist(p + k.xyy * h) +
    k.yyx * roomDist(p + k.yyx * h) +
    k.yxy * roomDist(p + k.yxy * h) +
    k.xxx * roomDist(p + k.xxx * h));
}

// Cheap volumetric light shaft: integrate proximity to the sheet of light rising
// from the slit. Brightest near the floor (the source), fading up. The vertical
// extent uses a smooth window (not a hard y test) so samples don't pop as they
// cross the floor/ceiling planes -> no flicker.
float roomBeam(vec3 ro, vec3 rd){
  float acc = 0.0;
  float t = 0.1;
  for(int i = 0; i < 30; i++){
    vec3 p = ro + rd * t;
    float rad = slitDist(p) / (uSlitWidth * 2.0 + 0.001);
    float prof = exp(-rad * rad);
    float hgt = clamp((p.y - FLOOR_Y) / (CEIL_Y - FLOOR_Y), 0.0, 1.0);
    float win = smoothstep(FLOOR_Y - 0.15, FLOOR_Y + 0.25, p.y)
              * smoothstep(CEIL_Y + 0.15, CEIL_Y - 0.45, p.y);
    acc += prof * (1.0 - hgt * 0.65) * win;
    t += 0.2;
    if(t > 24.0) break;
  }
  return acc * 0.05;
}

vec3 renderRoom(vec3 ro, vec3 rd){
  float t = 0.02;
  int mat = 0;
  bool hit = false;
  for(int i = 0; i < 120; i++){
    vec3 p = ro + rd * t;
    float d = roomMap(p, mat);
    if(d < 0.001){ hit = true; break; }
    t += d * 0.9; // safety factor: the CSG carve isn't a perfect SDF near the slit
    if(t > 50.0) break;
  }

  vec3 col = uRoomColor * 0.12;
  if(hit){
    vec3 p = ro + rd * t;
    if(mat == 2){
      col = uLightColor * 3.4;                       // glow shining up through the opening
    } else if(mat == 1){
      col = uLightColor * (0.5 + 1.0 * uCeilLight);  // top-down ceiling panel
    } else {
      vec3 n = roomNormal(p);
      float top = clamp(n.y, 0.0, 1.0);              // surfaces facing up catch the light
      // Warm bounce from the bar onto the surrounding floor.
      float bounce = exp(-slitDist(p) * 0.6) * clamp(n.y, 0.0, 1.0);
      col = uRoomColor * (0.05 + uCeilLight * 0.6 * top) + uLightColor * 0.5 * bounce;
    }
  }

  // Volumetric shaft rising from the opening.
  col += uLightColor * roomBeam(ro, rd) * uBeam;

  // Subtle dark depth fog so far walls fall off into black.
  float fog = 1.0 - exp(-t * uRoomFog);
  col = mix(col, uRoomColor * 0.1, fog);
  return col;
}

void main(){
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = uProjInv * clip;
  viewPos /= viewPos.w;
  vec3 rd = normalize((uViewInv * vec4(normalize(viewPos.xyz), 0.0)).xyz);
  vec3 ro = uCamPos;

  // Crossfade exterior -> interior as the camera dives through the slab. At the
  // blend zone the slab fills the frame (dark glass), so the swap reads as
  // EMERGING through the button into the room rather than a hard cut. The blend
  // completes at 0.78 (well before uEnter settles at ~1) so the exterior path
  // doesn't flicker on/off as uEnter jitters in its last digits while inside.
  float reveal = smoothstep(0.5, 0.78, uEnter);

  vec3 extCol = uBg;
  if(reveal < 0.999) extCol = renderExterior(ro, rd);

  vec3 col = extCol;
  if(uEnter > 0.001){
    vec3 roomCol = renderRoom(ro, rd);
    col = mix(extCol, roomCol, reveal);
  }

  gl_FragColor = vec4(col, 1.0);

  #include <colorspace_fragment>
}
`;
