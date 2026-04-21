/**
 * scripts/load-wnd-families.ts
 *
 * Carica nel listino famiglie del tenant demo (demo@azienda.srl) due modelli
 * di infissi dal listino fornitore WND:
 *
 *   • COSTRUZIONE 2 IT — FINESTRA 1 ANTA
 *   • COSTRUZIONE 3 IT — PORTA BALCONE 1 ANTA
 *
 * Uso:
 *   npx tsx scripts/load-wnd-families.ts
 *
 * Cosa fa:
 *   1. Login con credenziali demo (anon key + JWT sessione)
 *   2. Crea (o riusa) macrocategoria "INFISSI WND"
 *   3. Crea (o riusa) categorie "FINESTRA 1 ANTA" + "PORTA BALCONE 1 ANTA"
 *   4. Crea le due famiglie con modalità prezzo "griglia" + mode
 *      "acquisto_markup" (il listino fornitore è prezzo ACQUISTO, markup % 35)
 *   5. Crea gli assi:
 *        - Profilo (Etrum/Square/Konfortline/Square Plus/Ravia/Ravia Pro)
 *        - Telaio (Standard/R65/Z40/Z15)
 *        - (solo Porta balcone) Soglia (Std/Ribassata Sq/Ribassata Ravia)
 *   6. Inserisce le celle di `listino_griglia` con `prezzo_acquisto` = riga 1
 *      del listino fornitore (il profilo più economico). `prezzo_vendita`
 *      viene calcolato = acquisto * 1.35 (markup 35%) come cache iniziale.
 *
 * Idempotente: rilanciabile; se la macrocategoria/categorie/famiglie esistono
 * già (match su nome+company_id) le riusa e skippa.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ────────────────────────────────────────────────────────────────────
// 0. Config
// ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_FILE = path.resolve(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(ENV_FILE, "utf-8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...rest] = l.split("=");
      return [k.trim(), rest.join("=").trim()];
    })
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DEMO_EMAIL = "demo@azienda.srl";
const DEMO_PASSWORD = "Demo2026Azienda";

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error(".env.local deve contenere VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY");
}

const MARKUP_PERCENT = 35;

// ────────────────────────────────────────────────────────────────────
// 1. Dati: griglie (prezzo_acquisto = riga 1 del listino fornitore)
//    Formato: [altezza, [[larghezza, prezzo], ...]]
// ────────────────────────────────────────────────────────────────────

/** FINESTRA 1 ANTA — listino riga 1 (profilo base, prezzo minimo). */
const GRID_FINESTRA: Array<[number, Array<[number, number]>]> = [
  [500, [
    [500, 250], [600, 262], [700, 270], [800, 296], [900, 309], [1000, 325],
  ]],
  [600, [
    [500, 250], [600, 262], [700, 270], [800, 284], [900, 289],
    [1000, 340], [1100, 354], [1200, 371],
  ]],
  [700, [
    [500, 262], [600, 270], [700, 284], [800, 290], [900, 304], [1000, 317],
    [1100, 377], [1200, 395], [1400, 408], [1500, 457],
  ]],
  [800, [
    [500, 270], [600, 284], [700, 290], [800, 304], [900, 309], [1000, 352],
    [1100, 373], [1200, 371], [1300, 442], [1400, 485],
  ]],
  [900, [
    [500, 284], [600, 290], [700, 304], [800, 312], [900, 328], [1000, 373],
    [1100, 392], [1200, 409], [1300, 428], [1400, 518],
  ]],
  [1000, [
    [500, 299], [600, 312], [700, 318], [800, 336], [900, 352], [1000, 406],
    [1100, 419], [1200, 439], [1300, 460], [1400, 485], [1500, 507],
  ]],
  [1100, [
    [500, 319], [600, 319], [700, 329], [800, 373], [900, 373], [1000, 419],
    [1100, 455], [1200, 455], [1300, 479], [1400, 507], [1500, 527],
  ]],
  [1200, [
    [500, 319], [600, 319], [700, 352], [800, 373], [900, 373], [1000, 439],
    [1100, 455], [1200, 455], [1300, 501], [1400, 527], [1500, 552],
  ]],
  [1300, [
    [500, 328], [600, 336], [700, 366], [800, 385], [900, 409], [1000, 454],
    [1100, 481], [1200, 499], [1300, 527], [1400, 552], [1500, 573],
  ]],
  [1400, [
    [500, 354], [600, 354], [700, 376], [800, 433], [900, 433], [1000, 472],
    [1100, 512], [1200, 512], [1300, 549], [1400, 568], [1500, 568],
  ]],
  [1500, [
    [500, 354], [600, 354], [700, 397], [800, 433], [900, 433], [1000, 494],
    [1100, 512], [1200, 512], [1300, 573], [1400, 568], [1500, 568],
  ]],
  [1600, [
    [500, 387], [600, 387], [700, 409], [800, 466], [900, 466], [1000, 513],
    [1100, 539], [1200, 564], [1300, 596], [1400, 622],
  ]],
  [1700, [
    [500, 387], [600, 387], [700, 428], [800, 466], [900, 466], [1000, 539],
    [1100, 564], [1200, 596], [1300, 623],
  ]],
  [1800, [
    [500, 392], [600, 419], [700, 454], [800, 481], [900, 507], [1000, 559],
    [1100, 596], [1200, 623], [1300, 646],
  ]],
];

