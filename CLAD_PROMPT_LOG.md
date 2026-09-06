# SignSpace — CLAD Prompt Log

CLAD Summer Hackathon, Week 4: **Create**
> Build a spatial tool that helps people create something faster, easier, or more intuitively.

This file records the exact CLAD prompts and the closed-loop workflow used to build
SignSpace, a Spectacles (SPECS) AR Lens in Lens Studio. Each entry notes the prompt,
what CLAD did, and how it was verified. This is a living document — append every round.

---

## Concept

SignSpace: speak or type, and a spatial hand appears in front of you and signs ASL.
You *create* sign language instantly — faster and more intuitively than learning it.
A "create" mode lets you author your own sign for any word.

The build had two phases:

- **Phase A — Prototype and ported core.** A browser prototype (`handgloss`, Three.js)
  proved the idea: a parametric 21-landmark hand model, a 50+ word ASL vocabulary, a
  three-mode English→ASL gloss engine (passthrough / rules / Gemini), speech input, and
  a live HUD. Its logic was then ported into a pure TypeScript core (`lens/src/`) with no
  Three.js dependency. This phase was built outside Lens Studio; no CLAD verification is
  claimed for it.
- **Phase B — Lens Studio CLAD build.** The actual SPECS Lens assembled in Lens Studio
  5.23.2 with CLAD: scene setup, MeshBuilder hand rendering, SIK interactions, UI Kit
  HUD, preview testing, and iteration. Every CLAD prompt in this phase is recorded below
  with what CLAD did and how it was verified.

---

# Phase A — Prototype and ported core (built outside Lens Studio)

These rounds describe work done in the browser prototype and the TypeScript port. They
are included for context so judges can see where the Lens logic comes from. None of the
verification in this phase ran inside Lens Studio; the CLAD build is Phase B.

## A1 — Parametric hand model

A parametric handshape function takes finger-curl values, spread, and a thumb preset,
and returns 21 MediaPipe-order [x,y,z] landmarks. Includes the full A-Z alphabet and a
rest pose. Pose math (`lerpPose`, `mirrorHand`, `rotateHand`) interpolates and transforms
two-hand poses. Fidelity note: recognizable approximations, not textbook-perfect ASL.

Verified by a headless data-path check (`scripts/check-signs.mjs`): every landmark is a
finite [x,y,z] triple and every clip has 21 landmarks per present hand.

## A2 — Fingerspelling and whole-word vocabulary

`fingerspellClip(text)` turns a word into a playable clip: transition, hold, doubled-letter
bounce, J/Z motion paths, rest beats for spaces. ~50 whole-word ASL signs are authored as
declarative keyframes — handshape, body location (forehead, chin, chest, etc.), orientation,
movement overlays (shake, circle), holds — synthesized by the same engine. Aliases map
alternate English words to the same sign.

Verified by the same data-path check: every seed sign, fingerspelled word, and mixed
sentence synthesize into well-formed two-hand poses.

## A3 — Gloss engine and resolver

Three gloss modes: passthrough (word-to-sign), local rules (drop function words, uppercase),
and Gemini via a serverless proxy for real ASL grammar (topic-comment order, TIME first,
negation as NOT). Gemini degrades to rules on any error so the app never dead-ends. The
resolver tokenizes input, looks up each word or fingerspells it, and concatenates clips
with blended transitions so hands glide instead of teleporting.

Verified end-to-end in the browser app: text in → glossed → resolved into one playable
clip → hands animate → HUD shows the current cue and gloss line. Speech input (Web Speech
API) feeds the same pipeline, with graceful fallback to the text box.

## A4 — TypeScript port for SPECS

The verified logic was ported to `lens/src/` in pure TypeScript — `math.ts`, `handshape.ts`,
`pose.ts`, `fingerspell.ts`, `signs.ts`, `glosser.ts`, `resolve.ts` — with no Three.js
runtime dependency, compiling under `--strict`. The glosser's Gemini call targets the
SPECS Remote Service Gateway instead of the web proxy. This core is the drop-in logic
layer for the Lens Studio build in Phase B.

---

