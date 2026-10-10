/**
 * Ogni interruttore dell'editor dei permessi ha qualcuno che lo legge (09/10/2026).
 *
 * permissionsRegistryParity.test.ts controlla che ogni permesso sia CARICATO a
 * runtime (STAFF_PERMISSIONS_SELECT_KEYS), non che qualcuno lo LEGGA: per questo
 * cinque interruttori che non facevano niente passavano tutti i controlli:
 * Approva Ordini (8 persone in 3 aziende lo avevano acceso), Gestione Articoli
 * (18 in 8), Interventi (17 in 7), Attività (71 in 13) e «Modifica» di Sconti
 * (1 in 1). Chi li accende crede di dare (o togliere) un potere.
 *
 * Qui il test cerca il lettore di ogni permesso nei sorgenti dell'app e delle
 * edge function, fuori dai registri dei permessi. Un permesso nuovo senza
 * lettore fa fallire il test; uno dei cinque che trova un lettore dice di
 * rimetterlo nell'editor.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSION_SECTIONS,
  DEFAULT_PERMISSIONS,
  PERMESSI_SENZA_EFFETTO,
  ROLE_PRESETS,
  TEAM_VISIBILITY_SECTIONS,
  buildStaffPermissionsUpdate,
  conservaPermessiNascosti,
} from "@/components/users/permissionsDefaults";
import { STAFF_PERMISSIONS_SELECT_KEYS } from "@/hooks/usePermissions";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";

const ROOT = join(__dirname, "../../..");

/** I file che ELENCANO i permessi: leggerli lì non è «leggere» il permesso. */
const REGISTRI = [
  "src/components/users/permissionsDefaults.ts",
  "src/hooks/usePermissions.ts",
  "src/components/users/PermissionsDialog.tsx",
  "src/components/users/CreateUserWizard.tsx",
  "src/components/users/UserRolesPermissionsTab.tsx",
  "src/components/users/StaffUserDialog.tsx",
  "src/pages/azienda/Employees.tsx",
  "src/components/settings/SalespeopleConfig.tsx",
  "src/components/settings/AccessGovernancePanel.tsx",
  "src/components/admin/settings/CreatePlatformUserDialog.tsx",
  "src/components/admin/company/CompanyTeamTab.tsx",
  "src/pages/admin/adminConstants.ts",
  "supabase/functions/_shared/staffPermissionsDefaults.ts",
  "supabase/functions/_shared/callcenterPiattaforma.ts",
];

function sorgenti(cartella: string, estensioni: string[]): string[] {
  const radice = join(ROOT, cartella);
  if (!existsSync(radice)) return [];
  const trovati: string[] = [];
  const cammina = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const percorso = join(dir, nome);
      if (statSync(percorso).isDirectory()) {
        if (["node_modules", "test", "__tests__", "integrations"].includes(nome)) continue;
        cammina(percorso);
      } else if (estensioni.some((e) => nome.endsWith(e)) && !/\.(test|spec)\./.test(nome)) {
        const rel = relative(ROOT, percorso);
        if (!REGISTRI.includes(rel)) trovati.push(rel);
      }
    }
  };
  cammina(radice);
  return trovati;
}

const FILE_APP = sorgenti("src", [".ts", ".tsx"]).map((f) => ({ f, testo: readFileSync(join(ROOT, f), "utf8") }));
const FILE_EDGE = sorgenti("supabase/functions", [".ts"]).map((f) => ({ f, testo: readFileSync(join(ROOT, f), "utf8") }));

const camel = (chiave: string) => chiave.split("_").map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");

/** I file che leggono il permesso: nell'app come `canViewX` o come colonna, nelle edge function come colonna. */
function lettori(chiave: string): string[] {
  const nell_app = new RegExp(`\\b(?:${camel(chiave)}|${chiave})\\b`);
  const nelle_edge = new RegExp(`\\b${chiave}\\b`);
  return [
    ...FILE_APP.filter(({ testo }) => nell_app.test(testo)).map(({ f }) => f),
    ...FILE_EDGE.filter(({ testo }) => nelle_edge.test(testo)).map(({ f }) => f),
  ].sort();
}

const chiaviDegliEditor = (() => {
  const chiavi = new Set<string>();
  for (const s of [...ALL_PERMISSION_SECTIONS, ...TEAM_VISIBILITY_SECTIONS]) {
    chiavi.add(s.viewKey);
    if (s.editKey) chiavi.add(s.editKey);
  }
  return [...chiavi].sort();
})();

describe("il test sa leggere", () => {
  it("trova i lettori di un permesso vero e nessuno per uno inventato", () => {
    expect(lettori("can_view_costs").length).toBeGreaterThan(5);
    expect(lettori("can_view_cosa_che_non_esiste")).toEqual([]);
    // I registri non contano come lettori.
    expect(lettori("can_approve_orders").some((f) => REGISTRI.includes(f))).toBe(false);
  });

  it("legge le cartelle (non gira a vuoto)", () => {
    expect(FILE_APP.length).toBeGreaterThan(500);
    expect(FILE_EDGE.length).toBeGreaterThan(100);
    expect(chiaviDegliEditor.length).toBeGreaterThan(60);
  });
});

