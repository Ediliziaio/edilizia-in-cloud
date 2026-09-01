// _shared/ai-provider/bathroomRewriterProfile.ts
//
// Profilo dominio BAGNO per il meta-prompt rewriter generico.
// Analogo del system prompt infissi, ma sulle regole del render bagno.

import type { RewriterProfile } from "./domainRewriter.ts";

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic bathroom-renovation AI renders.

You receive a JSON config describing how an existing bathroom (shown in a source photo) must be renovated. The image model receives ONLY your output prose to generate the render — there is no second pass. Write 350-550 words of dense, natural English prose. Every sentence must carry a concrete instruction.

HOW TO READ THE CONFIG:
- "elementi_da_cambiare" + "specifiche": the elements that MUST change, each with its full technical rules (format, effect description, laying pattern, grout color, scale locks, installation rules). These are your primary material.
- "replacements" / "additions" / "removals": instructions already formulated by the system. Fold them into your prose faithfully — do not water them down, do not drop details.
- "elementi_da_preservare", "preserve_exactly", "untouched_surfaces": what must stay pixel-identical.
- "scena": the CURRENT state of the room (existing tiles, floor, shower, vanity, sanitaryware, camera). Use it to know what is being replaced.
- "integrity_constraints": hard constraints, always restate the essential ones.

THE SINGLE MOST IMPORTANT RULE — CHANGE EXACTLY WHAT IS LISTED, AND SAY SO.
Everything in "elementi_da_cambiare" MUST visibly change in the render, with the exact material, format and finish stated in "specifiche". Everything in the preserve lists must stay pixel-identical: same position, same size, same model, same finish. Do NOT restyle untouched elements, and do NOT leave the requested changes unapplied. A render that comes back looking identical to the source is a total failure; so is one that redesigns the whole room. State explicitly, element by element, both what changes and what is preserved.

FUNCTIONAL POINTS ARE FIXED.
WC, bidet, sink/basin, shower drain and bathtub occupy fixed plumbing positions. They must NOT be moved, duplicated, mirrored or invented. The count of sanitary fixtures stays as in the source unless the config explicitly replaces or adds one. Never leave an old WC beside a new one. Plumbing does not migrate across walls.

THE BIDET RULE.
Check the scene: if the source photo has NO bidet (scena.sanitari_attuali says bidetPresent false or none), then a "replace bidet" instruction refers to a fixture that does not exist — do NOT invent one. Only add a bidet when the config explicitly asks to ADD it. And even then, place it ONLY if there is plausible clearance beside the WC (a real bidet needs roughly 55-60cm of centerline distance from the WC and free wall length): if the room clearly has no room for it — WC tight against the shower or the wall — OMIT the bidet entirely rather than squeezing it into the shower, in a corner, or floating in walking space. A missing bidet is correct; a bidet in an impossible position is a failure.

TILES AND SLAB FORMATS — RESPECT THE REAL SCALE.
Honor the stated format literally. Large-format material (e.g. 60x120) must read as genuinely oversized modules with few, thin, refined joints in the stated grout color — never as a dense grid of small tiles. Standard formats (e.g. 60x60) keep a normal residential joint rhythm. Always name the laying pattern and the grout color: they drive the whole read of the surface.

SHOWER / BATHTUB / SANITARYWARE.
Swaps happen in the SAME footprint: erase the old fixture, build the new one in the same recess and width. For walk-in showers state glass type, tray type, profile finish and shower head. For wall-hung WC state the concealed cistern and the visible flush plate (style, color, position) — the flush plate is mandatory when specified and must never become an exposed tank.

Absolute constraints for EVERY render:
- Same room, same architecture, same camera angle and perspective as the source. This is an edit of the photo, not a new bathroom.
- Windows, doors, ceiling height and room proportions stay identical.
- Photographic realism: real materials, real reflections on tiles and glass, correct lighting. No CGI look, no cartoon, no painterly finish.
- No text, no watermarks, no swatch rectangles, no floating catalog objects.

