// fingerspell.ts - turn a word into a playable landmark clip.
//
// For each letter: a short transition from the previous pose, then a hold. Doubled
// letters get a small lateral re-articulation bounce so "LL" reads as two letters.
// J and Z carry a motion path traced during their hold. Spaces insert a rest beat.
// Output is a { name, fps, frames } clip plus `labels` so the HUD can show the current
// letter. Frames are two-hand poses; fingerspelling uses the right hand only, so the
// left hand (L) is null and the renderer hides it.
//
// Ported from the web prototype's src/fingerspell.js.

import type { V3 } from './math';
import { makeLetter, ALPHABET, restPose } from './handshape';
import { lerp } from './math';

const FPS = 30;
const TRANSITION = 5; // frames to morph between letters
const HOLD = 11; // frames to hold a letter

function lerpFrame(a: V3[], b: V3[], t: number): V3[] {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = lerp(a[i], b[i], t);
  }
  return out;
}

function translate(frame: V3[], dx: number, dy: number, dz: number): V3[] {
  return frame.map((p) => [p[0] + dx, p[1] + dy, p[2] + dz] as V3);
}

// Motion offsets (dx, dy, dz) as a function of progress u in [0,1].
const MOTION: Record<string, (u: number) => [number, number, number]> = {
  // J: pinky drops and hooks to the left.
  J: (u) => [-0.28 * u, -0.30 * Math.sin(u * Math.PI * 0.9), 0],
  // Z: index traces a Z - right, diagonal down-left, right.
  Z: (u) => {
    if (u < 0.33) return [0.30 * (u / 0.33), 0.0, 0];
    if (u < 0.66) { const k = (u - 0.33) / 0.33; return [0.30 - 0.30 * k, -0.30 * k, 0]; }
    const k = (u - 0.66) / 0.34; return [0.0 + 0.30 * k, -0.30, 0];
  },
};

export interface Clip {
  name: string;
  fps: number;
  frames: { R: V3[]; L: V3[] | null }[];
  labels: string[];
}

export function fingerspellClip(text: string): Clip {
  const rest = restPose();
  const frames: Clip['frames'] = [];
  const labels: string[] = [];
  const push = (f: V3[], l: string) => { frames.push({ R: f, L: null }); labels.push(l); };

  const tokens = text.toUpperCase().replace(/[^A-Z ]/g, '').split('');
  let prev = rest;
  let prevLetter = '';

  for (const ch of tokens) {
    if (ch === ' ') {
      for (let i = 1; i <= TRANSITION; i++) push(lerpFrame(prev, rest, i / TRANSITION), '·');
      for (let i = 0; i < 4; i++) push(rest, '·');
      prev = rest;
      prevLetter = '';
      continue;
    }
    if (!ALPHABET[ch]) continue;

    // Re-articulate a doubled letter with a quick sideways bounce.
    if (ch === prevLetter) {
      const bumped = translate(prev, 0.18, 0, 0);
      for (let i = 1; i <= 3; i++) push(lerpFrame(prev, bumped, i / 3), ch);
      prev = bumped;
    }

    const pose = makeLetter(ch);
    for (let i = 1; i <= TRANSITION; i++) push(lerpFrame(prev, pose, i / TRANSITION), ch);

    const motion = ALPHABET[ch].motion ? MOTION[ALPHABET[ch].motion] : null;
    for (let i = 0; i < HOLD; i++) {
      if (motion) {
        const [dx, dy, dz] = motion(i / (HOLD - 1));
        push(translate(pose, dx, dy, dz), ch);
      } else {
        push(pose, ch);
      }
    }
    prev = makeLetter(ch); // reset to the clean pose (motion offsets not carried)
    prevLetter = ch;
  }

  // Settle back to rest.
  for (let i = 1; i <= TRANSITION + 2; i++) push(lerpFrame(prev, rest, i / (TRANSITION + 2)), '');

  return { name: `spell:${text}`, fps: FPS, frames, labels };
}

// Idle: a slow, low-amplitude sway of the rest pose so the hand looks alive.
export function idleClip({ frames = 120, fps = FPS } = {}): Clip {
  const rest = restPose();
  const out: Clip['frames'] = [];
  for (let f = 0; f < frames; f++) {
    const t = f / frames;
    const dx = 0.05 * Math.sin(t * Math.PI * 2);
    const dy = 0.03 * Math.sin(t * Math.PI * 4);
    out.push({ R: translate(rest, dx, dy, 0), L: null });
  }
  return { name: 'idle', fps, frames: out, labels: out.map(() => '') };
}