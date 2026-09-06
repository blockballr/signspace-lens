// handshape.ts - parametric hand -> 21 MediaPipe landmarks.
//
// Ported from the web prototype's src/handshape.js (which used THREE for the
// finger-curl fan/bend). This version uses only math.ts. A handshape is described by
// four finger-curl values (0 = straight, 1 = curled), a spread amount, and a thumb
// preset. `makeLetter('A')` returns a frame in the same MediaPipe hand order used
// everywhere, so fingerspelling and whole-word signs play through one renderer.
//
// Fidelity note: recognizable approximations, not textbook-perfect ASL. A few pairs
// (S/T, K/P, G/Q) are only weakly distinguished here.

import { v3, addScaled, rotateAxisAngle, normalize } from './math';

export type V3 = [number, number, number];

// Axis used to bend finger segments (curl about local X).
const BEND_AXIS: V3 = [1, 0, 0];
// Axis used to fan fingers out (spread about local Z).
const FAN_AXIS: V3 = [0, 0, 1];

// Finger roots + segment lengths, matching the open hand. dir is the rest direction
// (mostly +Y), spreadSign fans left(+)/right(-) when spread > 0.
interface FingerDef {
  idx: number[]; // landmark indices [mcp, pip, dip, tip]
  mcp: V3;
  seg: number[];
  dir: V3;
  spreadSign: number;
}

const FINGERS: Record<string, FingerDef> = {
  index: { idx: [5, 6, 7, 8], mcp: v3(-0.18, 0.55, 0), seg: [0.20, 0.13, 0.10], dir: v3(-0.05, 1, 0), spreadSign: 1.0 },
  middle: { idx: [9, 10, 11, 12], mcp: v3(0.00, 0.58, 0), seg: [0.22, 0.14, 0.11], dir: v3(0.00, 1, 0), spreadSign: 0.3 },
  ring: { idx: [13, 14, 15, 16], mcp: v3(0.18, 0.55, 0), seg: [0.21, 0.13, 0.10], dir: v3(0.05, 1, 0), spreadSign: -0.3 },
  pinky: { idx: [17, 18, 19, 20], mcp: v3(0.34, 0.50, 0), seg: [0.16, 0.11, 0.09], dir: v3(0.12, 1, 0), spreadSign: -1.0 },
};

const CURL_GAINS = [0.7, 1.1, 0.9]; // per-segment bend; sums to ~155° at curl=1
const SPREAD_MAX = 0.28; // radians of fan at spread=1

const THUMB_CMC: V3 = v3(-0.30, 0.15, 0.02); // landmark 1, fixed

// Thumb presets give landmarks 2 (mcp), 3 (ip), 4 (tip).
const THUMB: Record<string, { mcp: V3; ip: V3; tip: V3 }> = {
  side: { mcp: v3(-0.30, 0.30, 0.03), ip: v3(-0.30, 0.44, 0.03), tip: v3(-0.29, 0.56, 0.03) },
  up: { mcp: v3(-0.40, 0.28, 0.05), ip: v3(-0.48, 0.42, 0.05), tip: v3(-0.52, 0.55, 0.05) },
  out: { mcp: v3(-0.45, 0.22, 0.03), ip: v3(-0.58, 0.30, 0.03), tip: v3(-0.70, 0.36, 0.03) },
  across: { mcp: v3(-0.15, 0.32, 0.12), ip: v3(0.02, 0.40, 0.14), tip: v3(0.16, 0.44, 0.14) },
  front: { mcp: v3(-0.10, 0.28, 0.20), ip: v3(0.06, 0.34, 0.22), tip: v3(0.18, 0.36, 0.20) },
  touch: { mcp: v3(-0.28, 0.35, 0.10), ip: v3(-0.20, 0.50, 0.16), tip: v3(-0.10, 0.60, 0.18) },
};

function buildFinger(def: FingerDef, curl: number, spread: number): V3[] {
  let dir = normalize(def.dir);
  dir = rotateAxisAngle(dir, FAN_AXIS, def.spreadSign * spread * SPREAD_MAX);
  let pos = [...def.mcp] as V3;
  const pts: V3[] = [[pos[0], pos[1], pos[2]]];
  for (let k = 0; k < 3; k++) {
    dir = rotateAxisAngle(dir, BEND_AXIS, curl * CURL_GAINS[k]);
    pos = addScaled(pos, dir, def.seg[k]);
    pts.push([pos[0], pos[1], pos[2]]);
  }
  return pts; // [mcp, pip, dip, tip]
}

