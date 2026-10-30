/**
 * Documenti del personale (bucket hr-documenti): il FILE lo apre chi può
 * gestire il personale (30/10/2026, trovato nel collaudo del POS).
 *
 * La policy hr_doc_storage_admin su storage.objects era FOR ALL e, oltre
 * all'amministratore e al super admin, ammetteva chiunque avesse il ruolo
 * company_staff: venditori, call center, chi segue solo i preventivi. Letti,
 * caricati, sostituiti e CANCELLATI documenti d'identità, idoneità sanitarie,
 * attestati, certificati medici e CV di tutta l'azienda. Provato in
 * produzione (transazione annullata, 37 controlli): lo staff senza «Personale
 * & HR» leggeva tutti i 1.022 file di Demo Azienda 2 e ne cancellava; lo staff
 * con la sola Sicurezza cantiere di Ke Bei faceva lo stesso sul suo.
 *
 * Ora il file segue la porta che le RIGHE di hr_documenti avevano già
 * (20280926051500): amministratore dell'azienda in cui si lavora, super admin,
 * oppure chi ha can_view_persone in quell'azienda.
 *
 * Tiene fermo:
 *   · la forma della policy (bucket, cartella dell'azienda, tre strade, USING
 *     e WITH CHECK uguali, niente company_staff) e che la lettura propria del
 *     lavoratore (hr_doc_storage_self_read) non si tocchi;
 *   · il nome del permesso esiste davvero: has_permission_for_company con una
 *     colonna che non c'è risponde «no» a tutti, in silenzio;
 *   · i file dell'app che nominano il bucket sono quelli di questo elenco, e
 *     dietro a ciascuno c'è lo stesso permesso (Personale & HR), il lavoratore
 *     stesso o il server. Un file nuovo qui va deciso: chi lo apre?
 *
 * Non copre le funzioni AI che scaricano con la chiave di servizio un bucket
 * scelto da chi chiama (ai-importa-condizioni, ai-document-analyzer): è un
 * lavoro a parte, descritto nella nota della sessione.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

// Le istruzioni, senza i commenti (che raccontano anche com'era prima).
const senzaCommenti = (s: string) => s.replace(/--.*$/gm, "");
// Spazi e a capo ridotti a uno, nessuno dentro le parentesi: si confronta il testo, non l'impaginazione.
const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();

const CARTELLA_MIGRAZIONI = resolve(RADICE, "supabase/migrations");
const NOME = readdirSync(CARTELLA_MIGRAZIONI).find((f) => f.endsWith("_hr_documenti_storage_solo_con_permesso.sql"));
const sql = NOME ? senzaCommenti(leggi(`supabase/migrations/${NOME}`)) : "";

/** Il testo di «create policy <nome> on storage.objects … ;» (le policy non hanno punti e virgola dentro). */
const policy = (nome: string) => {
  const m = sql.match(new RegExp(`create\\s+policy\\s+${nome}\\s+on\\s+storage\\.objects([\\s\\S]*?);`, "i"));
  expect(m, `create policy ${nome}`).not.toBeNull();
  return norm(m![1]);
};

const CONFINE =
  "bucket_id = 'hr-documenti' and (storage.foldername(name))[1] = ((select public.get_my_company_id()))::text";
const AMMINISTRATORE = "(select public.e_amministratore_di((select public.get_my_company_id())))";
const SUPER_ADMIN = "(select public.has_role((select auth.uid()), 'super_admin'::public.app_role))";
const PERMESSO_HR =
  "(select public.has_permission_for_company((select auth.uid()), 'can_view_persone', (select public.get_my_company_id())))";