/** PORTA BALCONE 1 ANTA — listino riga 1 (profilo base). */
const GRID_PORTA_BALCONE: Array<[number, Array<[number, number]>]> = [
  [1700, [
    [500, 387], [600, 387], [700, 428], [800, 465], [900, 466], [1000, 539],
    [1100, 564], [1200, 596], [1300, 623],
  ]],
  [1800, [
    [500, 392], [600, 419], [700, 454], [800, 481], [900, 507], [1000, 559],
    [1100, 596], [1200, 623], [1300, 646],
  ]],
  [1900, [
    [500, 406], [600, 439], [700, 466], [800, 494], [900, 527], [1000, 587],
    [1100, 623], [1200, 646],
  ]],
  [2000, [
    [500, 428], [600, 454], [700, 485], [800, 513], [900, 547], [1000, 606],
    [1100, 640], [1200, 667],
  ]],
  [2100, [
    [500, 439], [600, 466], [700, 499], [800, 532], [900, 532], [1000, 628],
    [1100, 662],
  ]],
  [2200, [
    [500, 454], [600, 485], [700, 523], [800, 551], [900, 551], [1000, 617],
    [1100, 683],
  ]],
  [2300, [
    [500, 466], [600, 499], [700, 532], [800, 573], [900, 573], [1000, 636],
    [1100, 702],
  ]],
  [2400, [
    [500, 481], [600, 513], [700, 547], [800, 587], [900, 592], [1000, 657],
    [1100, 721],
  ]],
  [2500, [
    [500, 494], [600, 527], [700, 564], [800, 601], [900, 640], [1000, 703],
  ]],
  [2600, [
    [500, 580], [600, 613], [700, 652], [800, 690], [900, 734],
  ]],
];

// ────────────────────────────────────────────────────────────────────
// 2. Assi
// ────────────────────────────────────────────────────────────────────

/** Profilo — maggiorazioni percentuali rispetto al profilo base (riga 1). */
const ASSE_PROFILO = {
  codice: "profilo",
  nome: "Profilo",
  tipo: "discrete" as const,
  values: [
    { valore: "etrum", label: "Etrum", mag_tipo: "none", mag_val: 0, is_default: true },
    { valore: "square", label: "Square", mag_tipo: "percentuale", mag_val: 8 },
    { valore: "konfortline", label: "Konfortline", mag_tipo: "percentuale", mag_val: 8 },
    { valore: "square_plus", label: "Square Plus", mag_tipo: "percentuale", mag_val: 15 },
    { valore: "ravia", label: "Ravia (+8%)", mag_tipo: "percentuale", mag_val: 8 },
    { valore: "ravia_pro", label: "Ravia Pro (+18%)", mag_tipo: "percentuale", mag_val: 18 },
  ],
};

