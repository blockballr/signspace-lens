// HandRig.ts — MeshBuilder-built hand skeleton driven purely by transform writes.
//
// Stage 2 of SignSpace. Built once at startup:
//   - two shared unit meshes (sphere for joints/palm, cylinder body for segments)
//   - 21 joint spheres + 15 segment cylinders + 1 palm volume per hand
// Per frame:
//   - setPose() writes ONLY local transforms (position/rotation/scale)
//   - zero JS allocation, zero mesh rebuilds
//
// Landmark input: 21 [x,y,z] points in MediaPipe hand order (see SignLanguage/handshape.ts).
// Mapping to world: (x, y, z) landmark units * scale cm. +Z faces the camera at origin
// (DeviceTracking World: camera looks down -Z, objects at -Z render in front).

import type { V3 } from "../SignLanguage/math";

// Segment chains as landmark index runs (thumb, index, middle, ring, pinky).
const CHAINS: number[][] = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

// Palm volume is fit from these landmark indices.
const PALM_IDS: number[] = [0, 5, 9, 13, 17];

interface HandRigOptions {
  material: Material;
  jointRadius: number; // fraction of segment radius
}

export class HandRig {
  readonly root: SceneObject;

  private sphereMesh: RenderMesh;
  private cylMesh: RenderMesh;
  private material: Material;

  private joints: SceneObject[] = [];
  private tips: SceneObject[] = []; // landmarks 4, 8, 12, 16, 20 get larger caps
  private segments: SceneObject[] = [];
  private palm: SceneObject;

  private leftHand: boolean;
  private jointRadius: number;
  private visible = true;

  // Up-vector fallbacks for quat.lookAt when a segment points straight up/down.
  private static UP = new vec3(0, 1, 0);
  private static ALT_UP = new vec3(1, 0, 0);

  constructor(parent: SceneObject, name: string, opts: HandRigOptions, leftHand: boolean) {
    this.material = opts.material;
    this.leftHand = leftHand;
    this.jointRadius = opts.jointRadius;

    this.sphereMesh = HandRig.buildUnitSphere();
    print("[SignSpace] rig " + name + ": sphere ok");
    this.cylMesh = HandRig.buildUnitSegment();
    print("[SignSpace] rig " + name + ": segment ok");

    this.root = global.scene.createSceneObject(name);
    this.root.setParent(parent);

    this.palm = this.makeVisual("palm", this.sphereMesh, 1.0);

    for (let i = 0; i < 21; i++) {
      const j = this.makeVisual("j" + i, this.sphereMesh, 1.0);
      this.joints.push(j);
    }
    for (let c = 0; c < CHAINS.length; c++) {
      for (let s = 0; s < 3; s++) {
        const seg = this.makeVisual("seg" + c + "_" + s, this.cylMesh, 1.0);
        this.segments.push(seg);
      }
    }
  }

  private makeVisual(name: string, mesh: RenderMesh, renderOrder: number): SceneObject {
    const obj = global.scene.createSceneObject(name);
    obj.setParent(this.root);
    const visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    visual.mesh = mesh;
    visual.mainMaterial = this.material;
    visual.setRenderOrder(renderOrder);
    return obj;
  }

  // Push a 21-landmark pose into the rig. All writes are local-transform writes.
  setPose(landmarks: V3[], scale: number) {
    if (!landmarks || landmarks.length < 21 || !this.visible) return;

    const sign = this.leftHand ? -1 : 1;

    // Scratch values (number tuples, not scene allocations).
    const p: number[][] = new Array(21);
    for (let i = 0; i < 21; i++) {
      p[i] = [landmarks[i][0] * sign * scale, landmarks[i][1] * scale, landmarks[i][2] * scale];
    }

    // Palm volume: centroid of wrist + MCP row, sized from the MCP span.
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < PALM_IDS.length; k++) {
      cx += p[PALM_IDS[k]][0]; cy += p[PALM_IDS[k]][1]; cz += p[PALM_IDS[k]][2];
    }
    cx /= PALM_IDS.length; cy /= PALM_IDS.length; cz /= PALM_IDS.length;
    const span = HandRig.dist(p[5], p[17]);
    const palmLen = HandRig.dist(p[0], p[9]);
    const palmT = this.palm.getTransform();
    palmT.setLocalPosition(new vec3(cx, cy, cz));
    palmT.setLocalScale(new vec3(span * 0.42, palmLen * 0.5, palmLen * 0.26));
    palmT.setLocalRotation(quat.lookAt(HandRig.UP, new vec3(0, 0, 1)));