export interface HandShapeCfg {
  fingers: [number, number, number, number];
  spread?: number;
  thumb?: string;
  crossed?: boolean;
}

export function makeHandshape(cfg: HandShapeCfg): V3[] {
  const L: V3[] = new Array(21);
  L[0] = v3(0, 0, 0); // wrist

  const order = ['index', 'middle', 'ring', 'pinky'] as const;
  order.forEach((name, i) => {
    const def = FINGERS[name];
    const pts = buildFinger(def, cfg.fingers[i], cfg.spread || 0);
    def.idx.forEach((li, k) => { L[li] = pts[k]; });
  });

  const th = THUMB[cfg.thumb || 'side'] || THUMB.side;
  L[1] = [...THUMB_CMC];
  L[2] = [...th.mcp];
  L[3] = [...th.ip];
  L[4] = [...th.tip];

  if (cfg.crossed) {
    // R: index and middle cross over each other.
    L[8] = [L[8][0] + 0.10, L[8][1], L[8][2] + 0.03];
    L[7] = [L[7][0] + 0.06, L[7][1], L[7][2] + 0.02];
    L[12] = [L[12][0] - 0.10, L[12][1], L[12][2] + 0.06];
    L[11] = [L[11][0] - 0.06, L[11][1], L[11][2] + 0.04];
  }
  return L;
}

export interface LetterCfg extends HandShapeCfg {
  motion?: 'J' | 'Z';
}

// ASL fingerspelling alphabet as parametric configs.
export const ALPHABET: Record<string, LetterCfg> = {
  A: { fingers: [1, 1, 1, 1], spread: 0, thumb: 'side' },
  B: { fingers: [0, 0, 0, 0], spread: 0, thumb: 'across' },
  C: { fingers: [0.4, 0.4, 0.4, 0.4], spread: 0, thumb: 'up' },
  D: { fingers: [0, 1, 1, 1], spread: 0, thumb: 'touch' },
  E: { fingers: [0.75, 0.75, 0.75, 0.75], spread: 0, thumb: 'across' },
  F: { fingers: [0.55, 0, 0, 0], spread: 0.2, thumb: 'touch' },
  G: { fingers: [0, 1, 1, 1], spread: 0, thumb: 'up' },
  H: { fingers: [0, 0, 1, 1], spread: 0, thumb: 'across' },
  I: { fingers: [1, 1, 1, 0], spread: 0, thumb: 'side' },
  J: { fingers: [1, 1, 1, 0], spread: 0, thumb: 'side', motion: 'J' },
  K: { fingers: [0, 0, 1, 1], spread: 0.25, thumb: 'up' },
  L: { fingers: [0, 1, 1, 1], spread: 0, thumb: 'out' },
  M: { fingers: [0.9, 0.9, 0.9, 1], spread: 0, thumb: 'front' },
  N: { fingers: [0.9, 0.9, 1, 1], spread: 0, thumb: 'front' },
  O: { fingers: [0.55, 0.55, 0.55, 0.55], spread: 0, thumb: 'touch' },
  P: { fingers: [0, 0, 1, 1], spread: 0.25, thumb: 'touch' },
  Q: { fingers: [0, 1, 1, 1], spread: 0, thumb: 'touch' },
  R: { fingers: [0, 0, 1, 1], spread: 0, thumb: 'across', crossed: true },
  S: { fingers: [1, 1, 1, 1], spread: 0, thumb: 'front' },
  T: { fingers: [1, 1, 1, 1], spread: 0, thumb: 'side' },
  U: { fingers: [0, 0, 1, 1], spread: 0, thumb: 'across' },
  V: { fingers: [0, 0, 1, 1], spread: 0.6, thumb: 'across' },
  W: { fingers: [0, 0, 0, 1], spread: 0.5, thumb: 'touch' },
  X: { fingers: [0.5, 1, 1, 1], spread: 0, thumb: 'side' },
  Y: { fingers: [1, 1, 1, 0], spread: 0, thumb: 'out' },
  Z: { fingers: [0, 1, 1, 1], spread: 0, thumb: 'side', motion: 'Z' },
};

export function makeLetter(ch: string): V3[] {
  const cfg = ALPHABET[ch.toUpperCase()];
  return cfg ? makeHandshape(cfg) : restPose();
}

// A relaxed, slightly-curled open hand for idle + inter-word rest.
export function restPose(): V3[] {
  return makeHandshape({ fingers: [0.15, 0.15, 0.15, 0.2], spread: 0.15, thumb: 'up' });
}