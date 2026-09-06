// math.ts - minimal vec3 / quaternion helpers.
//
// The web prototype used THREE.Vector3 and THREE.Quaternion for hand rotation and
// interpolation. Lens Studio scripts don't have THREE, so these tiny helpers replace
// exactly the math that pose.js and handshape.js relied on. Vectors are plain
// `number[]` [x, y, z] so they interoperate freely with landmark lists.

export type V3 = [number, number, number];

// --- basic vector ops (non-allocating where it matters) ------------------
export function v3(x = 0, y = 0, z = 0): V3 {
  return [x, y, z];
}

export function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function addScaled(a: V3, b: V3, s: number): V3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

export function length(a: V3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function normalize(a: V3): V3 {
  const len = length(a) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

// Rotate a vector about an arbitrary axis by angle (radians), axis need not be unit.
export function rotateAxisAngle(v: V3, axis: V3, angle: number): V3 {
  const a = normalize(axis);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
  const cross = [
    a[1] * v[2] - a[2] * v[1],
    a[2] * v[0] - a[0] * v[2],
    a[0] * v[1] - a[1] * v[0],
  ];
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  // Rodrigues: v*cos + (axis x v)*sin + axis*(axis.v)*(1-cos)
  return [
    v[0] * cos + cross[0] * sin + ax * dot * (1 - cos),
    v[1] * cos + cross[1] * sin + ay * dot * (1 - cos),
    v[2] * cos + cross[2] * sin + az * dot * (1 - cos),
  ];
}

// Euler rotation (XYZ order) applied about a pivot. Mirrors THREE.Euler 'XYZ'.
export function eulerAboutPivot(p: V3, pivot: V3, { x = 0, y = 0, z = 0 } = {}): V3 {
  const rel = sub(p, pivot);
  let out = rel;
  if (x !== 0) out = rotateAxisAngle(out, [1, 0, 0], x);
  if (z !== 0) out = rotateAxisAngle(out, [0, 0, 1], z);
  if (y !== 0) out = rotateAxisAngle(out, [0, 1, 0], y);
  return add(out, pivot);
}

// Element-wise linear interpolation of two 3-component arrays.
export function lerp(v: V3, t: V3, u: number): V3 {
  return [
    v[0] + (t[0] - v[0]) * u,
    v[1] + (t[1] - v[1]) * u,
    v[2] + (t[2] - v[2]) * u,
  ];
}