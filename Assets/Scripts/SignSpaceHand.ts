// SignSpaceHand.ts — Stage 2 driver: MeshBuilder mannequin hand playing one
// fingerspelled word.
//
// Attach to any SceneObject. Builds the hand rig once at start, then re-poses it
// each frame from a precomputed fingerspell clip. Zero per-frame allocation:
// frames are precomputed landmark arrays, the rig only writes local transforms.

import { HandRig } from "./HandRig";
import { resolveText } from "../SignLanguage/resolve";
import type { Clip } from "../SignLanguage/fingerspell";
import type { GlossToken } from "../SignLanguage/resolve";

// Hand placement (cm) relative to world origin. DeviceTracking World: camera looks
// down -Z at start, so -Z is in front of the user, -Y is below eye line.
// Raised so chest-location signs (PLEASE/SORRY, dy -0.52) stay in view.
const HAND_POS = new vec3(0, -4, -45);

const LOG_EVERY_N_FRAMES = 12;

@component
export class SignSpaceHand extends BaseScriptComponent {
  @input
  @label("Hand Material")
  @hint("Unlit material used for the whole mannequin hand.")
  material: Material;

  @input
  @label("Hand Scale (cm)")
  @hint("Landmark units multiplied by this; ~12 cm gives a natural hand size.")
  handScale: number = 12;

  @input
  @label("Spell Text")
  @hint("Word to fingerspell on start, e.g. HELLO")
  spellText: string = "HELLO";

  private rigR: HandRig;
  private rigL: HandRig;

  private clip: Clip;
  private frameIndex = -1;
  private startTime = -1;
  private lastLabel = "";
  private currentGloss: GlossToken[] = [];
  private handMaterial: Material;

  public onAwake() {
    if (!this.material) {
      print("[SignSpace] ERROR: material input not assigned — hand will not render");
      return;
    }

    // Clone the wired material and tint the clone (never mutate a shared asset).
    // Warm light tone, holographic (bright, no darks).
    let mat = this.material;
    if (!mat || !mat.mainPass) {
      print("[SignSpace] ERROR: material input missing or has no pass — hand will not render correctly");
      return;
    }
    mat = mat.clone();
    mat.mainPass.baseColor = new vec4(1.0, 0.84, 0.66, 1.0);
    const tinted = mat;
    this.handMaterial = tinted;

    const parent = this.getSceneObject();
    parent.getTransform().setWorldPosition(HAND_POS);
    print("[SignSpace] building right hand rig");

    this.rigR = new HandRig(parent, "RightHand", { material: tinted, jointRadius: 0.045 }, false);
    print("[SignSpace] right rig done");
    this.rigL = new HandRig(parent, "LeftHand", { material: tinted, jointRadius: 0.045 }, true);
    print("[SignSpace] left rig done");
    this.rigL.setVisible(false);

    this.playText(this.spellText);

    this.createEvent("UpdateEvent").bind(() => this.tick());
  }

  // Resolve free text through the sign vocabulary (whole-word signs first,
  // fingerspell fallback) and play the resulting clip.
  public playText(text: string) {
    const result = resolveText(text);
    if (result.gloss.length > 0) {
      // * = whole-word sign from VOCAB, + = fingerspelled
      const gloss = result.gloss.map((t) => t.token + (t.mode === "sign" ? "*" : "+")).join(" ");
      print("[SignSpace] gloss: " + gloss);
    }
    this.currentGloss = result.gloss;
    if (result.clip) {
      this.clip = result.clip;
      this.startTime = -1;
      this.frameIndex = -1;
      print("[SignSpace] clip '" + this.clip.name + "' frames=" + this.clip.frames.length);
    } else {
      print("[SignSpace] nothing to sign for '" + text + "'");
    }
  }

  public getCurrentLabel(): string {
    return this.lastLabel;
  }

  public getGloss(): GlossToken[] {
    return this.currentGloss;
  }

  public getHandMaterial(): Material {
    return this.handMaterial;
  }

  public getSphereMesh(): RenderMesh {
    return this.rigR.getSphereMesh();
  }

  private tick() {
    if (!this.clip || this.clip.frames.length === 0) return;

    const now = getTime();
    if (this.startTime < 0) this.startTime = now;

    const f = Math.floor((now - this.startTime) * this.clip.fps) % this.clip.frames.length;
    if (f === this.frameIndex) return;
    this.frameIndex = f;

    const frame = this.clip.frames[f];
    this.rigR.setPose(frame.R, this.handScale);

    const hasLeft = frame.L !== null && frame.L !== undefined;
    this.rigL.setVisible(hasLeft);
    if (hasLeft) this.rigL.setPose(frame.L, this.handScale);

    const label = this.clip.labels[f];
    if (label && label !== this.lastLabel && f % LOG_EVERY_N_FRAMES === 0) {
      this.lastLabel = label;
      print("[SignSpace] letter=" + label + " frame=" + f + "/" + this.clip.frames.length);
    }
  }
}