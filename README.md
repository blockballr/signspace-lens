# SignSpace

SignSpace is a Spectacles (SPECS) AR Lens for the CLAD Summer Hackathon, Week 4:
Create. Speak or type, and a signing hand appears in front of you and plays American
Sign Language. Known words are signed whole. Everything else is fingerspelled, letter
by letter, so the Lens never fails to say something.

It answers the Create theme directly: it lets anyone create signed messages without
knowing ASL, for a Deaf friend, a classroom, or themselves.

## What is built

- A MeshBuilder wire and bead signing hand, driven by a 21 landmark model. Two hands,
  per frame transform writes only, no allocation.
- A ported sign language core: handshapes, poses, fingerspelling, a whole word sign
  dictionary, and a three mode English to ASL gloss engine (passthrough, local rules,
  Gemini with a rules fallback).
- A world interface with heard text, the current sign cue, the ASL gloss line, a text
  input, and a mic button, built as editor scene objects in screen space.
- Speech input through the SPECS ASR module, degrading gracefully to typed input.

Every build round was run through CLAD, the closed loop of prompt, build, verify, and
fix. The full record is in CLAD_PROMPT_LOG.md.

## Quickstart

Requirements: Lens Studio 5.23.2 or later, the SPECS target, and the packages in
Packages/ (they are committed, so a fresh clone builds).

1. Clone this repository.
2. Open signspace-lens.esproj in Lens Studio.
3. Set the project target to Spectacles if it is not already.
4. Open the Preview panel and select a SPECS 27 stereo device.
5. Press play. The hand signs HELLO on start.

To sign a different phrase, set the Test Phrase input on the SignSpaceHUD object in
the Inspector, then reset the preview. The phrase goes through the same path the
return key and the microphone use.

## Preview notes

There are two honest preview limitations.

The SPECS 27 stereo preview in current Lens Studio builds does not render screen
space (ScreenTransform) UI layers. The interface renders correctly in the two
dimensional device preview and in the runtime; see CLAD_PROMPT_LOG.md, Round B15, for
the evidence. Speech recognition requires a physical Spectacles device with a
microphone and internet. In desktop preview the ASR path starts and stops with error
handling, but it cannot capture live speech. The typed path and the voice to resolver
path are wired for device testing.

## How it works

The sign logic lives in Assets/SignLanguage as a pure TypeScript core with no Lens
dependencies, ported from a browser prototype. handshape.ts maps finger curl values
to 21 landmark positions. fingerspell.ts builds letter clips. signs.ts holds the
whole word vocabulary and body locations. glosser.ts converts English to ASL gloss.
resolve.ts turns free text into one playable clip with blended transitions.

Assets/Scripts builds the rendering. HandRig.ts constructs the hand from shared unit
meshes and reposes it per frame. SignSpaceHand.ts resolves text and drives playback.
SignSpaceHUD.ts links the interface to the hand and owns the ASR session.

## Repository layout

- Assets/SignLanguage: the ported sign core.
- Assets/Scripts: the hand rig, the hand driver, and the interface.
- Assets/SignSpace: the hand and panel materials.
- CLAD_PROMPT_LOG.md: the complete CLAD build record, Phase A prototype through the
  current round.
- demo-voiceover.txt: the demo narration script.

## Status

All four build stages are complete and verified in preview: project setup, the
MeshBuilder hand, the full vocabulary with fingerspell fallback, and the interface
with ASR wiring. Known deferred work: a rigged cartoon hand, selectable virtual
backdrops, and share to platform. See VISION.md in the companion repository,
blockballr/asl-gesture-animation-agent, for the product roadmap.
