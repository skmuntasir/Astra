/**
 * GLSL port of traceSchw() (src/lib/bh/schw.ts): Schwarzschild planar tracer for an observer in radial free fall, valid inside the horizon.
 * Same dialect as shader.ts (three ShaderMaterial: varying / gl_FragColor / texture2D; the raw-WebGL2 test harness adds the macros).
 * The accumulate and present passes of shader.ts are reused unchanged. Equations: docs/BLACKHOLE.md ("Infall").
 */
import { DISC_LUT_SIZE, BB_LUT_SIZE, TRACE_MAX_STEPS, lookGlsl } from './shader'

export const schwTraceFrag = /* glsl */ `
precision highp float;
precision highp int;
varying vec2 vUv;
uniform vec2  uRes;          // render-target size (pixels)
uniform vec2  uJitter;       // sub-pixel jitter in pixels
uniform vec2  uTanHalf;      // tan(fov_x/2), tan(fov_y/2)
uniform mat3  uCamRot;       // camera-space vector (x right, y up, -z forward) -> hole-local cartesian (z = spin / disc axis)
uniform vec3  uEr;           // unit vector hole -> observer (hole-local)
uniform float uR0;           // observer radius, r_g
uniform float uEo, uP;       // observer energy and speed |dr/dtau| (see schw.ts)
uniform float uRIn, uROut;   // disc radii (r_g)
uniform float uTmaxK;        // disc peak colour temperature, K
uniform float uTime;         // simulation time (disc pattern)
uniform float uEps;
uniform int   uMaxSteps;
uniform float uExposure, uSkyGain, uPixAng;
uniform float uDisc, uJet, uJetGain;
uniform float uHue, uBeam;    // cinematic grade: uHue 1 = physical Doppler colour, < 1 = damped colour shift; uBeam 1 = physical relativistic beaming, < 1 = softened brightness asymmetry
uniform float uLook;         // 0 = as before; 1 = EHT-style false-colour (red-orange) look, same as shader.ts
uniform float uSkyShift;     // 1 = shift the sky colours by g (3-band model), 0 = off
uniform float uDebug;        // 0 = image; 1 = (kind, rMin, rHit, g); 2 = (sky direction xyz, kind)
uniform mat3  uBH2G;         // hole-local -> galactic cartesian
uniform sampler2D uSky;
uniform sampler2D uNoise;
uniform float uDiscT[${DISC_LUT_SIZE}];
uniform vec4  uBB[${BB_LUT_SIZE}];
const float PI = 3.14159265358979;
const float BB_TMIN = 300.0, BB_TMAX = 300000.0;
float gL, gL2, gE;

float rddF(float r){ float r2 = r*r; return gL2*(r - 3.0)/(r2*r2); }
float dphiF(float r){ return gL/(r*r); }
float dTF(float r, float v){ float b = sqrt(2.0/r); return -(gE*gE + (2.0/r)*(gL2/(r*r)))/max(gE + b*v, 1e-4); }

vec3 bbColor(float T){
  float x = clamp(log(clamp(T, BB_TMIN, BB_TMAX)/BB_TMIN)/log(BB_TMAX/BB_TMIN), 0.0, 1.0)*float(${BB_LUT_SIZE - 1});
  int i = min(int(floor(x)), ${BB_LUT_SIZE - 2}); float f = x - float(i);
  vec4 c = mix(uBB[i], uBB[i + 1], f);
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
  float texel = 2.0*PI/float(textureSize(uSky, 0).x);
  float lod = max(0.0, log2(max(uPixAng, 1e-6)/texel));
  return textureLod(uSky, uv, lod).rgb*uSkyGain;
}
// Doppler shift of the sky (g = nu_obs / nu_emitted). The RGB triple is read as I_nu at three frequencies (ln nu / nu_R = 0, 0.138, 0.299);
// I_nu / nu^3 is invariant, so I'_nu(nu) = g^3 I_nu(nu / g). Beyond the samples: Rayleigh-Jeans-like tail (nu^2) on the red side, steep cut on the blue side.
vec3 shiftSky(vec3 c, float g){
  float lg = log(max(g, 1e-4));
  vec3 o;
  for (int i = 0; i < 3; i++) {
    float x = (i == 0 ? 0.0 : (i == 1 ? 0.138 : 0.299)) - lg;
    float v;
    if (x <= 0.0) v = c.r*exp(2.0*x);
    else if (x < 0.138) v = mix(c.r, c.g, x/0.138);
    else if (x < 0.299) v = mix(c.g, c.b, (x - 0.138)/0.161);
    else v = c.b*exp(-6.0*(x - 0.299));
    if (i == 0) o.r = v; else if (i == 1) o.g = v; else o.b = v;
  }
  return o*g*g*g;
}
${lookGlsl}
vec3 discShade(float r, float phi, float t, float g){
  float u2 = log(r/uRIn)/log(uROut/uRIn);
  float T = discTemp(r);
  float Om = pow(r, -1.5);
  float uTex = (phi - Om*(uTime + t))/(2.0*PI);
  float n = textureLod(uNoise, vec2(uTex, clamp(u2, 0.0, 1.0)), 1.0).r;
  n = mix(n, 0.5, 0.85*uLook);
  float Tn = uTmaxK*T*(0.88 + 0.24*n);
  vec3 cTrue = bbColor(pow(max(g, 1e-3), uBeam)*Tn); // physical (uBeam = 1): Doppler shifts the colour AND the brightness; < 1 softens the brightness asymmetry
  if (uLook > 0.5) return lookColor(cTrue*(0.75 + 0.5*n*n)*uExposure*pow(clamp(g, 0.2, 3.0), 1.5*uLook)*2.7/(1.0 + pow(r/(2.15*uRIn), 4.0)));
  if (uHue > 0.999) return cTrue*(0.75 + 0.5*n*n)*uExposure;
  // cinematic grade (uHue < 1): the colour follows a damped Doppler shift (the approaching side stays gold instead of turning blue-white,
  // the receding side deepens to red, as in the film's Gargantua); the BRIGHTNESS follows uBeam (1 = full relativistic beaming)
  vec3 cHue = bbColor(pow(max(g, 1e-3), uHue)*Tn);
  float lT = dot(cTrue, vec3(0.2126, 0.7152, 0.0722)), lH = max(dot(cHue, vec3(0.2126, 0.7152, 0.0722)), 1e-12);
  return cHue*(lT/lH)*(0.75 + 0.5*n*n)*uExposure;
}

void main(){
  vec2 ndc = ((gl_FragCoord.xy + uJitter)/uRes)*2.0 - 1.0;
  vec3 dc = normalize(vec3(ndc.x*uTanHalf.x, ndc.y*uTanHalf.y, -1.0));
  vec3 look = normalize(uCamRot*dc);
  float r0 = uR0;
  float cps = dot(look, uEr);
  vec3 nt = look - cps*uEr;
  float sps = length(nt);
  vec3 et;
  if (sps > 1e-7) et = nt/sps;
  else { vec3 ax = abs(uEr.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0); et = normalize(cross(uEr, ax)); }
  float E = uEo + uP*cps;
  float L = max(r0*sps, 1e-6);
  gE = E; gL = L; gL2 = L*L;
  vec3 col = vec3(0.0);
  float kind = 0.0, rMinOut = r0, rHitOut = 0.0, gOut = 0.0;
  vec3 dbgDir = vec3(0.0);
  if (E <= 1e-9) { kind = 1.0; }
  else {
    float rd = uP + uEo*cps;
    float A = uEr.z, B = et.z;
    float phin = atan(-A, B);
    float Nz = cross(uEr, et).z;
    float r = r0, phi = 0.0, T = 0.0;
    float rStop = max(r0, 300.0);
    float rMin = r0;
    vec3 jet = vec3(0.0), acc = vec3(0.0); float trans = 1.0;
    for (int it = 0; it < ${TRACE_MAX_STEPS}; it++) {
      if (it >= uMaxSteps) break;
      float rate = max(abs(rd)/r, 0.5*sqrt(abs(rddF(r))/r)) + 0.5*dphiF(r) + 1e-4/r;
      float h = min(uEps/rate, 0.5*r);
      float k1r = rd,                       k1v = rddF(r),                        k1p = dphiF(r),                       k1t = dTF(r, rd);
      float r2 = r + 0.5*h*k1r, v2 = rd + 0.5*h*k1v;
      float k2r = v2,                       k2v = rddF(r2),                       k2p = dphiF(r2),                      k2t = dTF(r2, v2);
      float r3 = r + 0.5*h*k2r, v3 = rd + 0.5*h*k2v;
      float k3r = v3,                       k3v = rddF(r3),                       k3p = dphiF(r3),                      k3t = dTF(r3, v3);
      float r4 = r + h*k3r, v4 = rd + h*k3v;
      float k4r = v4,                       k4v = rddF(r4),                       k4p = dphiF(r4),                      k4t = dTF(r4, v4);
      float pr = r, pv = rd, pp = phi, pT = T;
      float h6 = h/6.0;
      r   += h6*(k1r + 2.0*k2r + 2.0*k3r + k4r);
      rd  += h6*(k1v + 2.0*k2v + 2.0*k3v + k4v);
      phi += h6*(k1p + 2.0*k2p + 2.0*k3p + k4p);
      T   += h6*(k1t + 2.0*k2t + 2.0*k3t + k4t);
      rMin = min(rMin, r);
      // ---- schematic jet (optically thin, accumulated along the path)
      if (uJet > 0.5 && r > 2.5) {
        float rm = 0.5*(r + pr), pm = 0.5*(phi + pp);
        float cm = cos(pm), sm = sin(pm);
        float uz = A*cm + B*sm;
        float z = rm*uz, rho = rm*sqrt(max(0.0, 1.0 - uz*uz)), az = abs(z);
        float wj = 0.7 + 0.55*pow(max(az, 0.0), 0.62);
        if (az > 2.5 && rho < 3.0*wj && az < 400.0) {
          float fm = 1.0 - 2.0/rm, sf = sqrt(fm);
          vec3 ur = cm*uEr + sm*et, up = -sm*uEr + cm*et;
          float rdm = 0.5*(rd + pv);
          vec3 kb = (rdm/sf)*ur + (L/rm)*up;             // backward tangent in the static frame
          vec3 Nf = -kb*sf/E;                              // forward propagation direction (unit)
          float cz = Nf.z;
          float sg = z > 0.0 ? 1.0 : -1.0, bj = 0.85, gj = 1.0/sqrt(1.0 - bj*bj);
          float nuEm = gj*(E/sf)*(1.0 - bj*sg*cz);
          float gg = 1.0/nuEm;
          float knots = 0.65 + 0.35*sin(0.45*az - 0.02*uTime);
          float em = exp(-(rho*rho)/(wj*wj))*pow(az, -1.2)*knots;
          jet += mix(vec3(0.55, 0.72, 1.0), vec3(1.0, 0.36, 0.06), uLook)*pow(gg, 2.7)*em*nuEm*h*uJetGain*mix(1.0, 0.3, uLook);
        }
      }
      // ---- equatorial plane crossing (the disc)
      float kp = floor((pp - phin)/PI), kn = floor((phi - phin)/PI);
      if (kn != kp) {
        float phc = phin + kn*PI;
        float x = (phc - pp)/(phi - pp), x2 = x*x, x3 = x2*x;
        float h00 = 2.0*x3 - 3.0*x2 + 1.0, h10 = x3 - 2.0*x2 + x, h01 = -2.0*x3 + 3.0*x2, h11 = x3 - x2;
        float rh = h00*pr + h10*pv*h + h01*r + h11*rd*h;
        if (rh >= uRIn && rh <= uROut && uDisc > 0.5) {
          vec3 u = cos(phc)*uEr + sin(phc)*et;
          float phiAz = atan(u.y, u.x);
          float th = pT + x*(T - pT);
          float ut = 1.0/sqrt(1.0 - 3.0/rh), Om = pow(rh, -1.5);
          float g = 1.0/(ut*(E + Om*L*Nz));
          float u2 = log(rh/uRIn)/log(uROut/uRIn);
          float alphaD = uDebug > 0.5 ? 1.0 : 1.0 - smoothstep(0.62, 1.0, u2);
          acc += trans*alphaD*discShade(rh, phiAz, th + uR0, g);
          trans *= 1.0 - alphaD;
          if (kind < 3.0) { kind = 3.0; rHitOut = rh; gOut = g; }
          if (trans < 0.02) { trans = 0.0; col = acc + jet; break; }
        }
      }
      if (r < 3.0 && rd < 0.0) { kind = (kind < 3.0 ? 1.0 : kind); col = acc + jet*(1.0 - uLook); break; } // EHT look: no jet light inside the shadow
      if (r > rStop && rd > 0.0) {
        float f2 = sqrt(1.0 - 2.0/r);
        vec3 ur = cos(phi)*uEr + sin(phi)*et, up = -sin(phi)*uEr + cos(phi)*et;
        vec3 dirHole = normalize((rd/f2)*ur + (L/r)*up);
        vec3 sc = skyColor(dirHole);
        if (uSkyShift > 0.5) sc = shiftSky(sc, 1.0/E);
        { float Ls = dot(sc, vec3(0.2126, 0.7152, 0.0722)); sc = mix(sc, mix(sc, Ls*vec3(1.0, 0.5, 0.22), 0.65)*0.3, uLook); } // EHT look: faint warm background
        col = acc + trans*sc + jet;
        dbgDir = dirHole;
        if (kind < 3.0) { kind = 2.0; gOut = 1.0/E; }
        break;
      }
    }
    rMinOut = rMin;
    if (kind == 0.0) { kind = 4.0; col = acc + jet; }
  }
  if (uDebug > 1.5) { gl_FragColor = vec4(dbgDir, kind); return; }
  if (uDebug > 0.5) { gl_FragColor = vec4(kind, rMinOut, rHitOut, gOut); return; }
  gl_FragColor = vec4(col, 1.0);
}
`
