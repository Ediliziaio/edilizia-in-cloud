#!/usr/bin/env node
/**
 * Genera la prova degli accessi: un blocco DO da lanciare con execute_sql
 * (MCP Supabase) che conta cosa vede ogni tipo di utente e, con --scritture,
 * cosa può modificare e cancellare. Finisce con RAISE EXCEPTION: non resta
 * scritto niente, né la preparazione né le prove. L'esito è nel messaggio
 * d'errore «ESITO (tutto annullato)».
 *
 * Gli ID si scelgono al momento con una query (vedi
 * .claude/agents/guardiano-accessi.md) e si passano qui: il repository è
 * pubblico, nessun ID vero va scritto nei file.
 *
 * Uso:
 *   node scripts/accessi/prova.mjs --azienda <uuid> --tabelle t1,t2[,…]
 *        [--membro <uuid>]
 *        [--estraneo <uuid> [--stati nessuno,attivo,sospeso,invitato,scaduto]
 *                           [--ruolo-accesso company_admin]]
 *        [--cliente <uuid>] [--super <uuid>] [--anon] [--bloccato <uuid>]
 *        [--scritture]
 *
 *   --azienda    l'azienda di cui si contano le righe
 *   --membro     un utente dell'azienda: deve vedere
 *   --estraneo   un utente di un'altra azienda SENZA accessi multi-azienda a
 *                questa: la prova gli crea l'accesso in ogni stato
 *   --cliente    un cliente esterno dell'azienda (solo ruolo customer): la
 *                prova accende il portale e lo sblocca, altrimenti lo
 *                fermerebbe la RESTRICTIVE per il motivo sbagliato
 *   --super      un super admin: deve vedere
 *   --anon       prova anche come visitatore anonimo
 *   --bloccato   un utente dell'azienda da bloccare durante la prova (per
 *                ultimo, così non cambia le altre prove)
 *   --scritture  per ogni tabella anche «modifica» e «cancella» su UNA riga
 *                visibile (annullate); mai cancellazioni su companies,
 *                profiles, user_roles, multi_company_access (le cascate
 *                toccherebbero mezzo database)
 *   --limite N   conta al massimo N righe per tabella (predefinito 10000:
 *                su una tabella grande con funzioni per riga il conteggio
 *                pieno può durare minuti)
 *
 * Ogni casella è «righe viste» oppure, con --scritture, «righe/modifica/
 * cancella» dove modifica e cancella valgono 1 (può) o 0 (non può), «–» se
 * non provate; «neg» = permesso negato, «err» = errore (elencato sotto),
 * «N+» = arrivato al limite.
 */

const argomenti = process.argv.slice(2);
function esci(messaggio) {
  console.error(messaggio);
  process.exit(2);
}
// Un'opzione senza valore (in fondo, o seguita da un'altra opzione) è un
// errore: ignorarla toglierebbe uno scenario dalla prova senza dirlo.
const valore = (nome) => {
  const i = argomenti.indexOf(nome);
  if (i < 0) return undefined;
  const v = argomenti[i + 1];
  if (v === undefined || v.startsWith("--")) esci(`${nome} vuole un valore.`);
  return v;
};
const presente = (nome) => argomenti.includes(nome);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOME = /^[a-z_][a-z0-9_]*$/;
const STATI = ["nessuno", "attivo", "sospeso", "invitato", "scaduto"];
const RUOLI_ACCESSO = ["company_admin", "company_staff", "salesperson", "call_center", "employee", "subcontractor"];

function uuid(nome, obbligatorio = false) {
  const v = valore(nome);
  if (v === undefined) {
    if (obbligatorio) esci(`Manca ${nome}.`);
    return undefined;
  }
  if (!UUID.test(v)) esci(`${nome} non è un uuid: ${v}`);
  return v.toLowerCase();
}

