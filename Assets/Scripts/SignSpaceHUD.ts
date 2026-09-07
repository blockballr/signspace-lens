// SignSpaceHUD.ts — EXACT web replica (HandGloss index.html), verbatim target.
//
// DO NOT REDESIGN. This file is the byte-exact target copy this byte-exact into
// Assets/Scripts/SignSpaceHUD.ts. The only permitted edits are compile fixes —
// NOT visual changes, NOT layout changes, NOT repositioning.
//
// Reference (web): signspace/index.html
// .panel { left:16px; top:16px; width:300px; bg rgba(20,24,33,.72);
// blur 8px; border 1px rgba(255,255,255,.08); radius 14px; padding 16px }
// body { bg #0b0e14; color #e6e9ef }
// tag { #7c8394 11px uppercase ls 1px }
// h1 { 15px, margin 4 0 10 }
// button/input { bg #1a2030; border 1px rgba(255,255,255,.12); radius 9px }
// #sign { bg #26314f; border #3d5a9e }
// status { #7c8394 12px }
// heard { #9fb4ff bold }
// gloss sign tok { #9fe8b0 } spell tok { #ffd27f }
// .cue { #ffd27f 128px 800; right 32px; bottom 28px }
// note { #626a7c 11px }
//
// SCREEN-SPACE ARCHITECTURE (this is what previous attempts got wrong):
// ScreenTransform anchoring ONLY works if isInScreenHierarchy() — there must be a
// Camera UP the parent chain and EVERY object between Camera and element must carry
// a ScreenTransform. So this HUD attaches its root under the scene's Camera object
// and gives every HUD node a ScreenTransform. Anchor space: 0 = parent center,
// ±1 = parent edges. offsets add world units beyond the anchor.
//
// Layout mapping (web px -> screen anchors). Panel width 300px ≈ 0.22 of a
// 1366-wide view; we use anchors relative to full frame with offsets in cm for
// pixel-precise padding (camera-space world units at -45cm ≈ px-like scale).

// UIKit is loaded lazily (B15): its module-load chain (ThemeService -> SnapOS3)
// crashes the lens when the package's theme textures are missing. The
// editor-HUD path (useEditorHUD) never touches these components.
let UIKitButton: any = null;
let UIKitInputField: any = null;
function getButton(): any {
 if (!UIKitButton) UIKitButton = require("SpectaclesUIKit.lspkg/Scripts/Components/Button/Button").Button;
 return UIKitButton;
}
function getInputField(): any {
 if (!UIKitInputField) UIKitInputField = require("SpectaclesUIKit.lspkg/Scripts/Components/TextInputField/TextInputField").TextInputField;
 return UIKitInputField;
}
import { toGloss, GlossMode } from "../SignLanguage/glosser";
import { SignSpaceHand } from "./SignSpaceHand";

// Web palette (exact).
const COL_BODY = new vec4(0.902, 0.914, 0.937, 1); // #e6e9ef
const COL_MUTED = new vec4(0.486, 0.514, 0.580, 1); // #7c8394
const COL_MUTED2 = new vec4(0.384, 0.416, 0.486, 1); // #626a7c
const COL_HEARD = new vec4(0.624, 0.706, 1.0, 1); // #9fb4ff
const COL_SIGN = new vec4(0.624, 0.910, 0.690, 1); // #9fe8b0
const COL_SPELL = new vec4(1.0, 0.824, 0.498, 1); // #ffd27f
const COL_PANEL = new vec4(0.078, 0.094, 0.129, 0.72);// rgba(20,24,33,.72)
const COL_BORDER = new vec4(1, 1, 1, 0.08); // rgba(255,255,255,.08)

// Log font sizes. Web px values below; sizes chosen ~1.6x for AR legibility.
const SZ_TAG = 11; // web 11px, uppercase
const SZ_TITLE = 24; // web 15px x1.6
const SZ_DESC = 16; // web 13px x1.6 -> 21? kept 16 for fit
const SZ_VALUE = 19; // web 13px body x1.5
const SZ_STATUS = 16; // web 12px x1.3
const SZ_LABEL = 14; // web 11px labels x1.3
const SZ_BTN = 15;
const SZ_CUE = 110; // web 128px

@component
export class SignSpaceHUD extends BaseScriptComponent {
 @input
 @label("Hand Object")
 handObject: SceneObject;

 @input
 @label("Test Phrase (injected)")
 testPhrase: string = "";

  @input
  @label("Use Editor HUD")
  @hint("When ON, skip the runtime panel and bind readouts to editor-built scene objects (B15).")
  useEditorHUD: boolean = true;

  @input
  @label("SIK Hit Prefab")
  @hint("ObjectPrefab holding a SIK Interactable; instantiated per world button so the desktop preview's mouse can click them.")
  sikHitPrefab: ObjectPrefab;

