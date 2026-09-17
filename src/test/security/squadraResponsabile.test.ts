/**
 * Responsabile di squadra (17/09/2026). Nel Bagno Group Katia, commerciale con
 * «Solo i propri», deve vedere anche opportunità e calendari di Camilla,
 * Valentina, Alice e Leonardo. Con «Solo i propri» si vedeva solo ciò che è
 * assegnato a sé, senza tutta l'azienda: in mezzo non c'era niente, e la
 * colonna teams.leader_id non contava nulla.
 *
 * Ora il responsabile di una squadra vede e lavora quello che è assegnato ai
 * membri: opportunità, contatti, note e attività, appuntamenti e calendari.
 * Si prova che:
 * - le policy riscritte restino quelle di prima con in più la condizione sui membri;
 * - check_staff_visibility risponda come prima a chi non guida squadre;
 * - l'app faccia scegliere il responsabile e assegnare gli appuntamenti ai membri.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

const nomeMigrazione = readdirSync(resolve(RADICE, "supabase/migrations")).find((f) =>
  f.endsWith("_squadra_responsabile_vede_membri.sql"),
);
const migrazione = nomeMigrazione ? leggi(`supabase/migrations/${nomeMigrazione}`) : "";

/** La definizione `create policy "<nome>" … ;` nella migrazione. */
function policy(nome: string): string {
  const inizio = migrazione.indexOf(`create policy "${nome}"`);
  if (inizio < 0) throw new Error(`policy ${nome} non trovata`);
  return migrazione.slice(inizio, migrazione.indexOf(";", inizio) + 1);
}

/** Il corpo di una funzione `create or replace function public.<nome>(` fino a $function$. */
function funzione(nome: string): string {
  const inizio = migrazione.indexOf(`create or replace function public.${nome}(`);
  if (inizio < 0) throw new Error(`funzione ${nome} non trovata`);
  const apertura = migrazione.indexOf("$function$", inizio);
  return migrazione.slice(inizio, migrazione.indexOf("$function$", apertura + 1) + "$function$".length);
}

describe("la migrazione", () => {
  it("esiste e riscrive con lock_timeout", () => {
    expect(nomeMigrazione).toBeDefined();
    expect(migrazione).toContain("set local lock_timeout = '3s';");
  });

  it("membri_mie_squadre guarda l'utente collegato e l'azienda su cui lavora, e non è aperta ad anon", () => {
    const corpo = funzione("membri_mie_squadre");
    expect(corpo).toContain("security definer");
    expect(corpo).toContain("where t.leader_id = (select auth.uid())");
    expect(corpo).toContain("and t.company_id = public.get_effective_company_id()");
    expect(migrazione).toContain("revoke all on function public.membri_mie_squadre() from public, anon;");
    expect(migrazione).toContain("grant execute on function public.membri_mie_squadre() to authenticated, service_role;");
  });

  it("check_staff_visibility aggiunge i membri e per tutti gli altri risponde come prima", () => {
    const corpo = funzione("check_staff_visibility");
    expect(corpo).toContain("IF public.chiamante_anonimo() THEN RETURN false; END IF;");
    expect(corpo).toContain("IF _only_assigned IS NULL OR _only_assigned = false THEN");
    expect(corpo).toContain("WHERE t.leader_id = _user_id");
    expect(corpo).toContain("AND tm.user_id = _assigned_to");
    // La risposta finale resta quella di prima: NULL se l'assegnatario è NULL.
    expect(corpo.trimEnd()).toMatch(/RETURN _assigned_to = _user_id;\nEND;\n\$function\$$/);
  });

  it("contatti_seguiti_da_me tiene i tre rami di prima e aggiunge quello dei membri", () => {
    const corpo = funzione("contatti_seguiti_da_me");
    expect(corpo).toContain("where o.assigned_to = (select auth.uid())");
    expect(corpo).toContain("where o.call_center_id = (select auth.uid())");
    expect(corpo).toContain("where o.follower_id = (select auth.uid())");
    expect(corpo).toContain("where o.assigned_to in (select unnest(public.membri_mie_squadre()))");
  });

  it.each([
    ["Staff can view opportunities if permitted", "can_view_marketing_opportunities", "assigned_to"],
    ["Staff can manage opportunities if permitted", "can_edit_marketing_opportunities", "assigned_to"],
    ["Staff can view marketing contacts if permitted", "can_view_marketing_contacts", "assigned_to"],
    ["Staff can manage marketing contacts if permitted", "can_edit_marketing_contacts", "assigned_to"],
    ["Staff can view opportunity notes if permitted", "can_view_marketing_opportunities", "created_by"],
    ["Staff can manage opportunity notes if permitted", "can_edit_marketing_opportunities", "created_by"],
    ["Staff can view contact notes if permitted", "can_view_marketing_contacts", "created_by"],
    ["Staff can manage contact notes if permitted", "can_edit_marketing_contacts", "created_by"],
    ["Staff can view contact activities if permitted", "can_view_marketing_contacts", "created_by"],
    ["Staff can manage contact activities if permitted", "can_edit_marketing_contacts", "created_by"],
  ])("%s: stesso permesso e stesso «Solo i propri», più i membri", (nome, permesso, colonna) => {
    const definizione = policy(nome);
    expect(migrazione).toContain(`drop policy if exists "${nome}"`);
    expect(definizione).toContain("to authenticated");
    expect(definizione).toContain(`aziende_con_permesso('${permesso}'::text)`);
    expect(definizione).toContain("(not (select solo_assegnati_attivo()))");
    expect(definizione).toContain(`(${colonna} = (select auth.uid()))`);
    expect(definizione).toContain(`(${colonna} in (select unnest(membri_mie_squadre())))`);
  });

  it("i contatti tengono chi li segue, e le opportunità il call center e chi le segue", () => {
    for (const nome of ["Staff can view marketing contacts if permitted", "Staff can manage marketing contacts if permitted"]) {
      expect(policy(nome)).toContain("(id in (select contatti_seguiti_da_me()))");
    }
    for (const nome of [
      "Staff can view opportunities if permitted",
      "Staff can manage opportunities if permitted",
      "Staff can view marketing contacts if permitted",
      "Staff can manage marketing contacts if permitted",
    ]) {
      expect(policy(nome)).toContain("(call_center_id = (select auth.uid()))");
      expect(policy(nome)).toContain("(follower_id = (select auth.uid()))");
    }
  });
});

describe("l'app", () => {
  it("nella pagina Squadre si sceglie il responsabile, e si salva", () => {
    const pagina = leggi("src/pages/azienda/settings/SettingsTeams.tsx");
    expect(pagina).toContain("<Label>Responsabile</Label>");
    expect(pagina.match(/leader_id: formLeader \|\| null/g)).toHaveLength(2);
    expect(pagina).toContain("setFormLeader(team.leader_id || \"\")");
  });

  it("il responsabile assegna gli appuntamenti anche ai membri della squadra", () => {
    const dialogo = leggi("src/components/appointments/AppointmentDialog.tsx");
    expect(dialogo).toContain("useMembriMieSquadre(open && onlyAssigned)");
    expect(dialogo).toContain("disabled={onlyAssigned && membriSquadra.length === 0}");
    expect(dialogo).toContain("const ammessi = new Set([user?.id, ...membriSquadra]);");
    expect(leggi("src/hooks/useMembriMieSquadre.ts")).toContain('supabase.rpc("membri_mie_squadre" as never)');
  });
});