/** Telaio — da listino fornitore R65 / Z40 / Z15 = +5% ciascuno. */
const ASSE_TELAIO = {
  codice: "telaio",
  nome: "Telaio",
  tipo: "discrete" as const,
  values: [
    { valore: "standard", label: "Standard", mag_tipo: "none", mag_val: 0, is_default: true },
    { valore: "r65", label: "R65 (+5%)", mag_tipo: "percentuale", mag_val: 5 },
    { valore: "z40", label: "Z40 (+5%)", mag_tipo: "percentuale", mag_val: 5 },
    { valore: "z15", label: "Z15 (+5%)", mag_tipo: "percentuale", mag_val: 5 },
  ],
};

/** Soglia ribassata — solo porta balcone, fisso €/ml. */
const ASSE_SOGLIA = {
  codice: "soglia",
  nome: "Soglia",
  tipo: "discrete" as const,
  values: [
    { valore: "standard", label: "Standard", mag_tipo: "none", mag_val: 0, is_default: true },
    {
      valore: "ribassata_sq",
      label: "Ribassata (Square/Konfortline/Sq+) — 66 €/ml",
      mag_tipo: "fisso_ml",
      mag_val: 66,
    },
    {
      valore: "ribassata_ravia",
      label: "Ribassata (Ravia/Ravia Pro) — 120 €/ml",
      mag_tipo: "fisso_ml",
      mag_val: 120,
    },
  ],
};

// ────────────────────────────────────────────────────────────────────
// 3. Main
// ────────────────────────────────────────────────────────────────────

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
  });

  console.log("▶ Login demo@azienda.srl …");
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (authErr) throw new Error(`Login fallito: ${authErr.message}`);
  if (!auth.user) throw new Error("Login ok ma user nullo");
  console.log(`  ✓ user ${auth.user.email} (${auth.user.id})`);

  // Recupera company_id tramite profile
  console.log("▶ Risolvo company_id …");
  const { data: profile, error: profErr } = await sb
    .from("profiles")
    .select("company_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profErr) throw new Error(`profiles fallita: ${profErr.message}`);
  if (!profile?.company_id) throw new Error("Demo user non ha company_id nel profile.");
  const companyId = profile.company_id as string;
  console.log(`  ✓ company_id=${companyId}`);

  // ── 3.1 Macrocategoria ──────────────────────────────────────────
  console.log("▶ Macrocategoria 'INFISSI WND' …");
  const macroId = await ensureMacrocategoria(sb, companyId, "INFISSI WND", {
    descrizione: "Listino fornitore WND — finestre e porte-balcone in PVC",
  });
  console.log(`  ✓ ${macroId}`);

  // ── 3.2 Categorie ───────────────────────────────────────────────
  console.log("▶ Categoria 'FINESTRA 1 ANTA' …");
  const catFinestraId = await ensureCategoria(sb, companyId, "FINESTRA 1 ANTA", macroId);
  console.log(`  ✓ ${catFinestraId}`);

  console.log("▶ Categoria 'PORTA BALCONE 1 ANTA' …");
  const catPortaId = await ensureCategoria(sb, companyId, "PORTA BALCONE 1 ANTA", macroId);
  console.log(`  ✓ ${catPortaId}`);

  // ── 3.3 Famiglia FINESTRA 1 ANTA ────────────────────────────────
  console.log("▶ Famiglia 'COSTRUZIONE 2 IT — FINESTRA 1 ANTA' …");
  const famFinestra = await ensureFamily(sb, companyId, {
    nome: "COSTRUZIONE 2 IT — FINESTRA 1 ANTA",
    categoria_id: catFinestraId,
    descrizione:
      "Listino WND — profili Square Plus / Konfortline / Square / Etrum. " +
      "Ravia +8%, Ravia Pro +18%. Telaio R65/Z40/Z15 +5%. " +
      "Prezzi in griglia sono ACQUISTO della riga base del listino fornitore. " +
      "Dal 01.01.2026 aggiungere il 5% ai prezzi.",
    modalita_prezzo_base: "griglia",
    prezzo_base_mode: "acquisto_markup",
    markup_tipo: "percentuale",
    markup_valore: MARKUP_PERCENT,
  });
  console.log(`  ✓ ${famFinestra}`);

  // Assi Finestra
  await ensureAxesFor(sb, companyId, famFinestra, [ASSE_PROFILO, ASSE_TELAIO]);

  // Griglia Finestra
  const nFinestra = await replaceGrid(sb, companyId, famFinestra, GRID_FINESTRA);
  console.log(`  ✓ griglia Finestra: ${nFinestra} celle`);

  // ── 3.4 Famiglia PORTA BALCONE 1 ANTA ───────────────────────────
  console.log("▶ Famiglia 'COSTRUZIONE 3 IT — PORTA BALCONE 1 ANTA' …");
  const famPorta = await ensureFamily(sb, companyId, {
    nome: "COSTRUZIONE 3 IT — PORTA BALCONE 1 ANTA",
    categoria_id: catPortaId,
    descrizione:
      "Listino WND — profili Square Plus / Konfortline / Square / Etrum. " +
      "Ravia +8%, Ravia Pro +18%. Telaio R65/Z40/Z15 +5%. " +
      "Soglia ribassata: 66 €/ml (Square/Konfortline/Sq+) o 120 €/ml (Ravia/Ravia Pro). " +
      "Prezzi in griglia sono ACQUISTO della riga base del listino fornitore. " +
      "Dal 01.01.2026 aggiungere il 5% ai prezzi.",
    modalita_prezzo_base: "griglia",
    prezzo_base_mode: "acquisto_markup",
    markup_tipo: "percentuale",
    markup_valore: MARKUP_PERCENT,
  });
  console.log(`  ✓ ${famPorta}`);

  // Assi Porta balcone (Profilo + Telaio + Soglia)
  await ensureAxesFor(sb, companyId, famPorta, [ASSE_PROFILO, ASSE_TELAIO, ASSE_SOGLIA]);

  // Griglia Porta balcone
  const nPorta = await replaceGrid(sb, companyId, famPorta, GRID_PORTA_BALCONE);
  console.log(`  ✓ griglia Porta balcone: ${nPorta} celle`);

  console.log("\n✅ Import completato.\n");
  console.log(`   Finestra 1 anta: ${famFinestra}`);
  console.log(`   Porta balcone 1 anta: ${famPorta}`);
}