describe("ogni interruttore dell'editor ha un lettore", () => {
  it.each(chiaviDegliEditor)("%s", (chiave) => {
    expect(
      lettori(chiave),
      `${chiave} è nell'editor ma nessun codice lo legge: togli l'interruttore (aggiungilo a PERMESSI_SENZA_EFFETTO) o costruisci quello che promette`,
    ).not.toEqual([]);
  });
});

describe("i permessi senza effetto non sono più nell'editor, ma restano", () => {
  /** I lettori ammessi di un permesso nascosto, col motivo: oltre questi, ha un effetto e va rimesso nell'editor. */
  const LETTORI_AMMESSI: Record<string, string[]> = {
    can_view_interventi: ["src/components/layouts/MobileBottomNav.tsx"], // sceglie solo la barra in basso sul telefono
  };

  it("sono i cinque trovati nel controllo, nessuno di più", () => {
    expect(PERMESSI_SENZA_EFFETTO.map((p) => p.chiave).sort()).toEqual([
      "can_approve_orders", "can_edit_settings_scontistica", "can_manage_warehouse_items",
      "can_view_interventi", "can_view_marketing_activities",
    ]);
  });

  it.each(PERMESSI_SENZA_EFFETTO.map((p) => [p.chiave, p.etichetta] as const))("%s (%s) non è nell'editor", (chiave) => {
    expect(chiaviDegliEditor).not.toContain(chiave);
  });

  it.each(PERMESSI_SENZA_EFFETTO.map((p) => p.chiave))("%s: la colonna, il caricamento a runtime e il default restano", (chiave) => {
    expect(Object.keys(DEFAULT_PERMISSIONS)).toContain(chiave);
    expect(STAFF_PERMISSIONS_SELECT_KEYS as readonly string[]).toContain(chiave);
  });

  it.each(PERMESSI_SENZA_EFFETTO.map((p) => p.chiave))("%s: nessuno lo legge (oltre a quanto ammesso)", (chiave) => {
    const ammessi = LETTORI_AMMESSI[chiave] ?? [];
    const extra = lettori(chiave).filter((f) => !ammessi.includes(f));
    expect(
      extra,
      `${chiave} ha un lettore (${extra.join(", ")}): ora fa qualcosa. Rimettilo nell'editor e toglilo da PERMESSI_SENZA_EFFETTO`,
    ).toEqual([]);
  });

  it("i preset dei ruoli possono continuare ad averli (non fanno male)", () => {
    expect(ROLE_PRESETS.company_staff.can_manage_warehouse_items).toBe(true);
    expect(ROLE_PRESETS.salesperson.can_view_marketing_activities).toBe(true);
  });
});

describe("«Tutti», «Nessuno» e il salvataggio non toccano i permessi nascosti", () => {
  const conTuttiNascostiAcceso: StaffPermissions = {
    ...DEFAULT_PERMISSIONS,
    can_approve_orders: true,
    can_manage_warehouse_items: true,
    can_view_interventi: true,
    can_view_marketing_activities: true,
    can_edit_settings_scontistica: true,
    can_view_settings_scontistica: true,
  };

  it("ricostruire l'elenco dai default non li azzera", () => {
    const dopoNessuno = conservaPermessiNascosti(conTuttiNascostiAcceso, { ...DEFAULT_PERMISSIONS });
    for (const { chiave } of PERMESSI_SENZA_EFFETTO) expect(dopoNessuno[chiave], chiave).toBe(true);
    // E il resto resta come l'elenco nuovo.
    expect(dopoNessuno.can_view_orders).toBe(false);
  });

  it("e non ne accende quelli spenti", () => {
    const dopoTutti = conservaPermessiNascosti(DEFAULT_PERMISSIONS, { ...DEFAULT_PERMISSIONS, can_approve_orders: true, can_view_orders: true });
    expect(dopoTutti.can_approve_orders).toBe(false);
    expect(dopoTutti.can_view_orders).toBe(true);
  });

  it("al salvataggio i valori vecchi restano", () => {
    const salvati = buildStaffPermissionsUpdate(conTuttiNascostiAcceso);
    expect(salvati.can_approve_orders).toBe(true);
    expect(salvati.can_manage_warehouse_items).toBe(true);
    expect(salvati.can_view_interventi).toBe(true);
    expect(salvati.can_view_marketing_activities).toBe(true);
  });

  it("«Modifica» di Sconti vecchia non resta accesa da sola: si spegne se la persona non vede più Sconti", () => {
    const senzaVista = buildStaffPermissionsUpdate({ ...conTuttiNascostiAcceso, can_view_settings_scontistica: false });
    expect(senzaVista.can_edit_settings_scontistica).toBe(false);
    // e con essa l'aggregato che dava potere sull'azienda
    expect(senzaVista.can_edit_settings).toBe(false);
    // finché la vista c'è, il valore vecchio resta (nessun dato cambia)
    expect(buildStaffPermissionsUpdate(conTuttiNascostiAcceso).can_edit_settings_scontistica).toBe(true);
  });
});
