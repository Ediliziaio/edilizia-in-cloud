// _shared/ai-provider/roomRewriterProfile.ts
//
// Profilo dominio RISTRUTTURAZIONE/STANZA per il meta-prompt rewriter generico.
// Analogo del system prompt infissi, sulle regole del restyling interni.

import type { RewriterProfile } from "./domainRewriter.ts";

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic interior-restyling AI renders.

You receive a JSON config describing how an existing room (shown in a source photo) must be restyled. The image model (OpenAI gpt-image-1) receives ONLY your output prose to generate the render — there is no second pass. Write 300-500 words of dense, natural English prose. Every sentence must carry a concrete instruction.

THE SINGLE MOST IMPORTANT RULE — SAME ROOM, NOT A NEW ROOM.
This is a restyling of THIS room in THIS photo, not the generation of a similar-looking room. Architecture is frozen: walls in the same positions, same room shape and proportions, windows and doors in the same places and sizes, same ceiling, same camera angle, same point of view and framing as the source. The viewer must recognize it as the same room, redecorated. Never rotate the room, never change the perspective, never invent an extra window or move a door. If it looks like a stock render of a different apartment, it is a failure.

TRANSFORMATION INTENSITY (intensita) GOVERNS HOW MUCH CHANGES.
- Light intensity: colors, textiles, small decor and finishes change; furniture layout and main pieces stay essentially as in the source.
- Medium: finishes + most furniture are renewed, but the functional layout (where the sofa/bed/table zone sits) is respected.
- Strong/complete: full redesign of surfaces and furnishings, still within the SAME architecture, aperture positions and camera.
State plainly what the chosen intensity implies for this render. Do not over-transform a light restyling.

WHAT THE CONFIG CONTROLS (only act on sections that are active/enabled):
- Style target (stile_target): the coherent design language the whole room must read as.
- Wall paint (verniciatura): apply the stated color to the correct walls; leave others as configured.
- Floor (pavimento): replace with the stated material/finish/format; keep the floor plane and perspective identical.
- Furniture (arredo): renew or restyle according to the layout mode — never scatter random staging furniture; respect the room's function.
- Ceiling (soffitto), lighting (illuminazione): apply only if enabled; lighting must stay physically plausible for this room.
- Wallpaper (carta_da_parati), wall cladding (rivestimento_pareti): apply to the stated walls with the stated pattern/material.
- Curtains (tende): apply at the existing windows only.
- Kitchen restyling (restyling_cucina) and detail spaces (spazi_dettagli): only if present in config.

USE THE SCENE ANALYSIS TO PRESERVE.
The config carries an analysis of the current room (current style, existing furniture, dominant colors, current lighting). Use it to know what is there now, so you transform deliberately instead of hallucinating — and so that anything NOT targeted keeps its current identity.

Absolute constraints for EVERY render:
- Same architecture, same apertures, same camera angle and framing as the source. Edit of the photo, not a new scene.
- Photographic realism: real materials, real light and shadows consistent with the existing windows. No CGI look, no cartoon, no painterly finish, no dollhouse view.
- Keep existing fixed elements (radiators, structural beams, existing window frames) unless the config explicitly restyles them.
- No text, no watermarks, no floating catalog objects, no furniture clipping through walls.