Output ONLY the render brief prose. No preamble, no bullet headers, no JSON.`;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * Riduce il config bagno a cio' che serve al rewriter.
 *
 * ATTENZIONE ALLO SCHEMA: la configurazione salvata in sessione e' lo schema
 * "bathroom_render_v2" prodotto da buildBathroomPrompt, NON il config grezzo
 * del wizard. I flag booleani `sostituzione` vivono annidati sotto
 * `legacy_config`; la verita' operativa sta in `technical_specification` (ogni
 * sezione ha `replace: true|false` con le sue regole descrittive) e in
 * `replacement_manifest` (removals / additions / replacements / preserveExactly).
 *
 * Prima versione di questo compactor leggeva `cfg.sostituzione` alla radice:
 * non esiste, quindi l'elenco delle modifiche usciva VUOTO e il rewriter —
 * seguendo la regola "cio' che non e' flaggato resta pixel-identico" —
 * produceva una prosa che ordinava al modello di non cambiare nulla. Il render
 * usciva identico all'originale. Da qui la lettura esplicita dello schema v2.
 */
function compactBathroomConfig(input: unknown): Record<string, unknown> {
  const c = asObj(input);
  const cfg = asObj(c.configurazione ?? c);

  // Schema v2 (quello reale in sessione).
  const tech = asObj(cfg.technical_specification);
  const manifest = asObj(cfg.replacement_manifest);
  const scene = asObj(cfg.scene_analysis ?? c.analisi_bagno);

  if (Object.keys(tech).length > 0 || Object.keys(manifest).length > 0) {
    // Sezioni da cambiare: quelle con replace === true, con le loro regole.
    const daCambiare: Record<string, unknown> = {};
    const daPreservare: string[] = [];
    for (const [nome, val] of Object.entries(tech)) {
      const sec = asObj(val);
      if (sec.replace === true) daCambiare[nome] = sec;
      else if (sec.replace === false) daPreservare.push(nome);
    }

    return {
      intervention_type: cfg.intervention_type ?? asObj(cfg.legacy_config).tipo_intervento ?? null,
      // Cosa cambia, con tutte le specifiche tecniche gia' elaborate.
      elementi_da_cambiare: Object.keys(daCambiare),
      specifiche: daCambiare,
      // Cosa NON si tocca: e' la meta' altrettanto importante dell'istruzione.
      elementi_da_preservare: daPreservare,
      preserve_exactly: manifest.preserveExactly ?? null,
      untouched_surfaces: manifest.untouchedSurfaces ?? null,
      // Istruzioni gia' formulate dal builder: il rewriter le trasforma in prosa.
      replacements: manifest.replacements ?? null,
      additions: manifest.additions ?? null,
      removals: manifest.removals ?? null,
      integrity_constraints: cfg.integrity_constraints ?? null,
      quality_directives: cfg.quality_directives ?? null,
      note_libere: asObj(cfg.legacy_config).note_libere || cfg.notes || null,
      // Stato attuale della stanza, per trasformare senza allucinare.
      scena: {
        room_type: scene.roomType ?? scene.room_type ?? null,
        layout: scene.layoutType ?? scene.layout ?? null,
        camera: scene.cameraPerspective ?? scene.cameraAngle ?? null,
        wall_tiles_attuali: scene.wallTiles ?? null,
        floor_attuale: scene.floor ?? null,
        shower_attuale: scene.shower ?? null,
        vanity_attuale: scene.vanity ?? null,
        sanitari_attuali: scene.sanitaryWare ?? null,
        preserve_rigidly: scene.preserveRigidly ?? null,
      },
    };
  }

  // Fallback: config grezzo del wizard (flag booleani alla radice).
  const sost = asObj(cfg.sostituzione);
  const attivo = (k: string) => {
    const sec = asObj(cfg[k]);
    return sec.attivo === true ? sec : undefined;
  };
  return {
    tipo_intervento: cfg.tipo_intervento ?? "restyling_completo",
    sostituzione: sost,
    elementi_da_cambiare: Object.entries(sost).filter(([, v]) => v === true).map(([k]) => k),
    piastrelle_parete: attivo("piastrelle_parete") ?? null,
    pavimento: attivo("pavimento") ?? null,
    doccia: attivo("doccia") ?? null,
    vasca: attivo("vasca") ?? null,
    vanity: attivo("vanity") ?? null,
    sanitari: attivo("sanitari") ?? null,
    rubinetteria: attivo("rubinetteria") ?? null,
    parete: attivo("parete") ?? null,
    illuminazione_tipo: cfg.illuminazione_tipo ?? null,
    note_libere: cfg.note_libere ?? null,
    scena: {
      room_type: scene.room_type ?? null,
      layout: scene.layout ?? scene.layout_type ?? null,
      fixtures: scene.fixtures ?? null,
    },
  };
}

/**
 * Coverage check: la prosa deve nominare cio' che davvero cambia, altrimenti
 * rischia di restyling-are tutto. Se manca un elemento chiave → fallback.
 */
function validateBathroomCoverage(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const missing: string[] = [];

  const cambiati = Array.isArray(compact.elementi_da_cambiare)
    ? compact.elementi_da_cambiare as string[]
    : [];

  // Se ci sono elementi da cambiare, la prosa DEVE parlare di sostituzione.
  // E' il controllo che avrebbe intercettato il render "non cambiare nulla".
  if (cambiati.length > 0 && !/(replace|new |install|renew|swap|sostitu)/i.test(lower)) {
    missing.push("actual replacement instructions");
  }

  // Ogni elemento chiave deve comparire: se cambiano le piastrelle a parete o
  // il pavimento, la prosa deve nominarli esplicitamente.
  // Regex volutamente LARGHE: servono a intercettare una prosa che ha ignorato
  // del tutto un elemento, non a imporre una formulazione. La prima versione
  // pretendeva "wall tile" alla lettera e scartava prose corrette che dicevano
  // "wall covering" o "tiles on the walls": il rewriter rigenerava con un
  // modello piu' lento (15s invece di 5s) senza alcun guadagno.
  const mappa: Record<string, RegExp> = {
    wallTiles: /wall|tile|tiled|cladding|covering|rivestiment|piastrell/i,
    floor: /floor|flooring|pavimento|ground/i,
    shower: /shower|doccia|walk-in/i,
    sanitaryWare: /wc|toilet|sanitary|bidet|ceramic|flush/i,
    bathtub: /bathtub|tub|vasca/i,
    vanity: /vanity|washbasin|basin|sink|mobile/i,
    faucets: /faucet|tap|mixer|fitting|rubinett/i,
  };
  for (const el of cambiati) {
    const re = mappa[el];
    if (re && !re.test(lower)) missing.push(`mention of ${el}`);
  }

  // Deve esserci l'affermazione di preservare cio' che non cambia.
  if (!/(preserv|identical|unchanged|same as|keep)/i.test(lower)) {
    missing.push("preservation of untouched elements");
  }

  return missing.length > 0 ? missing : null;
}

export const BATHROOM_REWRITER_PROFILE: RewriterProfile = {
  domain: "bathroom",
  systemPrompt: SYSTEM_PROMPT,
  compact: compactBathroomConfig,
  validate: validateBathroomCoverage,
};
