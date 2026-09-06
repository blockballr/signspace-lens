// SignSpaceHUD.ts — Stage 4: world-space HUD (UI Kit) + SPECS ASR, wired to the
// sign resolver. Shows heard-text, current sign cue, gloss line, a text input,
// and a mic button. A faint head + shoulders body anchor sits behind the hands.
//
// Built component-by-component (this UIKit is code-first, no prefabs):
//   - RoundedRectangle: panel background
//   - native Component.Text: readout lines
//   - UIKit Button: mic toggle
//   - UIKit TextInputField: typed entry
// ASR via LensStudio:AsrModule; degrades gracefully to typed input.

import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { TextInputField } from "SpectaclesUIKit.lspkg/Scripts/Components/TextInputField/TextInputField";
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { setTextRect } from "SpectaclesUIKit.lspkg/Scripts/Utility/UIKitUtilities";
import { SignSpaceHand } from "./SignSpaceHand";

// HUD placement (cm) — centered above the hand, facing the camera.
const HUD_POS = new vec3(0, 12, -45);
// Body anchor (faint head + shoulders) behind the hand.
const BODY_POS = new vec3(0, 6, -55);

@component
export class SignSpaceHUD extends BaseScriptComponent {
  @input
  @label("Hand Object")
  @hint("The SignSpaceHand scene object this HUD drives.")
  handObject: SceneObject;

  @input
  @label("Test Phrase (injected)")
  @hint("If set, drives the same path the return-key handler uses (heard -> playText) so the input loop can be proven without a capturable keyboard in Desktop Preview.")
  testPhrase: string = "";

  private hand: SignSpaceHand | null = null;

  private heardText: Text | null = null;
  private signCueText: Text | null = null;
  private glossText: Text | null = null;
  private micLabel: Text | null = null;

  private asrModule: any = require("LensStudio:AsrModule");
  private asrActive = false;
  private built = false;