const azienda = uuid("--azienda", true);
const tabelle = (valore("--tabelle") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
if (tabelle.length === 0) esci("Manca --tabelle t1,t2,…");
for (const t of tabelle) if (!NOME.test(t)) esci(`Nome di tabella non valido: ${t}`);

const stati = (valore("--stati") ?? STATI.join(",")).split(",").map((s) => s.trim());
for (const s of stati) if (!STATI.includes(s)) esci(`Stato sconosciuto: ${s} (validi: ${STATI.join(", ")})`);
const ruoloAccesso = valore("--ruolo-accesso") ?? "company_admin";
if (!RUOLI_ACCESSO.includes(ruoloAccesso)) esci(`Ruolo d'accesso sconosciuto: ${ruoloAccesso}`);

// Gli scenari, nell'ordine in cui girano. Il bloccato va per ultimo: il
// blocco resta fino alla fine della prova.
const scenari = [];
const membro = uuid("--membro");
if (membro) scenari.push({ etichetta: "membro", tipo: "membro", utente: membro });
const estraneo = uuid("--estraneo");
if (estraneo) {
  for (const s of stati) scenari.push({ etichetta: `multi ${s}`, tipo: "estraneo", utente: estraneo, stato: s });
}
const cliente = uuid("--cliente");
if (cliente) scenari.push({ etichetta: "cliente esterno", tipo: "cliente", utente: cliente });
const superAdmin = uuid("--super");
if (superAdmin) scenari.push({ etichetta: "super admin", tipo: "super", utente: superAdmin });
if (presente("--anon")) scenari.push({ etichetta: "anonimo", tipo: "anon", utente: null });
const bloccato = uuid("--bloccato");
if (bloccato) scenari.push({ etichetta: "bloccato", tipo: "bloccato", utente: bloccato });
if (scenari.length === 0) esci("Nessuno scenario: indica almeno uno tra --membro, --estraneo, --cliente, --super, --anon, --bloccato.");

const scritture = presente("--scritture");
const limite = Number(valore("--limite") ?? 10000);
if (!Number.isInteger(limite) || limite < 1) esci("--limite deve essere un intero positivo.");
const letterale = (s) => `'${String(s).replace(/'/g, "''")}'`;

const sql = `-- Prova degli accessi generata da scripts/accessi/prova.mjs: finisce con
-- RAISE EXCEPTION, quindi non resta scritto niente. I timeout stanno fuori dal
-- DO: impostati dentro non fermano il blocco che è già partito.
set local lock_timeout = '3s';
set local statement_timeout = '180s';
do $prova$
declare
  azienda constant uuid := ${letterale(azienda)};
  tabelle constant text[] := array[${tabelle.map(letterale).join(", ")}];
  scenari constant jsonb := ${letterale(JSON.stringify(scenari))};
  ruolo_accesso constant text := ${letterale(ruoloAccesso)};
  con_scritture constant boolean := ${scritture};
  limite constant integer := ${limite};
  mai_cancellare constant text[] := array['companies', 'profiles', 'user_roles', 'multi_company_access'];
  s record;
  tab text;
  filtro text;
  scrivibile boolean;
  n bigint;
  letti text;
  modificati text;
  cancellati text;
  risultati jsonb := '{}';
  intestazione text := '';
  riga text;
  cella text;
  esiti text;
  errori text := '';
begin
  for s in select * from jsonb_to_recordset(scenari) as x(etichetta text, tipo text, utente uuid, stato text) loop
    -- Preparazione come postgres. Claims '{}' e non '': i trigger fanno ::json.
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '{}', true);
    if s.tipo = 'estraneo' then
      delete from public.multi_company_access where user_id = s.utente and company_id = azienda;
      if s.stato <> 'nessuno' then
        insert into public.multi_company_access (user_id, company_id, access_role, status, expires_at)
        values (s.utente, azienda, ruolo_accesso,
                case s.stato when 'sospeso' then 'suspended' when 'invitato' then 'invited' else 'active' end,
                case s.stato when 'scaduto' then now() - interval '1 day' end);
      end if;
    elsif s.tipo = 'cliente' then
      update public.companies set customer_portal_enabled = true where id = azienda;
      update public.profiles set is_blocked = false, portal_disabled = false where id = s.utente;
    elsif s.tipo = 'bloccato' then
      update public.profiles set is_blocked = true where id = s.utente;
    end if;

    if s.tipo = 'anon' then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      perform set_config('role', 'anon', true);
    else
      perform set_config('request.jwt.claims', json_build_object('sub', s.utente, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
    end if;
    intestazione := intestazione || ' | ' || s.etichetta;

    foreach tab in array tabelle loop
      letti := '?';
      modificati := '–';
      cancellati := '–';
      scrivibile := tab = 'companies' or exists (
        select 1 from pg_catalog.pg_attribute a
         where a.attrelid = ('public.' || tab)::regclass and a.attname = 'company_id' and not a.attisdropped);
      filtro := case when tab = 'companies' then ' where id = $1'
                     when scrivibile then ' where company_id = $1'
                     else '' end;
      begin
        execute 'select count(*) from (select 1 from public.' || quote_ident(tab) || filtro
             || ' limit ' || limite || ') x' into n using azienda;
        letti := n::text || case when n >= limite then '+' else '' end;
      exception
        when insufficient_privilege then letti := 'neg';
        when others then
          letti := 'err';
          errori := errori || E'\\n  ' || s.etichetta || ' / ' || tab || ': ' || sqlerrm;
      end;
      cella := letti;

      if con_scritture and scrivibile then
        begin
          -- Una riga sola, modifica che non cambia niente: basta a sapere se la
          -- policy lascia scrivere, senza bloccare migliaia di righe.
          execute 'update public.' || quote_ident(tab)
               || case when tab = 'companies' then ' set id = id' else ' set company_id = company_id' end
               || ' where ctid = (select ctid from public.' || quote_ident(tab) || filtro || ' limit 1)'
            using azienda;
          get diagnostics n = row_count;
          modificati := n::text;
          raise exception using errcode = 'P0001', message = 'annulla';
        exception
          -- Anche un trigger che fa RAISE EXCEPTION senza codice dà P0001:
          -- solo il nostro «annulla» vuol dire «riuscita, poi annullata».
          when sqlstate 'P0001' then
            if sqlerrm <> 'annulla' then
              modificati := 'err';
              errori := errori || E'\\n  ' || s.etichetta || ' / ' || tab || ' (modifica, trigger): ' || sqlerrm;
            end if;
          when insufficient_privilege then modificati := 'neg';
          when others then
            modificati := 'err';
            errori := errori || E'\\n  ' || s.etichetta || ' / ' || tab || ' (modifica): ' || sqlerrm;
        end;
        if tab = any (mai_cancellare) then
          cancellati := '–';
        else
          begin
            execute 'delete from public.' || quote_ident(tab)
                 || ' where ctid = (select ctid from public.' || quote_ident(tab) || filtro || ' limit 1)'
              using azienda;
            get diagnostics n = row_count;
            cancellati := n::text;
            raise exception using errcode = 'P0001', message = 'annulla';
          exception
            when sqlstate 'P0001' then
              if sqlerrm <> 'annulla' then
                cancellati := 'err';
                errori := errori || E'\\n  ' || s.etichetta || ' / ' || tab || ' (cancella, trigger): ' || sqlerrm;
              end if;
            when insufficient_privilege then cancellati := 'neg';
            when others then
              cancellati := 'err';
              errori := errori || E'\\n  ' || s.etichetta || ' / ' || tab || ' (cancella): ' || sqlerrm;
          end;
        end if;
        cella := letti || '/' || modificati || '/' || cancellati;
      end if;

      risultati := jsonb_set(risultati, array[tab], coalesce(risultati -> tab, '[]'::jsonb) || to_jsonb(coalesce(cella, '?')));
    end loop;
  end loop;

  perform set_config('role', 'postgres', true);
  esiti := rpad('tabella', 34) || intestazione;
  foreach tab in array tabelle loop
    riga := rpad(tab, 34);
    for cella in select jsonb_array_elements_text(risultati -> tab) loop
      riga := riga || ' | ' || cella;
    end loop;
    esiti := esiti || E'\\n' || riga;
  end loop;
  raise exception '%', E'ESITO (tutto annullato)\\n' || esiti
    || case when errori <> '' then E'\\nERRORI:' || errori else '' end;
end
$prova$;
`;

process.stdout.write(sql);