# Phase B — Lens Studio CLAD build (live log)

Environment: Lens Studio 5.23.2, SPECS Base Template project (`signspace-lens`), Lens
Studio MCP server over HTTP (localhost), CLAD plugin (`ls-clad`) with its skill suite,
OpenCode as the AI harness. Each round below is appended as it happens.

---

## Round B1 — Full build via SPECS experience builder

**Prompt:**
> Using SPECS experience builder, build SignSpace: a signing avatar that converts
> speech or typed text into animated ASL in my space. Use SIK for hand interactions
> and UI Kit for the panel UI. The sign logic is already ported — pure TypeScript
> modules live in ../signspace/lens/src/ (handshape, pose, fingerspell, signs, glosser,
> resolve, math): port them into Assets/ as the engine. Render the signing hand with
> MeshBuilder as a stylized friendly mannequin hand: rounded palm volume, capsule
> finger segments, sphere-capped fingertips, warm light-toned material with subtle
> emissive rim — bright colors, no darks (holographic display) — re-posed each frame
> from the pose clips, no per-frame allocation. Add a world-space HUD with UI Kit:
> heard-text, current sign cue, gloss line, a text input, and mic button using the
> SPECS ASR module for speech-to-text. A faint head + shoulders reference sits behind
> the hands as a body anchor for location-based signs. Build it in stages: (1) project
> init + packages (set Project Target to Spectacles), (2) MeshBuilder mannequin hand
> playing one fingerspelled word, (3) full vocabulary playback, (4) HUD + ASR wired
> to the resolver. Verify each stage in preview with LEAF before moving to the next.

**CLAD did:**
- Stage 1 (done) — project init: SPECS project validated, packages (SIK, UI Kit) in
  place, SIK prefab in the scene.
- Stage 2 (done, verified) — `Assets/Scripts/MannequinHand.ts`: the stylized mannequin
  hand built from MeshBuilder primitives — rounded palm, capsule finger segments,
  sphere-capped fingertips, warm cream material with subtle emissive rim (clone+tint of
  SIK's `DefaultSphereSimple`, shared asset untouched), driven by the ported handshape
  math, re-posed per frame with no per-frame allocation. Exposes live inspector inputs
  (Hand Scale cm, Spell Text) on the `SignSpaceHand` scene object.
- Stage 3 (pending) — full vocabulary playback: wire `resolve.ts` so typed/glossed
  phrases play whole-word signs from the VOCAB dict with fingerspell fallback.
- Stage 4 (pending) — UI Kit HUD + SPECS ASR wired to the resolver.
- Ported the logic core into `Assets/SignLanguage/`: `math.ts`, `handshape.ts`,
  `pose.ts`, `fingerspell.ts`, `signs.ts`, `glosser.ts`, `resolve.ts` — all seven
  modules from the Phase A port, now inside the Lens project.

**Stage 2 verification (from the build session):**

| Evidence | Result |
|----------|--------|
| Compile gate | zero errors |
| Runtime errors | none — startup crash fixed (blank-material guard + interleaved vertex API) |
| Rig build | both hands: 165-vert palm spheres, 22-vert segments, all valid |
| Clip playback | `spell:HELLO` 90 frames at 30fps, letters cycling H-E-L-L-O |
| Rendering | warm cream hand, visible finger spread, pose changes frame-to-frame |

The closed loop in action: the first build crashed at runtime; CLAD diagnosed the
blank material and vertex-layout mismatch, fixed both, recompiled, and re-verified
to zero errors before reporting the stage done.

**Artifacts (verifiable in repo):**
```
Assets/Scripts/MannequinHand.ts                   MeshBuilder mannequin hand
Assets/SignLanguage/ (7 modules)                  ported Phase A logic core
Assets/Scripts/VocabularyPlayer.ts, HUD_ASRController.ts, SignSpaceController.ts
                                                  staged for Stages 3-4
```

**Verified:** Stages 1-2 verified (compile clean, runtime clean, playback confirmed).
Stages 3-4 in progress.

---

_(append rounds below as the build progresses)_

---

## Post-build notes

_(fill in at the end of the build)_