    // Joint spheres.
    const jr = scale * this.jointRadius;
    for (let i = 0; i < 21; i++) {
      const t = this.joints[i].getTransform();
      t.setLocalPosition(new vec3(p[i][0], p[i][1], p[i][2]));
      t.setLocalScale(new vec3(jr, jr, jr));
    }

    // Segment cylinders: anchored at A, scaled to |A-B|, oriented -Z toward (B-A).
    for (let s = 0; s < this.segments.length; s++) {
      const chain = CHAINS[Math.floor(s / 3)];
      const a = chain[s % 3];
      const b = chain[(s % 3) + 1];
      const pa = p[a], pb = p[b];
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const dir = new vec3(dx, dy, dz);
      if (len < 1e-5) {
        this.segments[s].getTransform().setLocalScale(new vec3(jr * 0.8, jr * 0.8, jr * 0.8));
        continue;
      }
      dir.normalize();
      // Unit cylinder spans z in [-1, 0] with radius 1: scale z by len -> spans A..B.
      const up = Math.abs(dir.y) > 0.99 ? HandRig.ALT_UP : HandRig.UP;
      const t = this.segments[s].getTransform();
      t.setLocalPosition(new vec3(pa[0], pa[1], pa[2]));
      t.setLocalRotation(quat.lookAt(dir, up));
      t.setLocalScale(new vec3(jr * 0.9, jr * 0.9, len));
    }
  }

  setVisible(v: boolean) {
    if (this.visible === v) return;
    this.visible = v;
    this.root.enabled = v;
  }

  isLeft(): boolean {
    return this.leftHand;
  }

  private static dist(a: number[], b: number[]): number {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Unit sphere: radius 1, 10x14 lat/long, position + normal layout.
  private static buildUnitSphere(): RenderMesh {
    const mb = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
    ]);
    mb.topology = MeshTopology.Triangles;
    mb.indexType = MeshIndexType.UInt16;

    const LAT = 10, LON = 14;
    const flat: number[] = [];
    for (let i = 0; i <= LAT; i++) {
      const phi = (i / LAT) * Math.PI; // 0..pi from +Y pole
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let j = 0; j <= LON; j++) {
        const th = (j / LON) * Math.PI * 2;
        const nx = sp * Math.cos(th), ny = cp, nz = sp * Math.sin(th);
        flat.push(nx, ny, nz, nx, ny, nz);
      }
    }
    mb.appendVerticesInterleaved(flat);

    const idx: number[] = [];
    const row = LON + 1;
    for (let i = 0; i < LAT; i++) {
      for (let j = 0; j < LON; j++) {
        const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    mb.appendIndices(idx);
    print("[SignSpace] sphere mesh: verts=" + mb.getVerticesCount() + " idx=" + mb.getIndicesCount() + " valid=" + mb.isValid());
    mb.updateMesh();
    return mb.getMesh();
  }

  // Unit segment body: cylinder radius 1 along -Z, spanning z in [-1, 0]. No end
  // caps needed - joint spheres at both landmarks cap every segment visually.
  private static buildUnitSegment(): RenderMesh {
    const mb = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
    ]);
    mb.topology = MeshTopology.Triangles;
    mb.indexType = MeshIndexType.UInt16;

    const SIDES = 10;
    const flat: number[] = [];
    for (let i = 0; i <= SIDES; i++) {
      const th = (i / SIDES) * Math.PI * 2;
      const nx = Math.cos(th), nz = Math.sin(th);
      flat.push(nx, 0, nz, nx, 0, nz);   // z = 0 (joint A end)
      flat.push(nx, 0, -1, nx, 0, nz);   // z = -1 (joint B end)
    }
    mb.appendVerticesInterleaved(flat);

    const idx: number[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    mb.appendIndices(idx);
    print("[SignSpace] cyl mesh: verts=" + mb.getVerticesCount() + " idx=" + mb.getIndicesCount() + " valid=" + mb.isValid());
    mb.updateMesh();
    return mb.getMesh();
  }
}