 private hand: SignSpaceHand | null = null;
 private heardText: Text | null = null;
 private statusText: Text | null = null;
 private aslGlossText: Text | null = null;
 private tokensText: Text | null = null;
 private cueText: Text | null = null;
 private micLabel: Text | null = null;
 private signInput: any = null;

 private asrModule: any = require("LensStudio:AsrModule");
 private asrActive = false;
 private built = false;
 private glossMode: GlossMode = "passthrough";
 private lastReadout = "";

 public onAwake() {
 this.createEvent("OnStartEvent").bind(() => this.build());
 this.createEvent("UpdateEvent").bind(() => this.refreshReadouts());
 this.createEvent("OnDestroyEvent").bind(() => this.stopASR());
 }

 private build() {
 if (this.built) return;
 this.built = true;

 if (this.handObject) this.hand = this.findHand();
 else print("[SignSpaceHUD] ERROR: handObject input not assigned");

 if (this.useEditorHUD) {
 // B15: the HUD lives in the scene as editor objects (built in Steps 1-4).
 // No runtime bg, readouts, or buttons are created here. Bind any readout
 // text objects that already exist by scene-object name.
 print("[SignSpaceHUD] using editor HUD (runtime panel skipped)");
 this.resolveEditorReadouts();
 this.buildBodyAnchor();
 if (this.testPhrase && this.testPhrase.trim().length > 0) {
 this.heard(this.testPhrase.trim());
 } else if (this.hand) {
 this.hand.playText("HELLO");
 }
 return;
 }

 // ---- screen hierarchy root: attach under the scene's Camera object ----
 // Every node from here down carries a ScreenTransform so anchoring works.
 const camObj = this.findCameraObject();
 if (!camObj) {
 print("[SignSpaceHUD] ERROR: no Camera found for screen-space HUD");
 return;
 }
 const panel = global.scene.createSceneObject("HUDPanel");
 panel.setParent(camObj); // camera ancestor required
 const pst = panel.createComponent("Component.ScreenTransform") as ScreenTransform;
 // Web .panel: left 16, top 16, width 300 -> top-LEFT anchored.
 // anchors: left=-1 (parent left edge), right = -1 + panelWidthFrac,
 // top=1 (parent top edge), bottom = 1 - panelHeightFrac.
 // Panel occupies ~0.22 width, ~0.62 height of frame.
 pst.anchors.left = -1.0;
 pst.anchors.right = -0.56; // 0.44 of half-width => 0.22 of full width
 pst.anchors.top = 1.0;
 pst.anchors.bottom = -0.24; // 0.62 of half-height => 0.38 of full height

 // Panel background image (rounded via texture-less flat color is acceptable;
 // exact web look: dark translucent + subtle border).
 const bgObj = global.scene.createSceneObject("PanelBg");
 bgObj.setParent(panel);
 const bst = bgObj.createComponent("Component.ScreenTransform") as ScreenTransform;
 this.setAnchorsFull(bst);
 const bg = bgObj.createComponent("Component.Image") as Image;
 // Flat dark translucent panel. (No rounded-rect texture available in Lens
 // without an asset; web radius 14px is approximated by a plain rect.)
 bg.mainMaterial = this.makeFlatMat(COL_PANEL);

 // ---- panel content: web order, one column ----
 // y offsets go top->bottom inside the panel (in offsets world units).
 // Row layout via anchors with pivot at top; each child full-width, positioned
 // by offsets from the panel top.
 let row = -0.92; // start just below panel top (normalized within panel)

 // 1. tag "SPEECH TO ASL, IN AR"
 this.addLabel(panel, "tag", "SPEECH TO ASL, IN AR", SZ_TAG, COL_MUTED, row); row -= 0.055;
 // 2. title "HandGloss"
 this.addLabel(panel, "title", "HandGloss", SZ_TITLE, COL_BODY, row, true); row -= 0.09;
 // 3. description
 this.addLabel(panel, "desc",
 "known words sign (green); others fingerspell (amber)", SZ_DESC, COL_MUTED, row); row -= 0.075;
 // 4. mic row: [MIC] button
 this.addMicButton(panel, row); row -= 0.085;
 // 5. input row: text field + SIGN button
 this.addInputRow(panel, row); row -= 0.095;
 // 6. status
 this.statusText = this.addLabel(panel, "status", "status: ready", SZ_STATUS, COL_MUTED, row); row -= 0.06;
 // 7. heard
 this.addLabel(panel, "heardLabel", "HEARD", SZ_LABEL, COL_MUTED, row); row -= 0.045;
 this.heardText = this.addLabel(panel, "heard", "heard: —", SZ_VALUE, COL_HEARD, row); row -= 0.075;
 // 8. gloss engine label + mode buttons
 this.addLabel(panel, "modeLabel", "GLOSS ENGINE", SZ_LABEL, COL_MUTED, row); row -= 0.05;
 this.addModeButtons(panel, row); row -= 0.095;
 // 9. ASL gloss (green)
 this.aslGlossText = this.addLabel(panel, "aslgloss", "ASL: —", SZ_VALUE, COL_SIGN, row); row -= 0.07;
 // 10. tokenized gloss
 this.tokensText = this.addLabel(panel, "tokens", "gloss: —", SZ_VALUE - 2, COL_SPELL, row); row -= 0.07;
 // 11. vocab grid (compact, inside panel bottom)
 this.addVocabGrid(panel, row);

 // 12. note — placed at panel bottom under the grid
 // (grid occupies the rest of the panel)

 // 13. letter cue — ONLY element outside the panel: bottom-right, amber, huge.
 const cueObj = global.scene.createSceneObject("LetterCue");
 cueObj.setParent(camObj);
 const cst = cueObj.createComponent("Component.ScreenTransform") as ScreenTransform;
 cst.anchors.left = 0.3;
 cst.anchors.right = 1.0;
 cst.anchors.bottom = -1.0;
 cst.anchors.top = -0.7;
 const cue = cueObj.createComponent("Component.Text") as Text;
 cue.text = "";
 cue.size = SZ_CUE;
 cue.textFill.color = COL_SPELL;
 cue.horizontalOverflow = HorizontalOverflow.Overflow;
 cue.horizontalAlignment = HorizontalAlignment.Right;
 this.cueText = cue;

 this.buildBodyAnchor();

 if (this.testPhrase && this.testPhrase.trim().length > 0) {
 this.heard(this.testPhrase.trim());
 } else if (this.hand) {
 this.hand.playText("HELLO");
 }
 }