// ────────────────────────────────────────────────────────────────────
// 4. Helpers
// ────────────────────────────────────────────────────────────────────

async function ensureMacrocategoria(
  sb: ReturnType<typeof createClient>,
  companyId: string,
  nome: string,
  extras: { descrizione?: string } = {}
): Promise<string> {
  const { data: existing } = await sb
    .from("listino_macrocategorie")
    .select("id")
    .eq("company_id", companyId)
    .eq("nome", nome)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await sb
    .from("listino_macrocategorie")
    .insert({
      company_id: companyId,
      nome,
      descrizione: extras.descrizione ?? null,
      attivo: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(`ensureMacrocategoria: ${error.message}`);
  return data.id as string;
}

async function ensureCategoria(
  sb: ReturnType<typeof createClient>,
  companyId: string,
  nome: string,
  macrocategoria_id: string
): Promise<string> {
  const { data: existing } = await sb
    .from("listino_categorie")
    .select("id")
    .eq("company_id", companyId)
    .eq("nome", nome)
    .maybeSingle();
  if (existing?.id) {
    // aggiorna macrocategoria_id se non allineata
    await sb
      .from("listino_categorie")
      .update({ macrocategoria_id })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await sb
    .from("listino_categorie")
    .insert({
      company_id: companyId,
      nome,
      macrocategoria_id,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(`ensureCategoria: ${error.message}`);
  return data.id as string;
}

async function ensureFamily(
  sb: ReturnType<typeof createClient>,
  companyId: string,
  payload: {
    nome: string;
    categoria_id: string;
    descrizione: string;
    modalita_prezzo_base: "griglia" | "pz" | "mq" | "misura_libera";
    prezzo_base_mode: "vendita" | "acquisto_markup";
    markup_tipo: "none" | "percentuale" | "fisso_pz";
    markup_valore: number;
  }
): Promise<string> {
  const { data: existing } = await sb
    .from("article_families")
    .select("id")
    .eq("company_id", companyId)
    .eq("nome", payload.nome)
    .maybeSingle();

  if (existing?.id) {
    // rifresca payload (update)
    const { error } = await sb
      .from("article_families")
      .update({
        categoria_id: payload.categoria_id,
        descrizione: payload.descrizione,
        modalita_prezzo_base: payload.modalita_prezzo_base,
        prezzo_base_mode: payload.prezzo_base_mode,
        markup_tipo: payload.markup_tipo,
        markup_valore: payload.markup_valore,
      })
      .eq("id", existing.id);
    if (error) throw new Error(`ensureFamily update: ${error.message}`);
    return existing.id as string;
  }

  const { data, error } = await sb
    .from("article_families")
    .insert({
      company_id: companyId,
      vertical: "serramentista",
      categoria_id: payload.categoria_id,
      nome: payload.nome,
      descrizione: payload.descrizione,
      modalita_prezzo_base: payload.modalita_prezzo_base,
      prezzo_base_mode: payload.prezzo_base_mode,
      markup_tipo: payload.markup_tipo,
      markup_valore: payload.markup_valore,
      unit_of_measure: "pz",
      attivo: true,
      griglia_asse_x_label: "Larghezza (mm)",
      griglia_asse_y_label: "Altezza (mm)",
    })
    .select("id")
    .single();
  if (error) throw new Error(`ensureFamily insert: ${error.message}`);
  return data.id as string;
}

async function ensureAxesFor(
  sb: ReturnType<typeof createClient>,
  companyId: string,
  familyId: string,
  axes: Array<{
    codice: string;
    nome: string;
    tipo: "discrete" | "boolean";
    values: Array<{
      valore: string;
      label: string;
      mag_tipo: string;
      mag_val: number;
      is_default?: boolean;
    }>;
  }>
) {
  for (const ax of axes) {
    // 1. ensure axis
    let axisId: string;
    const { data: existing } = await sb
      .from("article_family_axes")
      .select("id")
      .eq("family_id", familyId)
      .eq("codice", ax.codice)
      .maybeSingle();

    if (existing?.id) {
      axisId = existing.id as string;
      // Cancella i valori vecchi per rifare pulito (così lo script è rigiocabile)
      await sb.from("article_family_axis_values").delete().eq("axis_id", axisId);
    } else {
      const { data: ins, error } = await sb
        .from("article_family_axes")
        .insert({
          family_id: familyId,
          company_id: companyId,
          codice: ax.codice,
          nome: ax.nome,
          tipo: ax.tipo,
          sort_order: 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(`ensureAxis ${ax.codice}: ${error.message}`);
      axisId = ins.id as string;
    }

    // 2. values
    const rows = ax.values.map((v, i) => ({
      axis_id: axisId,
      company_id: companyId,
      valore: v.valore,
      label: v.label,
      maggiorazione_tipo: v.mag_tipo,
      maggiorazione_valore: v.mag_val,
      maggiorazione_acquisto: v.mag_val, // stessa maggiorazione su acquisto
      is_default: !!v.is_default,
      attivo: true,
      sort_order: i,
    }));
    const { error: vErr } = await sb.from("article_family_axis_values").insert(rows);
    if (vErr) throw new Error(`axis values ${ax.codice}: ${vErr.message}`);
    console.log(`    ✓ asse ${ax.codice}: ${rows.length} valori`);
  }
}

async function replaceGrid(
  sb: ReturnType<typeof createClient>,
  companyId: string,
  familyId: string,
  grid: Array<[number, Array<[number, number]>]>
): Promise<number> {
  // Wipe griglia attuale per la family
  await sb.from("listino_griglia").delete().eq("family_id", familyId);

  const rows: Array<Record<string, unknown>> = [];
  for (const [altezza, cells] of grid) {
    for (const [larghezza, prezzoAcquisto] of cells) {
      const prezzoVendita = Math.round(prezzoAcquisto * (1 + MARKUP_PERCENT / 100) * 100) / 100;
      rows.push({
        company_id: companyId,
        family_id: familyId,
        valore_x: larghezza,
        valore_y: altezza,
        prezzo_vendita: prezzoVendita,
        prezzo_acquisto: prezzoAcquisto,
      });
    }
  }

  // Insert a batch di 100 per restare sotto i limiti PostgREST
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb.from("listino_griglia").insert(chunk);
    if (error) throw new Error(`insert griglia chunk ${i}: ${error.message}`);
  }
  return rows.length;
}

main().catch((e) => {
  console.error("\n❌ FATAL:", e.message ?? e);
  process.exit(1);
});