describe("migrazione hr_documenti_storage_solo_con_permesso", () => {
  it("c'è, non aspetta i lock ed è rilanciabile", () => {
    expect(NOME, "file della migrazione").toBeDefined();
    expect(sql).toContain("set local lock_timeout = '3s';");
    expect(sql).toMatch(/drop policy if exists hr_doc_storage_admin on storage\.objects;/i);
  });

  it("una policy sola per tutti i comandi, solo per gli utenti autenticati", () => {
    const testo = policy("hr_doc_storage_admin");
    expect(testo.startsWith("for all to authenticated using (")).toBe(true);
    expect(testo).toContain(" with check (");
  });

  it("resta nel bucket e nella cartella dell'azienda in cui si lavora", () => {
    const [usa, controlla] = policy("hr_doc_storage_admin").split(" with check ");
    expect(usa).toContain(CONFINE);
    expect(controlla).toContain(CONFINE);
  });

  it("tre strade: amministratore di quell'azienda, super admin, permesso Personale & HR di quell'azienda", () => {
    const porta = `${AMMINISTRATORE} or ${SUPER_ADMIN} or ${PERMESSO_HR}`;
    const [usa, controlla] = policy("hr_doc_storage_admin").split(" with check ");
    expect(usa).toContain(`and (${porta})`);
    expect(controlla).toContain(`and (${porta})`);
  });

  it("leggere, caricare, sostituire e cancellare chiedono la stessa cosa (USING = WITH CHECK)", () => {
    const [usa, controlla] = policy("hr_doc_storage_admin").split(" with check ");
    expect(norm(usa.replace(/^for all to authenticated using /, ""))).toBe(norm(controlla));
  });

  it("il ruolo company_staff non c'è più, né il ruolo di amministratore nudo, né has_permission", () => {
    const testo = policy("hr_doc_storage_admin");
    expect(testo).not.toContain("company_staff");
    // Il ruolo company_admin non ha azienda: la porta dell'amministratore è e_amministratore_di.
    expect(testo).not.toContain("'company_admin'");
    // has_permission guarda l'azienda in cui si lavora per qualunque utente; qui serve quella del file.
    expect(testo).not.toMatch(/\bhas_permission\s*\(/);
  });

  it("non tocca la lettura del lavoratore sulla propria cartella", () => {
    expect(sql).not.toMatch(/create\s+policy\s+hr_doc_storage_self_read/i);
    expect(sql).not.toMatch(/drop\s+policy[^;]*hr_doc_storage_self_read/i);
    // la guardia si ferma se quella policy non c'è (il lavoratore non aprirebbe più i suoi documenti)
    expect(sql).toMatch(/p\.polname = 'hr_doc_storage_self_read'/);
  });

  it("si ferma se la policy di partenza non è quella censita", () => {
    expect(sql).toContain("non trovata: la migrazione va rivista");
    expect(sql).toContain("cambiata dopo il censimento: la migrazione va rivista");
  });

  it("controlla da sé il risultato", () => {
    expect(sql).toMatch(/v_testo ~ 'company_staff'/);
    expect(sql).toMatch(/v_testo !~ 'has_permission_for_company'/);
  });
});

describe("il permesso della policy esiste, ed è quello che l'amministratore vede", () => {
  it("can_view_persone è una colonna di staff_permissions", () => {
    const tipi = leggi("src/integrations/supabase/types.ts");
    const inizio = tipi.indexOf("      staff_permissions: {");
    expect(inizio, "tabella staff_permissions nei tipi").toBeGreaterThan(-1);
    const fine = tipi.indexOf("Relationships:", inizio);
    const tabella = tipi.slice(inizio, fine);
    expect(tabella).toMatch(/Row: \{[\s\S]*?\bcan_view_persone: boolean\b/);
  });

  it("nella finestra dei permessi si chiama «Personale & HR»", () => {
    const permessi = leggi("src/components/users/permissionsDefaults.ts");
    expect(permessi).toMatch(/label: "Personale & HR",\s*viewKey: "can_view_persone"/);
  });
});

describe("chi nell'app nomina il bucket hr-documenti", () => {
  const escludi = /(^|\/)(test|node_modules|__tests__)(\/|$)|\.(test|spec)\.[tj]sx?$|_test\.ts$|\/types\.ts$/;
  const elenca = (cartella: string): string[] => {
    const fuori: string[] = [];
    const cammina = (dir: string) => {
      for (const voce of readdirSync(dir, { withFileTypes: true })) {
        const percorso = resolve(dir, voce.name);
        const rel = percorso.replace(`${RADICE}/`, "");
        if (escludi.test(rel)) continue;
        if (voce.isDirectory()) cammina(percorso);
        else if (/\.(ts|tsx|mjs)$/.test(voce.name)) fuori.push(rel);
      }
    };
    cammina(resolve(RADICE, cartella));
    return fuori;
  };
  const chiNomina = (cartella: string) =>
    elenca(cartella)
      .filter((p) => leggi(p).includes("hr-documenti"))
      .sort();

  it("dal browser sono sette file soli, ciascuno con la sua porta", () => {
    // Un file nuovo qui: chi lo apre? Chi ha «Personale & HR» (come i primi
    // quattro), il lavoratore sulla propria cartella (CampoDocumenti), oppure
    // il server, che firma il link dopo aver controllato il permesso (POS).
    // Da qui un utente senza Personale & HR non legge più nulla: se serve a
    // un'altra funzione (Sicurezza, un nuovo modulo) il file passa da una
    // funzione del server con un controllo suo, come apri_originale_addetto.
    expect(chiNomina("src")).toEqual([
      "src/components/sicurezza/QualificheAddetto.tsx", // originali HR: solo con canViewPersone
      "src/hooks/useHrAssenze.ts", // certificati delle assenze: scheda del Personale
      "src/hooks/useHrDocumenti.ts", // carica, firma, cancella: scheda del Personale
      "src/hooks/useRiesameProprioPos.ts", // POS: l'originale lo firma il server, qui si controlla solo l'indirizzo
      "src/pages/azienda/ContenutiMultimediali.tsx", // Drive: parte dalle righe di hr_documenti (stessa porta)
      "src/pages/azienda/personale/tabs/TabCandidati.tsx", // CV dei candidati: Personale & HR
      "src/pages/campo/CampoDocumenti.tsx", // il lavoratore: la propria cartella (hr_doc_storage_self_read)
    ]);
  });

  it("dal server sono tre file soli, tutti con la chiave di servizio", () => {
    const funzioni = chiNomina("supabase/functions");
    expect(funzioni).toEqual([
      "supabase/functions/_shared/posPacchetto.ts", // tipo e controlli del pacchetto POS
      "supabase/functions/candidatura-submit/index.ts", // il CV dell'anonimo passa di qui
      "supabase/functions/genera-pos/index.ts", // apre l'originale formativo per il POS
    ]);
    // Il CV dell'anonimo e il link del POS non passano dalla policy: il client è quello di servizio.
    expect(leggi("supabase/functions/candidatura-submit/index.ts")).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(leggi("supabase/functions/genera-pos/index.ts")).toContain("supabaseAdmin: db } = await requireAuth(");
  });

  it("chi carica o firma file HR da useHrDocumenti è la scheda del Personale", () => {
    const usano = elenca("src")
      .filter((p) => /\b(uploadHrFile|getHrFileUrl)\b/.test(leggi(p)) && !p.endsWith("useHrDocumenti.ts"))
      .sort();
    expect(usano).toEqual([
      "src/components/hr/HrAssenzeSection.tsx",
      "src/components/hr/HrDocumentiSection.tsx",
      "src/pages/azienda/personale/tabs/TabCandidati.tsx",
    ]);
    // Le due sezioni vivono dentro la scheda profilo o la scheda Documenti del Personale.
    const montano = (nome: string) =>
      elenca("src")
        .filter((p) => new RegExp(`import\\s*\\{[^}]*\\b${nome}\\b[^}]*\\}\\s*from`).test(leggi(p)))
        .sort();
    expect(montano("HrDocumentiSection")).toEqual([
      "src/components/hr/HrProfiloSheet.tsx",
      "src/pages/azienda/personale/tabs/TabDocumenti.tsx",
    ]);
    expect(montano("HrAssenzeSection")).toEqual(["src/components/hr/HrProfiloSheet.tsx"]);
    expect(montano("HrProfiloSheet")).toEqual([
      "src/pages/azienda/personale/tabs/TabOrganigramma.tsx",
      "src/pages/azienda/personale/tabs/TabProfili.tsx",
    ]);
  });

  it("la pagina Personale chiede lo stesso permesso del database", () => {
    expect(leggi("src/routes/companyRoutes.tsx")).toMatch(
      /path="personale"\s+element=\{withCompanyPermission\("canViewPersone"/,
    );
    expect(leggi("src/components/hr/HrDocumentiSection.tsx")).toMatch(
      /const canEdit = [^;]*\(permissions\.isAdmin \|\| permissions\.canViewPersone\)/,
    );
    expect(leggi("src/pages/azienda/personale/tabs/TabCandidati.tsx")).toContain(
      "!(p.isAdmin || p.canViewPersone)) return <CandidatiSolaLettura />",
    );
  });

  it("Sicurezza apre l'originale HR solo con Personale & HR, o dal server", () => {
    const qualifiche = leggi("src/components/sicurezza/QualificheAddetto.tsx");
    expect(norm(qualifiche)).toMatch(
      /const leggeOriginali = tipo === "hr" \? p\.canViewPersone : p\.canViewSicurezzaCantiere;/,
    );
    const riesame = leggi("src/hooks/useRiesameProprioPos.ts");
    expect(riesame).toContain('azione: "apri_originale_addetto"');
    // dal POS il browser non tocca lo storage: riceve l'indirizzo firmato dal server
    expect(riesame).not.toMatch(/\.storage\b/);
  });

  it("il lavoratore legge, non carica né cancella", () => {
    const campo = leggi("src/pages/campo/CampoDocumenti.tsx");
    expect(campo).toMatch(/\.createSignedUrl\(/);
    expect(campo).not.toMatch(/\.(upload|remove|move|copy)\(/);
    expect(campo).toContain('.eq("hr_profilo_id", profiloId)');
  });

  it("l'originale del POS lo apre una funzione chiusa agli utenti", () => {
    const migrazione = leggi("supabase/migrations/20281026224900_pos_requisiti_addetti_emissione.sql");
    expect(migrazione).toMatch(
      /revoke all on function public\.pos_originale_addetto_per_autore\([^)]*\) from public,anon,authenticated;/,
    );
    expect(migrazione).toMatch(
      /grant execute on function public\.pos_originale_addetto_per_autore\([^)]*\) to service_role;/,
    );
    const server = leggi("supabase/functions/genera-pos/index.ts");
    expect(server).toContain('db.rpc("pos_originale_addetto_per_autore"');
  });
});