 // ---- helpers ------------------------------------------------------------

 private findCameraObject(): SceneObject | null {
 try {
 const cam = global.scene.getRootObjectsCount() >= 0 ? null : null;
 // Find the root object carrying a Camera component.
 for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
 const root = global.scene.getRootObject(i);
 const cam = root.getComponent("Camera") as Camera;
 if (cam) return root;
 }
 } catch (e) { /* noop */ }
 return null;
 }

 private setAnchorsFull(st: ScreenTransform) {
 st.anchors.left = -1; st.anchors.right = 1;
 st.anchors.bottom = -1; st.anchors.top = 1;
 }

 private makeFlatMat(color: vec4): Material {
 // Minimal flat unlit material built from the hand's shader family.
 const mat = (this.hand ? this.hand.getHandMaterial() : null) as Material | null;
 if (!mat) return null as unknown as Material;
 const m = mat.clone();
 m.mainPass.blendMode = 1; // translucent for glass
 m.mainPass.baseColor = color;
 return m;
 }

 // One text row anchored inside the panel. Full width; row positions are
 // normalized within the panel (row in [-1,1], -1 bottom, 1 top).
 private addLabel(parent: SceneObject, name: string, content: string, size: number,
 color: vec4, row: number, bold: boolean = false): Text {
 const so = global.scene.createSceneObject(name);
 so.setParent(parent);
 const st = so.createComponent("Component.ScreenTransform") as ScreenTransform;
 st.anchors.left = -1; st.anchors.right = 1;
 st.anchors.top = row; st.anchors.bottom = row - 0.045;
 const t = so.createComponent("Component.Text") as Text;
 t.text = content;
 t.size = size;
 t.textFill.color = color;
 t.horizontalOverflow = HorizontalOverflow.Overflow;
 t.verticalOverflow = VerticalOverflow.Overflow;
 t.horizontalAlignment = HorizontalAlignment.Left;
 if (bold) {
 try { (t as any).font = null; } catch (e) { /* default font */ }
 }
 return t;
 }

 private addMicButton(parent: SceneObject, row: number) {
 const so = global.scene.createSceneObject("MicButton");
 so.setParent(parent);
 const st = so.createComponent("Component.ScreenTransform") as ScreenTransform;
 st.anchors.left = -1; st.anchors.right = -0.6;
 st.anchors.top = row; st.anchors.bottom = row - 0.07;
 const mic = so.createComponent(getButton().getTypeName()) as any;
 mic.setVariant({ theme: "SnapOS3", shape: "Rectangle", style: "Secondary" });
 const lbl = so.createComponent("Component.Text") as Text;
 lbl.text = "Listen";
 lbl.size = SZ_BTN;
 lbl.textFill.color = COL_BODY;
 mic.onTriggerUp.add(() => this.toggleASR());
 this.micLabel = lbl;
 }

 private addInputRow(parent: SceneObject, row: number) {
 const tiObj = global.scene.createSceneObject("SignInput");
 tiObj.setParent(parent);
 const tst = tiObj.createComponent("Component.ScreenTransform") as ScreenTransform;
 tst.anchors.left = -1; tst.anchors.right = 0.35;
 tst.anchors.top = row; tst.anchors.bottom = row - 0.07;
 const input = tiObj.createComponent(getInputField().getTypeName()) as any;
 input.placeholderText = "type words…";
 input.text = "";
 input.onReturnKeyPressed.add((text: string) => {
 this.submitThroughGloss(text); input.text = "";
 });
 this.signInput = input;

 const sbObj = global.scene.createSceneObject("SignButton");
 sbObj.setParent(parent);
 const sst = sbObj.createComponent("Component.ScreenTransform") as ScreenTransform;
 sst.anchors.left = 0.4; sst.anchors.right = 1;
 sst.anchors.top = row; sst.anchors.bottom = row - 0.07;
 const sb = sbObj.createComponent(getButton().getTypeName()) as any;
 sb.setVariant({ theme: "SnapOS3", shape: "Rectangle", style: "Primary" });
 const lbl = sbObj.createComponent("Component.Text") as Text;
 lbl.text = "Sign";
 lbl.size = SZ_BTN;
 lbl.textFill.color = COL_BODY;
 sb.onTriggerUp.add(() => {
 const text = this.signInput ? this.signInput.text.trim() : "";
 if (text.length > 0) {
 this.submitThroughGloss(text);
 if (this.signInput) this.signInput.text = "";
 }
 });
 }

 private addModeButtons(parent: SceneObject, row: number) {
 const modes: Array<{ label: string; mode: GlossMode }> = [
 { label: "Passthrough", mode: "passthrough" },
 { label: "Rules", mode: "rules" },
 { label: "Gemini", mode: "gemini" },
 ];
 for (let i = 0; i < modes.length; i++) {
 const obj = global.scene.createSceneObject("Mode_" + modes[i].label);
 obj.setParent(parent);
 const st = obj.createComponent("Component.ScreenTransform") as ScreenTransform;
 st.anchors.left = -1 + i * 0.666;
 st.anchors.right = -1 + (i + 1) * 0.666 - 0.03;
 st.anchors.top = row; st.anchors.bottom = row - 0.065;
 const b = obj.createComponent(getButton().getTypeName()) as any;
 b.setVariant({ theme: "SnapOS3", shape: "Rectangle", style: "Secondary" });
 const l = obj.createComponent("Component.Text") as Text;
 l.text = modes[i].label;
 l.size = 13;
 l.textFill.color = COL_BODY;
 b.onTriggerUp.add(() => {
 this.glossMode = modes[i].mode;
 print("[SignSpaceHUD] gloss mode: " + this.glossMode);
 if (this.statusText) this.statusText.text = "status: mode=" + this.glossMode;
 });
 }
 }

 // Compact vocab grid inside the panel bottom: 2 columns x 4 rows.
 private addVocabGrid(parent: SceneObject, startRow: number) {
 const words = ["HELLO", "THANK YOU", "I LOVE YOU", "MORE", "WATER", "SORRY", "PLEASE", "YES"];
 let row = startRow - 0.02;
 for (let i = 0; i < words.length; i++) {
 const col = i % 2;
 const r = Math.floor(i / 2);
 const obj = global.scene.createSceneObject("Vocab_" + words[i].replace(/\s+/g, "_"));
 obj.setParent(parent);
 const st = obj.createComponent("Component.ScreenTransform") as ScreenTransform;
 st.anchors.left = -1 + col * 1.0;
 st.anchors.right = -1 + (col + 1) * 1.0 - 0.04;
 st.anchors.top = row - r * 0.075;
 st.anchors.bottom = row - r * 0.075 - 0.06;
 const b = obj.createComponent(getButton().getTypeName()) as any;
 b.setVariant({ theme: "SnapOS3", shape: "Rectangle", style: "Secondary" });
 const l = obj.createComponent("Component.Text") as Text;
 l.text = words[i];
 l.size = SZ_BTN;
 l.textFill.color = COL_BODY;
 b.onTriggerUp.add(() => {
 print("[SignSpaceHUD] VOCAB click: " + words[i]);
 if (this.hand) this.hand.playText(words[i]);
 });
 }
 }

 private findHand(): SignSpaceHand | null {
 try {
 const comps = this.handObject.getComponents("ScriptComponent") as any[];
 for (let i = 0; i < comps.length; i++) {
 const c = comps[i];
 if (typeof (c as any).playText === "function") return c as SignSpaceHand;
 }
 } catch (e) { print("[SignSpaceHUD] findHand err: " + String(e)); }
 return null;
 }

 // Walk the scene hierarchy from the roots; first object with a matching name.
 private findObjectByName(name: string): SceneObject | null {
 try {
 const walk = (obj: SceneObject): SceneObject | null => {
 if (obj.name === name) return obj;
 try {
 const n = obj.getChildrenCount();
 for (let i = 0; i < n; i++) {
 const hit = walk(obj.getChild(i));
 if (hit) return hit;
 }
 } catch (e) { /* leaf */ }
 return null;
 };
 const roots = global.scene.getRootObjectsCount();
 for (let r = 0; r < roots; r++) {
 const hit = walk(global.scene.getRootObject(r));
 if (hit) return hit;
 }
 } catch (e) { print("[SignSpaceHUD] findObjectByName err: " + String(e)); }
 return null;
 }

 private bindText(objName: string, which: string): Text | null {
 const obj = this.findObjectByName(objName);
 if (!obj) { print("[SignSpaceHUD] editor object not found: " + objName); return null; }
 try {
 const t = obj.getComponent("Text") as Text;
 if (!t) { print("[SignSpaceHUD] no Text component on: " + objName); return null; }
 print("[SignSpaceHUD] bound " + which + " <- " + objName);
 return t;
 } catch (e) {
 print("[SignSpaceHUD] bind err on " + objName + ": " + String(e));
 return null;
 }
 }

 // B15 Steps 2-4 create these objects; missing ones simply stay unbound for now.
 private resolveEditorReadouts() {
 this.heardText = this.bindText("HeardText", "heardText");
 this.aslGlossText = this.bindText("ASLGlossText", "aslGlossText");
 this.tokensText = this.bindText("TokensText", "tokensText");
 this.cueText = this.bindText("LetterCueText", "cueText");
 // B15 Step 4: vocab grid as minimal runtime script (UIKit-free — the
 // upgraded UIKit package's theme chain crashes at module load, so the
 // grid uses plain Image + Text + InteractionComponent instead).
 const panelObj = this.findObjectByName("HUDPanel");
 if (panelObj) {
 this.addVocabGridUIKitFree(panelObj);
 } else {
 print("[SignSpaceHUD] vocab grid skipped: HUDPanel not found");
 }
 // B10: selectable virtual environment (studio backdrop sky sphere) + ENV toggle.
 this.addVirtualEnv();
 this.addWorldCaption();
 this.addWorldControls();
 this.addWorldPanel();
 this.addWorldVocab();
 }

 // B10. Sky backdrop: the hand's proven sphere mesh, unlit gradient material,
 // parented to the camera (world-space so it renders in every preview mode).
 private envSphere: SceneObject | null = null;

 private addVirtualEnv() {
 try {
 const camObj = this.findCameraObject();
 if (!camObj || !this.hand) { print("[SignSpaceHUD] env skipped (no camera/hand)"); return; }
 const obj = global.scene.createSceneObject("VirtualEnv");
 // Parent to the HUD script object (proven to render - BodyAnchor pattern),
 // fixed offset in front of the camera.
 obj.setParent(this.getSceneObject());
 obj.getTransform().setWorldPosition(new vec3(0, 0, -40));
 const mv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
 mv.mesh = this.hand.getSphereMesh();
 const mat = this.hand.getHandMaterial().clone() as Material;
 const pass = mat.mainPass;
 pass.blendMode = 1; // translucent worked for BodyAnchor spheres with this material family
 pass.baseColor = new vec4(0.055, 0.075, 0.125, 0.95); // deep studio blue
 try { pass.secondColor = new vec4(0.14, 0.10, 0.05, 1); } catch (e) { /* single color */ }
 try { pass.cullMode = 0; } catch (e) { print("[SignSpaceHUD] env cull err: " + String(e)); } // CullMode.Front -> render inner faces
 try { pass.twoSided = true; } catch (e) { /* noop */ }
 mv.mainMaterial = mat;
 obj.getTransform().setLocalScale(new vec3(150, 150, 150));
 obj.enabled = false; // B10 default: passthrough. ENV button toggles the backdrop.
 this.envSphere = obj;
 print("[SignSpaceHUD] virtual env created (ON)");
 } catch (e) {
 print("[SignSpaceHUD] env err: " + String(e));
 }
 }

 // B15 Step 4. Tappable word buttons: 2 cols x 4 rows below the tokens line.
 private addVocabGridUIKitFree(parent: SceneObject) {
 const words = ["HELLO", "THANK YOU", "I LOVE YOU", "MORE", "WATER", "SORRY", "PLEASE", "YES"];
 const rowsTop = [-0.16, -0.30, -0.44, -0.58];
 const rowsBot = [-0.28, -0.42, -0.56, -0.70];
 const colsL = [-0.95, 0.05];
 const colsR = [-0.05, 0.95];
 const btnColor = new vec4(0.102, 0.125, 0.188, 0.9); // #1a2030
 let made = 0;
 for (let i = 0; i < words.length; i++) {
 const col = i % 2;
 const r = Math.floor(i / 2);
 try {
 const obj = global.scene.createSceneObject("Vocab_" + words[i].replace(/\s+/g, "_"));
 obj.setParent(parent);
 const st = obj.createComponent("Component.ScreenTransform") as ScreenTransform;
 st.anchors.left = colsL[col]; st.anchors.right = colsR[col];
 st.anchors.top = rowsTop[r]; st.anchors.bottom = rowsBot[r];
 const img = obj.createComponent("Component.Image") as Image;
 const mat = this.hand ? (this.hand.getHandMaterial().clone() as Material) : null;
 if (mat) {
 mat.mainPass.blendMode = 1;
 mat.mainPass.baseColor = btnColor;
 img.mainMaterial = mat;
 }
 const lbl = obj.createComponent("Component.Text") as Text;
 lbl.text = words[i];
 lbl.size = 24;
 lbl.textFill.color = COL_BODY;
 lbl.horizontalOverflow = HorizontalOverflow.Overflow;
 const inter = obj.createComponent("Component.InteractionComponent") as InteractionComponent;
 inter.addMeshVisual(img);
 const word = words[i];
 inter.onTap.add(() => {
 print("[SignSpaceHUD] VOCAB tap: " + word);
 if (this.hand) this.hand.playText(word);
 });
 made++;
 } catch (e) {
 print("[SignSpaceHUD] vocab btn err (" + words[i] + "): " + String(e));
 }
 }
 // ENV toggle row (B10): full-width row below the vocab grid.
 try {
 const envObj = global.scene.createSceneObject("Btn_Env");
 envObj.setParent(parent);
 const st = envObj.createComponent("Component.ScreenTransform") as ScreenTransform;
 st.anchors.left = -0.95; st.anchors.right = 0.95;
 st.anchors.top = -0.74; st.anchors.bottom = -0.86;
 const img = envObj.createComponent("Component.Image") as Image;
 const mat = this.hand ? (this.hand.getHandMaterial().clone() as Material) : null;
 if (mat) {
 mat.mainPass.blendMode = 1;
 mat.mainPass.baseColor = new vec4(0.16, 0.20, 0.10, 0.9);
 img.mainMaterial = mat;
 }
 const lbl = envObj.createComponent("Component.Text") as Text;
 lbl.text = "ENV";
 lbl.size = 24;
 lbl.textFill.color = COL_SIGN;
 lbl.horizontalOverflow = HorizontalOverflow.Overflow;
 const inter = envObj.createComponent("Component.InteractionComponent") as InteractionComponent;
 inter.addMeshVisual(img);
 inter.onTap.add(() => {
 if (this.envSphere) {
 this.envSphere.enabled = !this.envSphere.enabled;
 print("[SignSpaceHUD] ENV: " + (this.envSphere.enabled ? "ON" : "OFF (passthrough)"));
 }
 });
 made++;
 } catch (e) {
 print("[SignSpaceHUD] env btn err: " + String(e));
 }
 print("[SignSpaceHUD] vocab grid: " + made + "/9 buttons");
 }

 // B15c: world-space caption bar under the hand - renders in every preview
 // mode and on device, so the audience always sees what the hand is signing.
 private captionText: Text | null = null;

 private addWorldCaption() {
 try {
 const camObj = this.findCameraObject();
 if (!camObj) return;
 const obj = global.scene.createSceneObject("WorldCaption");
 obj.setParent(camObj);
 obj.getTransform().setLocalPosition(new vec3(0, -17, -45));
 const t = obj.createComponent("Component.Text") as Text;
 t.text = "";
 t.size = 30;
 t.textFill.color = COL_BODY;
 try { t.horizontalOverflow = HorizontalOverflow.Overflow; } catch (e) { /* noop */ }
 this.captionText = t;
 print("[SignSpaceHUD] world caption created");
 } catch (e) {
 print("[SignSpaceHUD] caption err: " + String(e));
 }
 }

 // B15e: world-space panel readouts - visible in every preview mode and on
 // device, mirroring the screen-space panel's live values.
 private wHeardText: Text | null = null;
 private wAslText: Text | null = null;
 private wTokensText: Text | null = null;
 private lastHeard = "";

 private mkWorldText(name: string, content: string, x: number, y: number, size: number, col: vec4): Text {
 const obj = global.scene.createSceneObject(name);
 obj.setParent(this.findCameraObject());
 obj.getTransform().setLocalPosition(new vec3(x, y, -45));
 const t = obj.createComponent("Component.Text") as Text;
 t.text = content;
 t.size = size;
 t.textFill.color = col;
 try { t.horizontalOverflow = HorizontalOverflow.Overflow; } catch (e) { /* noop */ }
 return t;
 }

 // Tappable world button. Without the SIK prefab: ghost sphere +
 // InteractionComponent (device taps). With it: an invisible Interactable
 // collider sized to the label, so the desktop preview's mouse can click it
 // and nothing is left for the signing hand to intersect.
 private mkWorldTap(name: string, content: string, x: number, y: number, size: number, col: vec4, onTap: () => void, sikHitName?: string) {
 const camObj = this.findCameraObject();
 if (!camObj) return;
 const label = this.mkWorldText(name, content, x, y, size, col);
 const hit = global.scene.createSceneObject(sikHitName || ("Hit_" + name));
 hit.setParent(camObj);
 hit.getTransform().setLocalPosition(new vec3(x, y, -45));
 hit.getTransform().setLocalScale(new vec3(1, 1, 1));
 const hasPrefab = !!this.sikHitPrefab;
 if (!hasPrefab) {
 // Legacy path (no SIK prefab): ghost visual + InteractionComponent tap.
 const hv = hit.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
 hv.mesh = this.hand ? this.hand.getSphereMesh() : null;
 const srcMat = this.hand ? (this.hand.getHandMaterial().clone() as Material) : null;
 if (srcMat) {
 srcMat.mainPass.blendMode = 1;
 srcMat.mainPass.baseColor = new vec4(0.3, 0.5, 1, 0.06);
 hv.mainMaterial = srcMat;
 }
 hit.getTransform().setLocalScale(new vec3(4, 4, 4));
 try {
 const col = hit.createComponent("Component.ColliderComponent") as ColliderComponent;
 const sphere = Shape.createSphereShape();
 sphere.radius = 2;
 col.shape = sphere;
 } catch (e) { print("[SignSpaceHUD] collider err: " + String(e)); }
 const inter = hit.createComponent("Component.InteractionComponent") as InteractionComponent;
 inter.addMeshVisual(hv);
 inter.onTap.add(onTap);
 return;
 }
 // SIK path: invisible collider only. No ghost visual -> nothing for the
 // signing hand to intersect. Collider sized to the label (~8.4 x 2 x 2.4 cm).
 try {
 const inst = this.sikHitPrefab.instantiate(hit);
 inst.getTransform().setWorldPosition(hit.getTransform().getWorldPosition());
 inst.getTransform().setLocalScale(new vec3(1.4, 0.33, 0.4));
 let wired = false;
 const icols = inst.getComponents("Component.ColliderComponent") as ColliderComponent[];
 const comps = inst.getComponents("ScriptComponent") as any[];
 for (const c of comps) {
 if (c.onTriggerStart) {
 c.colliders = icols;
 c.enabled = false;
 c.enabled = true; // re-fire OnEnableEvent -> enableColliders(true)
 c.onTriggerStart.add(onTap);
 try {
 c.onTriggerEnd.add(() => print("[SignSpaceHUD] SIK triggerEnd " + name));
 c.onHoverEnter.add(() => print("[SignSpaceHUD] SIK hoverEnter " + name));
 } catch (e) { /* optional events */ }
 wired = true;
 }
 }
 print("[SignSpaceHUD] SIK instantiated+wired " + name + ": " + wired + " cols=" + icols.length);
 } catch (e) { print("[SignSpaceHUD] SIK inst err (" + name + "): " + String(e)); }
 }

 private addWorldPanel() {
 try {
 if (!this.findCameraObject()) return;
 this.mkWorldText("WTitle", "HandGloss", -13, 8, 22, COL_BODY);
 this.wHeardText = this.mkWorldText("WHeard", "heard: —", -13, 4, 15, COL_HEARD);
 this.wAslText = this.mkWorldText("WAsl", "ASL: —", -13, 0.5, 15, COL_SIGN);
 this.wTokensText = this.mkWorldText("WTokens", "gloss: —", -13, -3, 14, COL_SPELL);
 print("[SignSpaceHUD] world panel readouts: 4");
 } catch (e) {
 print("[SignSpaceHUD] world panel err: " + String(e));
 }
 }

 // B15e: tappable world vocab words (2 cols x 5 rows, left-aligned so labels
 // never overlap), UIKit-free. Each word gets an invisible SIK Interactable
 // collider sized to its label, so the desktop preview's mouse can click it.
 private addWorldVocab() {
 try {
 if (!this.findCameraObject()) return;
 const words = ["THANK YOU", "HELLO", "I LOVE YOU", "MORE", "WATER", "YES", "PLEASE", "SORRY", "ZEBRA"];
 const xs = [2, 10.5, 2, 10.5, 2, 10.5, 2, 10.5, 10.5];
 const ys = [-4.5, -4.5, -6.7, -6.7, -8.9, -8.9, -11.1, -11.1, -13.3];
 for (let i = 0; i < words.length; i++) {
 const w = words[i];
 const sikHitName = "SikHit_" + i + "_" + w.replace(/\s+/g, "_");
 this.mkWorldTap("WVocab_" + w.replace(/\s+/g, "_"), w, xs[i], ys[i], 8, COL_BODY, () => {
 print("[SignSpaceHUD] world VOCAB tap: " + w);
 if (this.hand) this.hand.playText(w);
 }, sikHitName);
 }
 print("[SignSpaceHUD] world vocab: 9 words");
 } catch (e) {
 print("[SignSpaceHUD] world vocab err: " + String(e));
 }
 }

 // B15d: world-space control row (visible in stereo preview, unlike the
 // screen-space panel): MIC (ASR toggle) + gloss-mode buttons.
 private addWorldControls() {
 try {
 const camObj = this.findCameraObject();
 if (!camObj) return;
 const mkBtn = (name: string, content: string, x: number, y: number, col: vec4, onTap: () => void) => {
 const obj = global.scene.createSceneObject(name);
 obj.setParent(camObj);
 obj.getTransform().setLocalPosition(new vec3(x, y, -45));
  const t = obj.createComponent("Component.Text") as Text;
  t.text = content;
  t.size = 8;
  t.textFill.color = col;
  try { t.horizontalOverflow = HorizontalOverflow.Overflow; } catch (e) { /* noop */ }
  const inter = obj.createComponent("Component.InteractionComponent") as InteractionComponent;
  inter.addMeshVisual(t);
  inter.onTap.add(onTap);
  };
  mkBtn("WMic", "MIC", 2, -15.5, COL_HEARD, () => {
  print("[SignSpaceHUD] world MIC tap");
  this.toggleASR();
  });
  mkBtn("WModeP", "PASS", 5, -15.5, COL_BODY, () => {
  this.glossMode = "passthrough";
  print("[SignSpaceHUD] gloss mode: passthrough");
  });
  mkBtn("WModeR", "RULES", 8.5, -15.5, COL_BODY, () => {
  this.glossMode = "rules";
  print("[SignSpaceHUD] gloss mode: rules");
  });
  mkBtn("WModeG", "GEMINI", 12, -15.5, COL_MUTED2, () => {
 this.glossMode = "gemini";
 print("[SignSpaceHUD] gloss mode: gemini (falls back to rules until RSG is wired)");
 });
 print("[SignSpaceHUD] world controls: 4 buttons");
 } catch (e) {
 print("[SignSpaceHUD] world controls err: " + String(e));
 }
 }

 private buildBodyAnchor() {
 // Unchanged from previous rounds: faint head+shoulders behind the hand.
 if (!this.hand) return;
 let mat: Material | null = null;
 try { mat = this.hand.getHandMaterial().clone(); } catch (e) { return; }
 if (!mat) return;
 const pass = mat.mainPass;
 pass.blendMode = 1;
 pass.baseColor = new vec4(0.62, 0.68, 0.78, 0.35);
 const body = global.scene.createSceneObject("BodyAnchor");
 body.setParent(this.getSceneObject());
 body.getTransform().setWorldPosition(new vec3(0, 6, -55));
 const head = global.scene.createSceneObject("Head");
 head.setParent(body);
 head.getTransform().setLocalPosition(new vec3(0, 13, 0));
 const hv = head.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
 hv.mesh = this.hand.getSphereMesh();
 hv.mainMaterial = mat;
 head.getTransform().setLocalScale(new vec3(9, 10, 9));
 const shoulders = global.scene.createSceneObject("Shoulders");
 shoulders.setParent(body);
 const sv = shoulders.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
 sv.mesh = this.hand.getSphereMesh();
 sv.mainMaterial = mat;
 shoulders.getTransform().setLocalScale(new vec3(15, 7, 9));
 }

 private toggleASR() {
 if (this.asrActive) this.stopASR(); else this.startASR();
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
 if (this.micLabel) this.micLabel.text = "Listen";
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
 if (this.micLabel) this.micLabel.text = "Listen";
 }

 private submitThroughGloss(raw: string) {
 toGloss(raw, this.glossMode).then((res) => {
 print("[SignSpaceHUD] gloss engine: " + res.engine + (res.error ? " (err " + res.error + ")" : ""));
 this.heard(res.text);
 });
 }

 private heard(text: string) {
 if (this.heardText) this.heardText.text = "heard: " + text;
 this.lastHeard = text;
 print("[SignSpaceHUD] readout heard: " + text);
 if (this.hand) this.hand.playText(text);
 }

 private refreshReadouts() {
 if (!this.hand) return;
 const label = this.hand.getCurrentLabel();
 if (label && this.cueText) this.cueText.text = label;
 const gloss = this.hand.getGloss();
 if (this.aslGlossText) {
 const g = gloss.map((t) => t.token).join(" ");
 this.aslGlossText.text = "ASL: " + (g || "—");
 }
 if (this.tokensText) {
 const t = gloss.map((x) => x.token + (x.mode === "sign" ? "*" : "+")).join(" ");
 this.tokensText.text = "gloss: " + (t || "—");
 }
 if (this.captionText) {
 const t = gloss.map((x) => x.token + (x.mode === "sign" ? "*" : "+")).join(" ");
 this.captionText.text = t;
 }
 if (this.wHeardText) this.wHeardText.text = "heard: " + (this.lastHeard || "—");
 if (this.wAslText) {
 const g = gloss.map((t) => t.token).join(" ");
 this.wAslText.text = "ASL: " + (g || "—");
 }
 if (this.wTokensText) {
 const t = gloss.map((x) => x.token + (x.mode === "sign" ? "*" : "+")).join(" ");
 this.wTokensText.text = "gloss: " + (t || "—");
 }
 }
}