Output ONLY the render brief prose. No preamble, no bullet headers, no JSON.`;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * Riduce il config stanza a cio' che serve al rewriter.
 *
 * DUE SORGENTI, DIVERSE PER FORMA:
 *  - `config` (session.config) e' il config GREZZO del wizard: chiavi piatte
 *    (tipo_stanza, stile_target, intensita) e sezioni con flag `attivo`.
 *  - `config_snapshot` e' l'arricchimento prodotto dal prompt builder e NON ha
 *    campi tipo `stile_attuale` alla radice: contiene `scene_analysis`,
 *    `replacement_manifest`, `integrity_constraints`, `negative_constraints`.
 *
 * La prima versione leggeva `scene.stile_attuale` direttamente dallo snapshot:
 * quelle chiavi non esistono a quel livello, quindi l'analisi di scena usciva
 * tutta null e il replacement_manifest — che e' il dato piu' ricco — veniva
 * ignorato del tutto. Qui si leggono entrambe le sorgenti nella loro forma vera.
 */
function compactRoomConfig(input: unknown): Record<string, unknown> {
  const c = asObj(input);
  const cfg = asObj(c.config ?? c.configurazione ?? c);
  const snap = asObj(c.analisi ?? c.config_snapshot);
  const scene = asObj(snap.scene_analysis);
  const manifest = asObj(snap.replacement_manifest);

  // Sezioni condizionali: incluse solo se marcate attive.
  const seActiva = (k: string) => {
    const sec = asObj(cfg[k]);
    return sec.attivo === true || sec.enabled === true || sec.abilitato === true ? sec : undefined;
  };
  const sezioni = [
    "verniciatura", "pavimento", "arredo", "soffitto", "illuminazione",
    "carta_da_parati", "rivestimento_pareti", "tende", "restyling_cucina", "spazi_dettagli",
  ];
  const attive: Record<string, unknown> = {};
  const inattive: string[] = [];
  for (const k of sezioni) {
    const sec = seActiva(k);
    if (sec) attive[k] = sec;
    else if (cfg[k] !== undefined) inattive.push(k);
  }

  return {
    tipo_stanza: cfg.tipo_stanza ?? scene.roomType ?? null,
    stile_target: cfg.stile_target ?? null,
    intensita: cfg.intensita ?? "media",
    // Cosa cambia e cosa no: le due meta' della stessa istruzione.
    elementi_da_cambiare: Object.keys(attive),
    specifiche: attive,
    elementi_da_preservare: inattive,
    note_libere: cfg.note_libere || null,
    // Istruzioni gia' formulate dal builder, se presenti.
    interventi_attivi: manifest.activeInterventions ?? null,
    additions: manifest.additions ?? null,
    removals: manifest.removals ?? null,
    strict_preservation: manifest.strictPreservation ?? null,
    geometry_rules: manifest.geometryRules ?? null,
    integrity_constraints: snap.integrity_constraints ?? null,
    negative_constraints: snap.negative_constraints ?? null,
    // Stato attuale della stanza: serve per trasformare senza allucinare.
    scena: {
      room_type: scene.roomType ?? null,
      camera: scene.cameraPerspective ?? null,
      layout: scene.perceivedLayout ?? null,
      architettura_fissa: scene.fixedArchitecture ?? null,
      ancore_funzionali: scene.functionalAnchors ?? null,
      pareti: scene.wallDescription ?? null,
      pavimento: scene.floorDescription ?? null,
      soffitto: scene.ceilingDescription ?? null,
      aperture: scene.windowsAndDoors ?? null,
      illuminazione: scene.lighting ?? null,
      superfici_visibili: scene.visibleSurfaces ?? null,
      elementi_cucina: scene.kitchenElements ?? null,
      oggetti_mobili: scene.movableObjects ?? null,
      vincoli: scene.constraints ?? null,
    },
  };
}

/**
 * Coverage check: la prosa deve nominare lo stile target e affermare la
 * preservazione dell'architettura/camera, altrimenti rischia la "stanza
 * generata". Se manca → fallback ai blocchi.
 */
function validateRoomCoverage(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const missing: string[] = [];

  const stile = (compact.stile_target as string | undefined)?.toLowerCase();
  if (stile && stile.length > 2 && !lower.includes(stile) && !/style|stile/i.test(lower)) {
    missing.push("target style");
  }
  if (!/(same room|same architecture|same camera|same perspective|stessa stanza|identical|preserv)/i.test(lower)) {
    missing.push("same-room / architecture preservation");
  }

  return missing.length > 0 ? missing : null;
}

export const ROOM_REWRITER_PROFILE: RewriterProfile = {
  domain: "room",
  systemPrompt: SYSTEM_PROMPT,
  compact: compactRoomConfig,
  validate: validateRoomCoverage,
};
