// resolve.ts - turn input text into one playable clip.
//
// For each gloss token: if the sign dictionary has it, play the whole-word sign;
// otherwise fingerspell it. Concatenated into a single clip with blended
// transitions between adjacent tokens.
//
// Ported from the web prototype's src/resolve.js.

import type { V3 } from './math';
import { getSignClip, hasSign, PHRASES, refUrl } from './signs';
import { fingerspellClip } from './fingerspell';
import type { Clip } from './fingerspell';
import { lerp } from './math';

const TRANSITION = 6; // frames blended between adjacent tokens

export interface GlossToken {
  token: string;
  mode: 'sign' | 'spell';
  ref?: string;
}

// Split raw input into gloss tokens. Multi-word phrases (e.g. "thank you") collapse to
// one token first; then split on whitespace and strip non-letter/non-hyphen chars.
function tokenize(text: string): string[] {
  let s = ` ${text} `;
  for (const [re, replacement] of PHRASES) s = s.replace(re, ` ${replacement} `);
  return s
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z-]/g, ''))
    .filter(Boolean);
}

function lerpHand(a: V3[], b: V3[], t: number): V3[] {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = lerp(a[i], b[i], t);
  return out;
}

// Concatenate clips into one, blending TRANSITION frames between each so the hands
// glide from one sign/word to the next instead of teleporting.
function concat(clips: Clip[]): Clip {
  const frames: Clip['frames'] = [];
  const labels: string[] = [];
  clips.forEach((c, i) => {
    if (i > 0 && frames.length && c.frames.length) {
      const from = frames[frames.length - 1];
      const to = c.frames[0];
      for (let k = 1; k <= TRANSITION; k++) {
        frames.push({
          R: lerpHand(from.R, to.R, k / TRANSITION),
          L: from.L && to.L ? lerpHand(from.L, to.L, k / TRANSITION) : (to.L || from.L),
        });
        labels.push('');
      }
    }
    for (let k = 0; k < c.frames.length; k++) {
      frames.push(c.frames[k]);
      labels.push(c.labels[k]);
    }
  });
  return { name: 'utterance', fps: 30, frames, labels };
}

// Resolve free text into { clip, gloss } where gloss is the token-by-token plan (each
// entry marks whether it was signed or fingerspelled).
export function resolveText(text: string): { clip: Clip | null; gloss: GlossToken[] } {
  const tokens = tokenize(text);
  const clips: Clip[] = [];
  const gloss: GlossToken[] = [];

  for (const tok of tokens) {
    if (hasSign(tok)) {
      const c = getSignClip(tok);
      if (c) clips.push(c);
      gloss.push({ token: tok.toUpperCase(), mode: 'sign', ref: refUrl(tok) });
    } else {
      clips.push(fingerspellClip(tok));
      gloss.push({ token: tok.toUpperCase(), mode: 'spell' });
    }
  }

  if (!clips.length) return { clip: null, gloss: [] };
  return { clip: concat(clips), gloss };
}