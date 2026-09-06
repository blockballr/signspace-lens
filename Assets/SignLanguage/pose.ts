// pose.ts - a "pose" is the state of both hands in a single frame.
//
// A single hand is 21 [x, y, z] landmarks in MediaPipe Hand order. A pose is
// { R, L } where R is the right hand and L is the left hand, or null when only one
// hand is signing. Whole-word signs play as sequences of poses through the two-hand
// renderer; fingerspelling (one hand) sets L to null.
//
// Ported from the web prototype's src/pose.js (dropped THREE for math.ts).

import type { V3 } from './math';
import { lerp, eulerAboutPivot } from './math';

export interface Pose {
  R: V3[];
  L: V3[] | null;
}

export function pose(R: V3[], L: V3[] | null = null): Pose {
  return { R, L };
}

function lerpFrame(a: V3[], b: V3[], t: number): V3[] {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = lerp(a[i], b[i], t);
  }
  return out;
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const R = lerpFrame(a.R, b.R, t);
  let L: V3[] | null = null;
  if (a.L && b.L) L = lerpFrame(a.L, b.L, t);
  else if (b.L) L = b.L;
  else if (a.L) L = a.L;
  return { R, L };
}

export function translateHand(hand: V3[], dx: number, dy: number, dz: number): V3[] {
  return hand.map((p) => [p[0] + dx, p[1] + dy, p[2] + dz]);
}

export function translatePose(p: Pose, dx: number, dy: number, dz: number): Pose {
  return pose(
    translateHand(p.R, dx, dy, dz),
    p.L ? translateHand(p.L, dx, dy, dz) : null,
  );
}

// Mirror a right hand into a left hand across the YZ plane (x -> -x). The thumb,
// which points -x on the right hand, ends up pointing +x - correct for a left hand.
export function mirrorHand(hand: V3[]): V3[] {
  return hand.map((p) => [-p[0], p[1], p[2]]);
}

// Rotate a hand about its wrist (landmark 0) by euler angles {x, y, z} in radians.
// The wrist stays put; the fingers swing - this is how a sign orients the palm
// (toward the viewer, upward, tilted, etc.).
export function rotateHand(hand: V3[], { x = 0, y = 0, z = 0 } = {}): V3[] {
  const pivot = hand[0];
  return hand.map((p) => eulerAboutPivot(p, pivot, { x, y, z }));
}