  public onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.build());
    this.createEvent("UpdateEvent").bind(() => this.refreshReadouts());
    this.createEvent("OnDestroyEvent").bind(() => this.stopASR());
  }

  // ---- build the HUD + body anchor ---------------------------------------
  private build() {
    if (this.built) return;
    this.built = true;

    if (this.handObject) {
      this.hand = this.findHand();
      print("[SignSpaceHUD] hand linked: " + (this.hand !== null));
    } else {
      print("[SignSpaceHUD] ERROR: handObject input not assigned");
    }

    const parent = this.getSceneObject();
    const root = global.scene.createSceneObject("SignSpaceHUD");
    root.setParent(parent);
    root.getTransform().setWorldPosition(HUD_POS);

    this.buildPanel(root);
    this.buildBodyAnchor(parent);

    // Demo: play a phrase on start so the HUD pipeline is testable without a mic.
    // If a test phrase is injected (inspector), drive the SAME path the return-key
    // handler uses (heard -> playText) to prove the full input loop.
    if (this.testPhrase && this.testPhrase.trim().length > 0) {
      this.heard(this.testPhrase.trim());
    } else if (this.hand) {
      this.hand.playText("HELLO");
    }
  }

  private findHand(): SignSpaceHand | null {
    try {
      const comps = this.handObject.getComponents("ScriptComponent") as any[];
      print("[SignSpaceHUD] hand comps: " + comps.length);
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        const n = c && c.scriptAsset ? String(c.scriptAsset.name) : "?";
        print("[SignSpaceHUD] comp " + i + " name=" + n + " hasPlayText=" + (typeof (c as any).playText === "function"));
        if (typeof (c as any).playText === "function") return c as SignSpaceHand;
      }
    } catch (e) { print("[SignSpaceHUD] findHand err: " + String(e)); }
    return null;
  }

  private buildPanel(root: SceneObject) {
    // Background panel — BEHIND all UI (local z = 0; UI sits at z = 0.5).
    // Uses the proven MeshBuilder+material pipeline (same as the hand) rather
    // than the UIKit RoundedRectangle, which didn't render at runtime.
    const bg = global.scene.createSceneObject("PanelBg");
    bg.setParent(root);
    bg.getTransform().setLocalPosition(new vec3(0, 0, 0));
    if (this.hand) {
      const bv = bg.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      bv.mesh = this.hand.getSphereMesh();
      try {
        const bm = this.hand.getHandMaterial().clone();
        bm.mainPass.blendMode = 0; // opaque
        bm.mainPass.baseColor = new vec4(1.0, 0.9, 0.72, 1.0); // bright warm panel
        bv.mainMaterial = bm;
      } catch (e) { /* noop */ }
      bg.getTransform().setLocalScale(new vec3(15, 11, 0.5)); // 30 x 22 x 1 cm, thin
    }

    // Readout lines.
    this.heardText = this.makeText(root, "heard", new vec3(0, 6.5, 1), "heard: —");
    this.signCueText = this.makeText(root, "signCue", new vec3(0, 3.5, 1), "sign: —");
    this.glossText = this.makeText(root, "gloss", new vec3(0, 0.5, 1), "gloss: —");

    // Text input.
    const tiObj = global.scene.createSceneObject("SignInput");
    tiObj.setParent(root);
    tiObj.getTransform().setLocalPosition(new vec3(-4, -4, 1));
    const input = tiObj.createComponent(TextInputField.getTypeName()) as TextInputField;
    input.placeholderText = "Type to sign…";
    input.text = "";
    input.onReturnKeyPressed.add((text: string) => {
      this.heard(text);
      input.text = "";
    });

    // Mic button.
    const micObj = global.scene.createSceneObject("MicButton");
    micObj.setParent(root);
    micObj.getTransform().setLocalPosition(new vec3(8, -4, 1));
    const mic = micObj.createComponent(Button.getTypeName()) as Button;
    mic.setVariant({ theme: "SnapOS3", shape: "Round", style: "Secondary" });
    mic.size = new vec3(5, 5, 1);
    const content = micObj.createComponent("Component.Text") as Text;
    content.text = "MIC";
    content.size = 10;
    content.textFill.color = new vec4(1, 1, 1, 1);
    mic.onTriggerUp.add(() => this.toggleASR());
    this.micLabel = content;
  }

  private makeText(parent: SceneObject, name: string, pos: vec3, initial: string): Text {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    so.getTransform().setLocalPosition(pos);
    const st = so.createComponent("Component.ScreenTransform") as ScreenTransform;
    st.anchors.setCenter(new vec2(0, 0));
    st.anchors.setSize(new vec2(28, 3));
    const t = so.createComponent("Component.Text") as Text;
    t.text = initial;
    t.size = 16;
    t.textFill.color = new vec4(0.08, 0.10, 0.14, 1.0); // dark text on bright panel
    t.horizontalOverflow = HorizontalOverflow.Shrink;
    t.verticalOverflow = VerticalOverflow.Shrink;
    // Authoritative world-space text rect (sets layoutRect).
    setTextRect(t, so, 28, 3);
    return t;
  }

  // Faint head + shoulders silhouette behind the hands (body anchor for
  // location-based signs). Uses the hand's material dimmed + translucent.
  private buildBodyAnchor(parent: SceneObject) {
    if (!this.hand) return;
    let mat: Material | null = null;
    try { mat = this.hand.getHandMaterial().clone(); } catch (e) { /* fall through */ }
    if (!mat) return;
    const pass = mat.mainPass;
    pass.blendMode = 1; // alpha blend (translucent)
    pass.baseColor = new vec4(0.62, 0.68, 0.78, 0.35); // faint cool silhouette

    const body = global.scene.createSceneObject("BodyAnchor");
    body.setParent(parent);
    body.getTransform().setWorldPosition(BODY_POS);

    const head = global.scene.createSceneObject("Head");
    head.setParent(body);
    head.getTransform().setLocalPosition(new vec3(0, 13, 0));
    const hv = head.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    hv.mesh = this.hand.getSphereMesh();
    hv.mainMaterial = mat;
    head.getTransform().setLocalScale(new vec3(9, 10, 9));

    const shoulders = global.scene.createSceneObject("Shoulders");
    shoulders.setParent(body);
    shoulders.getTransform().setLocalPosition(new vec3(0, 0, 0));
    const sv = shoulders.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    sv.mesh = this.hand.getSphereMesh();
    sv.mainMaterial = mat;
    shoulders.getTransform().setLocalScale(new vec3(15, 7, 9));
  }

  // ---- ASR ----------------------------------------------------------------
  private toggleASR() {
    if (this.asrActive) {
      this.stopASR();
    } else {
      this.startASR();
    }
  }

  private startASR() {
    if (!this.asrModule) { print("[SignSpaceHUD] ASR module unavailable"); return; }
    try {
      const options = AsrModule.AsrTranscriptionOptions.create();
      options.silenceUntilTerminationMs = 1000;
      options.mode = AsrModule.AsrMode.Balanced;
      options.onTranscriptionUpdateEvent.add((e: AsrModule.TranscriptionUpdateEvent) => {
        if (this.heardText) this.heardText.text = "heard: " + e.text;
        if (e.isFinal && e.text.trim().length > 0) {
          print("[SignSpaceHUD] ASR final: " + e.text);
          if (this.hand) this.hand.playText(e.text);
        }
      });
      options.onTranscriptionErrorEvent.add((code: AsrModule.AsrStatusCode) => {
        print("[SignSpaceHUD] ASR error code=" + code);
        this.asrActive = false;
        if (this.micLabel) this.micLabel.text = "MIC";
      });
      this.asrModule.startTranscribing(options);
      this.asrActive = true;
      if (this.micLabel) this.micLabel.text = "●";
      print("[SignSpaceHUD] ASR started");
    } catch (e) {
      print("[SignSpaceHUD] ASR start failed: " + String(e));
    }
  }

  private stopASR() {
    if (this.asrActive && this.asrModule && this.asrModule.stopTranscribing) {
      try { this.asrModule.stopTranscribing(); } catch (e) { /* noop */ }
    }
    this.asrActive = false;
    if (this.micLabel) this.micLabel.text = "MIC";
  }

  // ---- typed input + readouts --------------------------------------------
  private heard(text: string) {
    if (this.heardText) this.heardText.text = "heard: " + text;
    print("[SignSpaceHUD] readout heard: " + text);
    if (this.hand) this.hand.playText(text);
  }

  private lastReadout = "";

  private refreshReadouts() {
    if (!this.hand) return;
    const parts: string[] = [];
    const label = this.hand.getCurrentLabel();
    if (this.signCueText && label) {
      this.signCueText.text = "sign: " + label;
      parts.push("sign: " + label);
    }
    const gloss = this.hand.getGloss();
    if (this.glossText && gloss.length > 0) {
      const g = gloss.map((t) => t.token + (t.mode === "sign" ? "*" : "+")).join(" ");
      this.glossText.text = "gloss: " + g;
      parts.push("gloss: " + g);
    }
    const line = parts.join(" | ");
    if (line && line !== this.lastReadout) {
      this.lastReadout = line;
      print("[SignSpaceHUD] readouts " + line);
    }
  }
}