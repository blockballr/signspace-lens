// glosser.ts - English -> ASL gloss, the "agent" stage that sits in front of the sign
// resolver. Three swappable modes:
//   passthrough : English words map straight to signs (no grammar)
//   rules       : local heuristic gloss (drop function words, uppercase); no network
//   gemini      : Gemini LLM for real ASL gloss (best grammar) via /specs-ai-remote-service
// gemini falls back to rules on any error (no key, offline) so the app never dead-ends.
//
// Ported from the web prototype's src/glosser.js. In the SPECS Lens this is a
// bound cloud call; the AI-returned gloss string is passed straight through. If the
// call fails we throw, and toGloss downgrades to rules.

export const GLOSS_MODES = ['passthrough', 'rules', 'gemini'] as const;
export type GlossMode = (typeof GLOSS_MODES)[number];

const DROP = new Set([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'to', 'of', 'do', 'does', 'did', 'will', 'would', 'and', 'that', 'this',
]);

export function glossRules(text: string): string {
  const toks = (text.toLowerCase().match(/[a-z'-]+/g) || []).filter((w) => !DROP.has(w));
  return toks.join(' ').toUpperCase();
}

// Gemini gloss via the SPECS RSG (Remote Service Gateway). In a SPECS Lens this is a
// bound cloud call; the AI-returned gloss string is passed straight through. If the
// call fails we throw, and toGloss downgrades to rules.
//
// NOTE: Lens scripts have no `fetch`. Stage 4 wires this to RemoteServiceGateway
// (RemoteServiceModule). Until then it throws and toGloss degrades to rules.
export async function glossGemini(text: string): Promise<string> {
  throw new Error('gemini gloss not wired yet (RemoteServiceGateway lands in stage 4)');
}

export interface GlossResult {
  text: string;
  engine: GlossMode;
  error?: string;
}

// Returns { text, engine, error } where engine is what actually produced the gloss
// (gemini may downgrade to rules on failure).
export async function toGloss(text: string, mode: GlossMode): Promise<GlossResult> {
  if (mode === 'gemini') {
    try {
      return { text: await glossGemini(text), engine: 'gemini' };
    } catch (e) {
      return { text: glossRules(text), engine: 'rules', error: String((e as Error)?.message || e) };
    }
  }
  if (mode === 'rules') return { text: glossRules(text), engine: 'rules' };
  return { text, engine: 'passthrough' };
}