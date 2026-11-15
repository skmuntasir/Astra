/**
 * ASTRA v2 - GLSL for the Kerr black-hole renderer. WebGL2 / GLSL ES 3.00, but written in the three.js ShaderMaterial dialect
 * (`varying`, `gl_FragColor`, `texture2D`) so the same strings run in three and in the raw-WebGL test harness (tests/bh_gpu.mjs adds the macros).
 * The integrator is a line-by-line port of traceCPU() in kerr.ts: read both together. Equations: docs/BLACKHOLE.md.
 * Units: G = c = M = 1 (lengths in r_g). Mino time, E = 1, backward from the observer.
 */

export const TRACE_MAX_STEPS = 512
export const DISC_LUT_SIZE = 64
export const BB_LUT_SIZE = 128

export const traceVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`

export const lookGlsl = /* glsl */ `
// EHT-style false-colour palette (the EHT releases are radio images shown in an orange "afmhot"-like ramp, not true colour).
// Input x = display brightness 0..1; output = chromaticity with max channel 1: deep red -> red -> red-orange -> orange -> amber (never white).
vec3 ehtChroma(float x){
  const vec3 c0 = vec3(0.46, 0.015, 0.0), c1 = vec3(0.92, 0.09, 0.005), c2 = vec3(1.0, 0.26, 0.015), c3 = vec3(1.0, 0.46, 0.05), c4 = vec3(1.0, 0.68, 0.20);
  x = clamp(x, 0.0, 1.0);
  if (x < 0.25) return mix(c0, c1, x/0.25);
  if (x < 0.5)  return mix(c1, c2, (x - 0.25)/0.25);
  if (x < 0.75) return mix(c2, c3, (x - 0.5)/0.25);
  return mix(c3, c4, (x - 0.75)/0.25);
}
vec3 lookColor(vec3 lin){ // linear radiance (exposure applied) -> same luminance, EHT hue chosen from the tone-mapped brightness
  float L = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  float Lt = L*(1.0 + L/9.0)/(1.0 + L);
  vec3 ch = ehtChroma(Lt/0.85);
  return ch*(L/max(dot(ch, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
}
`

export const traceFrag = /* glsl */ `
precision highp float;
precision highp int;
varying vec2 vUv;
uniform vec2  uRes;          // render-target size (pixels)
uniform vec2  uJitter;       // sub-pixel jitter in pixels, (-0.5..0.5)
uniform vec2  uTanHalf;      // tan(fov_x/2), tan(fov_y/2)
uniform mat3  uCamRot;       // camera-space vector (x right, y up, -z forward) -> observer-local (r-hat, theta-hat, phi-hat) components
uniform float uA;            // spin a*
uniform float uR0, uMu0, uPhi0; // observer: BL radius (r_g), cos(theta), phi
uniform vec3  uBeta;         // observer velocity relative to its ZAMO (local components)
uniform float uRIn, uROut;   // disc radii (r_g)
uniform float uTmaxK;        // disc peak colour temperature, K
uniform float uTime;         // simulation time, r_g/c units (disc pattern rotation)
uniform float uEps;          // step accuracy (0.07 high .. 0.14 low)
uniform int   uMaxSteps;
uniform float uExposure, uSkyGain, uPixAng; // pixel angular size (rad) for the sky mip level
uniform float uDisc;         // 1 = draw the accretion disc
uniform float uJet, uJetGain; // 1 = draw the schematic jet
uniform float uHue, uBeam;    // cinematic grade: uHue 1 = physical Doppler colour, < 1 = damped colour shift; uBeam 1 = physical relativistic beaming, < 1 = softened brightness asymmetry
uniform float uHorizon;      // horizon marker strength 0..1
uniform float uLook;         // 0 = black-body colours as before; 1 = EHT-style false-colour radio look (red -> orange -> amber ramp of the observed brightness; warm jet; dimmed warm sky)
uniform float uDebug;        // 0 = image; 1 = debug record (kind, rMin, rHit, g); 2 = (sky direction xyz, kind)
uniform mat3  uBH2G;         // hole-local cartesian (z = spin axis) -> galactic cartesian (sky lookup)
uniform sampler2D uSky;      // Milky Way panorama (galactic coordinates, same convention as Sky.tsx)
uniform sampler2D uNoise;    // disc turbulence strip (u = azimuth, v = log radius)
uniform float uDiscT[${DISC_LUT_SIZE}]; // T(r)/Tmax, q = sqrt(ln(r/rIn)/ln(rOut/rIn))
uniform vec4  uBB[${BB_LUT_SIZE}];      // black body: rgb chromaticity, ln luminance
const float PI = 3.14159265358979;
const float BB_TMIN = 300.0, BB_TMAX = 300000.0;

float gA, gA2, gLam, gEta;

float rdd(float r){ float P = r*r + gA2 - gA*gLam; return 2.0*r*P - (r - 1.0)*(gEta + (gLam - gA)*(gLam - gA)); }
float mdd(float m){ return m*(gA2 - gEta - gLam*gLam - 2.0*gA2*m*m); }
float dphiF(float r, float m){ float D = r*r - 2.0*r + gA2, P = r*r + gA2 - gA*gLam; return -(gLam/max(1.0 - m*m, 1e-6) - gA + gA*P/D); }
float dtF(float r, float m){ float D = r*r - 2.0*r + gA2, P = r*r + gA2 - gA*gLam; return -(-gA*(gA*(1.0 - m*m) - gLam) + (r*r + gA2)*P/D); }

float omegaK(float r){ return 1.0/(r*sqrt(r) + gA); }
float utCirc(float r){ float sr = sqrt(r); return (r*sr + gA)/(pow(r, 0.75)*sqrt(max(r*sr - 3.0*sr + 2.0*gA, 1e-6))); }

vec3 bbColor(float T){
  float x = clamp(log(clamp(T, BB_TMIN, BB_TMAX)/BB_TMIN)/log(BB_TMAX/BB_TMIN), 0.0, 1.0)*float(${BB_LUT_SIZE - 1});
  int i = min(int(floor(x)), ${BB_LUT_SIZE - 2}); float f = x - float(i);
  vec4 a = uBB[i], b = uBB[i + 1];
  vec4 c = mix(a, b, f);
  return c.rgb*exp(c.a);
}
float discTemp(float r){
  float q = sqrt(clamp(log(r/uRIn)/log(uROut/uRIn), 0.0, 1.0))*float(${DISC_LUT_SIZE - 1});
  int i = min(int(floor(q)), ${DISC_LUT_SIZE - 2}); float f = q - float(i);
  return mix(uDiscT[i], uDiscT[i + 1], f);
}

vec3 skyColor(vec3 dirHole){
  vec3 g = normalize(uBH2G*dirHole);
  float l = atan(g.y, g.x);
  vec2 uv = vec2(0.5 - l/(2.0*PI), 0.5 + asin(clamp(g.z, -1.0, 1.0))/PI);
  float texel = 2.0*PI/float(textureSize(uSky, 0).x);   // angular size of one panorama texel at the equator
  float lod = max(0.0, log2(max(uPixAng, 1e-6)/texel));
  vec3 c = textureLod(uSky, uv, lod).rgb*uSkyGain;
  float Ls = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, mix(c, Ls*vec3(1.0, 0.5, 0.22), 0.65)*0.3, uLook); // EHT look: faint warm background instead of a bright blue-white sky
}

${lookGlsl}
// radiance (linear, exposure applied) of the disc at a hit
vec3 discShade(float r, float phi, float t, float g){
  float u2 = log(r/uRIn)/log(uROut/uRIn);
  float T = discTemp(r);
  float Om = omegaK(r);
  float uTex = (phi - Om*(uTime + t))/(2.0*PI);
  float n = textureLod(uNoise, vec2(uTex, clamp(u2, 0.0, 1.0)), 1.0).r;
  n = mix(n, 0.5, 0.85*uLook); // EHT look: soft blobs instead of fine concentric streaks
  float Tn = uTmaxK*T*(0.88 + 0.24*n);
  vec3 cTrue = bbColor(pow(max(g, 1e-3), uBeam)*Tn); // physical (uBeam = 1): Doppler shifts the colour AND the brightness; < 1 softens the brightness asymmetry
  if (uLook > 0.5) return lookColor(cTrue*(0.75 + 0.5*n*n)*uExposure*pow(clamp(g, 0.2, 3.0), 1.5*uLook)*2.7/(1.0 + pow(r/(2.15*uRIn), 4.0))); // ring envelope scales with the inner edge (ISCO) // EHT look: physical brightness (beaming + redshift kept) with the emission concentrated in a ring near the hole; orange ramp for colour
  if (uHue > 0.999) return cTrue*(0.75 + 0.5*n*n)*uExposure;
  // cinematic grade (uHue < 1): the colour follows a damped Doppler shift (the approaching side stays gold instead of turning blue-white,
  // the receding side deepens to red, as in the film's Gargantua); the BRIGHTNESS follows uBeam (1 = full relativistic beaming)
  vec3 cHue = bbColor(pow(max(g, 1e-3), uHue)*Tn);
  float lT = dot(cTrue, vec3(0.2126, 0.7152, 0.0722)), lH = max(dot(cHue, vec3(0.2126, 0.7152, 0.0722)), 1e-12);
  return cHue*(lT/lH)*(0.75 + 0.5*n*n)*uExposure;
}

void main(){
  gA = uA; gA2 = uA*uA;
  vec2 ndc = ((gl_FragCoord.xy + uJitter)/uRes)*2.0 - 1.0;
  vec3 dc = normalize(vec3(ndc.x*uTanHalf.x, ndc.y*uTanHalf.y, -1.0));
  vec3 n = normalize(uCamRot*dc);               // look direction, observer-local components
  float r0 = uR0, mu0 = uMu0;
  float s2 = 1.0 - mu0*mu0, sin0 = sqrt(s2);
  float Sig = r0*r0 + gA2*mu0*mu0, Del = r0*r0 - 2.0*r0 + gA2;
  float AA = pow(r0*r0 + gA2, 2.0) - gA2*Del*s2;
  float alpha = sqrt(Sig*Del/AA), omega = 2.0*gA*r0/AA, varpi = sqrt(AA*s2/Sig);
  vec3 Nz = -n; float nuZ = 1.0;
  float b2 = dot(uBeta, uBeta);
  if (b2 > 1e-12) {
    float gam = 1.0/sqrt(1.0 - b2), bn = dot(uBeta, Nz);
    float k = (gam - 1.0)*bn/b2 + gam, den = gam*(1.0 + bn);
    Nz = (Nz + k*uBeta)/den; nuZ = gam*(1.0 + bn);
  }
  float w0 = alpha + omega*varpi*Nz.z;
  vec3 col = vec3(0.0);
  float kind = 0.0, rMinOut = r0, rHitOut = 0.0, gOut = 0.0;
  vec3 dbgDir = vec3(0.0); vec4 dbgState = vec4(0.0);
  if (w0 <= 1e-6) { kind = 1.0; }
  else {
    gLam = varpi*Nz.z/w0;
    gEta = Sig*Nz.y*Nz.y/(w0*w0) + mu0*mu0*(gLam*gLam/s2 - gA2);
    float nuObs = 1.0/(nuZ*w0);
    float r = r0, pr = -sqrt(Del*Sig)*Nz.x/w0;
    float mu = mu0, pm = sin0*sqrt(Sig)*Nz.y/w0;
    float phi = uPhi0, t = 0.0;
    float rp = 1.0 + sqrt(max(0.0, 1.0 - gA2));
    float rPhPro = 2.0*(1.0 + cos((2.0/3.0)*acos(clamp(-gA, -1.0, 1.0))));
    float rCap = rp + min(0.02, 0.3*(rPhPro - rp));
    float rStop = max(r0, 300.0);
    float rMin = r0;
    float prevR, prevMu, prevPr, prevPm, prevPhi, prevT;
    vec3 jet = vec3(0.0), acc = vec3(0.0); float trans = 1.0;
    for (int it = 0; it < ${TRACE_MAX_STEPS}; it++) {
      if (it >= uMaxSteps) break;
      float ph = abs(dphiF(r, mu));
      float rate = max(abs(pr)/r, 0.5*sqrt(abs(rdd(r))/r)) + 0.5*min(ph, 4000.0) + 0.3*abs(pm) + 0.5*min(abs(mu*pm)/max(1.0 - mu*mu, 1e-7), 4000.0) + 0.2; // pole-pass anticipation
      float h = min(uEps/rate, 0.35);
      // RK4 on (r, pr, mu, pm, phi, t)
      float k1r = pr,                     k1p = rdd(r),                    k1m = pm,                     k1q = mdd(mu),                    k1f = dphiF(r, mu),                    k1t = dtF(r, mu);
      float r2 = r + 0.5*h*k1r, p2 = pr + 0.5*h*k1p, m2 = mu + 0.5*h*k1m, q2 = pm + 0.5*h*k1q;
      float k2r = p2, k2p = rdd(r2), k2m = q2, k2q = mdd(m2), k2f = dphiF(r2, m2), k2t = dtF(r2, m2);
      float r3 = r + 0.5*h*k2r, p3 = pr + 0.5*h*k2p, m3 = mu + 0.5*h*k2m, q3 = pm + 0.5*h*k2q;
      float k3r = p3, k3p = rdd(r3), k3m = q3, k3q = mdd(m3), k3f = dphiF(r3, m3), k3t = dtF(r3, m3);
      float r4 = r + h*k3r, p4 = pr + h*k3p, m4 = mu + h*k3m, q4 = pm + h*k3q;
      float k4r = p4, k4p = rdd(r4), k4m = q4, k4q = mdd(m4), k4f = dphiF(r4, m4), k4t = dtF(r4, m4);
      prevR = r; prevMu = mu; prevPr = pr; prevPm = pm; prevPhi = phi; prevT = t;
      float f0 = dphiF(r, mu), t0 = dtF(r, mu);
      float h6 = h/6.0;
      r  += h6*(k1r + 2.0*k2r + 2.0*k3r + k4r);
      pr += h6*(k1p + 2.0*k2p + 2.0*k3p + k4p);
      mu += h6*(k1m + 2.0*k2m + 2.0*k3m + k4m);
      pm += h6*(k1q + 2.0*k2q + 2.0*k3q + k4q);
      phi+= h6*(k1f + 2.0*k2f + 2.0*k3f + k4f);
      t  += h6*(k1t + 2.0*k2t + 2.0*k3t + k4t);
      { // project onto the first integrals pr^2 = R(r), pmu^2 = Mu(mu) (sign kept)
        float P = r*r + gA2 - gA*gLam, D = r*r - 2.0*r + gA2;
        float Rr = P*P - D*(gEta + (gLam - gA)*(gLam - gA));
        if (Rr > 0.0) pr = (pr < 0.0 ? -1.0 : 1.0)*sqrt(Rr);
        float Mm = (1.0 - mu*mu)*(gEta + gA2*mu*mu) - gLam*gLam*mu*mu;
        if (Mm > 0.0) pm = (pm < 0.0 ? -1.0 : 1.0)*sqrt(Mm);
      }
      rMin = min(rMin, r);
      // ---- schematic jet: optically thin emission accumulated along the path (before the ray ends)
      if (uJet > 0.5 && r > 1.5) {
        float rm = 0.5*(r + prevR), mm = 0.5*(mu + prevMu);
        float z = rm*mm, rho = rm*sqrt(max(0.0, 1.0 - mm*mm)), az = abs(z);
        float wj = 0.7 + 0.55*pow(max(az, 0.0), 0.62);
        if (az > 2.5 && rho < 3.0*wj && az < 400.0) {
          float Se = rm*rm + gA2*mm*mm, De = rm*rm - 2.0*rm + gA2, s2e = 1.0 - mm*mm;
          float Ae = pow(rm*rm + gA2, 2.0) - gA2*De*s2e;
          float al = sqrt(Se*De/Ae), om = 2.0*gA*rm/Ae;
          float we = al/(1.0 - gLam*om);
          float Nr = -0.5*(pr + prevPr)*we/sqrt(De*Se);
          float Nt = (0.5*(pm + prevPm)/sqrt(max(s2e, 1e-6)))*we/sqrt(Se);
          float cz = Nr*mm - Nt*sqrt(s2e);       // N . z-hat (spheroidal axes)
          float sg = z > 0.0 ? 1.0 : -1.0, bj = 0.85, gj = 1.0/sqrt(1.0 - bj*bj);
          float nuEm = gj*(1.0/we)*(1.0 - bj*sg*cz);
          float gg = nuObs/nuEm;
          float knots = 0.65 + 0.35*sin(0.45*az - 0.02*uTime);
          float em = exp(-(rho*rho)/(wj*wj))*pow(az, -1.2)*knots;
          jet += mix(vec3(0.55, 0.72, 1.0), vec3(1.0, 0.36, 0.06), uLook)*pow(gg, 2.7)*em*nuEm*Se*h*uJetGain*mix(1.0, 0.3, uLook);
        }
      }
      // ---- equatorial-plane crossing (the disc)
      if (prevMu*mu < 0.0) {
        float m0 = prevMu, m1 = mu, d0 = prevPm*h, d1 = pm*h;
        float lo = 0.0, hi = 1.0;
        for (int k = 0; k < 14; k++) {
          float mid = 0.5*(lo + hi);
          float xl = lo, xm = mid;
          float Hl = (2.0*xl*xl*xl - 3.0*xl*xl + 1.0)*m0 + (xl*xl*xl - 2.0*xl*xl + xl)*d0 + (-2.0*xl*xl*xl + 3.0*xl*xl)*m1 + (xl*xl*xl - xl*xl)*d1;
          float Hm = (2.0*xm*xm*xm - 3.0*xm*xm + 1.0)*m0 + (xm*xm*xm - 2.0*xm*xm + xm)*d0 + (-2.0*xm*xm*xm + 3.0*xm*xm)*m1 + (xm*xm*xm - xm*xm)*d1;
          if (Hl*Hm <= 0.0) hi = mid; else lo = mid;
        }
        float x = 0.5*(lo + hi), x2 = x*x, x3 = x2*x;
        float h00 = 2.0*x3 - 3.0*x2 + 1.0, h10 = x3 - 2.0*x2 + x, h01 = -2.0*x3 + 3.0*x2, h11 = x3 - x2;
        float rh = h00*prevR + h10*prevPr*h + h01*r + h11*pr*h;
        if (rh >= uRIn && rh <= uROut && uDisc > 0.5) {
          float phh = h00*prevPhi + h10*f0*h + h01*phi + h11*dphiF(r, mu)*h;
          float th = h00*prevT + h10*t0*h + h01*t + h11*dtF(r, mu)*h;
          float g = nuObs/(utCirc(rh)*(1.0 - omegaK(rh)*gLam));
          // outer disc edge is translucent (optical depth falls off): the sky shows through instead of a hard black rim. Test/debug modes stay opaque.
          float u2 = log(rh/uRIn)/log(uROut/uRIn);
          float alphaD = uDebug > 0.5 ? 1.0 : 1.0 - smoothstep(0.62, 1.0, u2);
          acc += trans*alphaD*discShade(rh, phh, th + uR0, g); // t + r0: coordinate time relative to the light-travel time to the observer
          trans *= 1.0 - alphaD;
          if (kind < 3.0) { kind = 3.0; rHitOut = rh; gOut = g; }
          if (trans < 0.02) { trans = 0.0; col = acc + jet; break; }
        }
      }
      if (r < rCap) {
        kind = 1.0;
        // horizon marker: grid in ingoing coordinates (phi~ = phi + a/(r+ - r-) ln((r - r+)/(r - r-)), finite at the horizon)
        float rm_ = 1.0 - sqrt(max(0.0, 1.0 - gA2));
        float pt = phi;
        if (gA > 1e-4 && rp - rm_ > 1e-4) pt = phi + gA/(rp - rm_)*log(max((r - rp)/(r - rm_), 1e-6));
        float th = acos(clamp(mu, -1.0, 1.0));
        float g1 = abs(fract(pt/(PI/6.0) + 0.5) - 0.5)*(PI/6.0), g2 = abs(fract(th/(PI/6.0) + 0.5) - 0.5)*(PI/6.0);
        float line = (1.0 - smoothstep(0.0, 0.05, min(g1, g2)));
        col = acc + jet*(1.0 - uLook) + trans*uHorizon*vec3(0.10, 0.22, 0.36)*line*uExposure*0.6; // EHT look: the near-face-on jet must not fill the shadow
        break;
      }
      if (r > rStop && pr > 0.0) {
        float s2e = 1.0 - mu*mu, sine = sqrt(max(s2e, 1e-9));
        float Se = r*r + gA2*mu*mu, De = r*r - 2.0*r + gA2;
        float Ae = pow(r*r + gA2, 2.0) - gA2*De*s2e;
        float al = sqrt(Se*De/Ae), om = 2.0*gA*r/Ae, vp = sqrt(Ae*s2e/Se);
        float we = al/(1.0 - gLam*om);
        float Nr = -pr*we/sqrt(De*Se), Nt = (pm/sine)*we/sqrt(Se), Np = gLam*al/(vp*(1.0 - gLam*om));
        vec3 s = -vec3(Nr, Nt, Np); s /= length(s);
        float cp = cos(phi), sph = sin(phi);
        vec3 rh_ = vec3(sine*cp, sine*sph, mu), th_ = vec3(mu*cp, mu*sph, -sine), ph_ = vec3(-sph, cp, 0.0);
        vec3 dirHole = normalize(s.x*rh_ + s.y*th_ + s.z*ph_);
        col = acc + trans*skyColor(dirHole) + jet;
        dbgDir = dirHole;
        if (kind < 3.0) kind = 2.0;
        break;
      }
    }
    rMinOut = rMin; dbgState = vec4(r, mu, pr, pm);
    if (kind == 0.0) { kind = 4.0; col = acc + jet; } // ran out of steps (photon-ring region): black
  }
  if (uDebug > 2.5) { gl_FragColor = dbgState; return; }
  if (uDebug > 1.5) { gl_FragColor = vec4(dbgDir, kind); return; }
  if (uDebug > 0.5) { gl_FragColor = vec4(kind, rMinOut, rHitOut, gOut); return; }
  gl_FragColor = vec4(col, 1.0);
}
`

// ------------------------------------------------------------------ temporal accumulation (history at output resolution)
export const accumFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uCur;    // this frame's jittered low-res sample
uniform sampler2D uHist;   // previous output (full res)
uniform vec2 uCurRes, uOutRes;
uniform float uBlend;      // history weight (0 = no history)
uniform mat3 uReproj;      // maps this frame's view ray (camera space) to the previous frame's camera space (rotation only)
uniform vec2 uTanHalf;
uniform vec2 uJitterUv;    // jitter used for uCur, in low-res uv units
vec3 tap(vec2 uv){ return texture2D(uCur, uv).rgb; }
void main(){
  vec2 px = 1.0/uCurRes;
  vec2 uvc = vUv - uJitterUv;                 // the low-res sample of this frame was taken at pixel centre + jitter
  vec3 cur = tap(uvc), mn = cur, mx = cur;     // bilinear tap: successive jitters supersample, history carries the detail
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec3 s = tap(uvc + vec2(float(i), float(j))*px); mn = min(mn, s); mx = max(mx, s); }
  // history lookup (rotation reprojection)
  vec3 dc = vec3((vUv*2.0 - 1.0)*uTanHalf, -1.0);
  vec3 dp = uReproj*dc;
  vec2 hv = dp.xy/(-dp.z)/uTanHalf*0.5 + 0.5;
  vec3 hist = texture2D(uHist, hv).rgb;
  float inside = step(0.0, hv.x)*step(hv.x, 1.0)*step(0.0, hv.y)*step(hv.y, 1.0);
  vec3 hc = clamp(hist, mn - 0.02*(mx - mn), mx + 0.02*(mx - mn));
  float w = uBlend*inside;
  gl_FragColor = vec4(mix(cur, hc, w), 1.0);
}
`

// ------------------------------------------------------------------ present (tone map) - drawn by the mesh inside the persistent canvas
export const presentVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = position.xy*0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`
export const presentFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uAlpha;
// colour-preserving filmic curve on LUMINANCE (hue kept; no per-channel tone map, no additive stacking)
vec3 tonemap(vec3 c){
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (L < 1e-8) return c;
  float Lt = L*(1.0 + L/9.0)/(1.0 + L);
  vec3 o = c*(Lt/L);
  float m = max(o.r, max(o.g, o.b));
  if (m > 1.0) o /= m;
  return o;
}
void main(){
  vec3 c = tonemap(max(texture2D(uTex, vUv).rgb, 0.0));
  gl_FragColor = vec4(c, uAlpha);
  #include <colorspace_fragment>
}`
