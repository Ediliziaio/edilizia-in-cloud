import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CollegaFatturaSalSubDialog, type ConfermaFatturaSalSub } from "@/components/subappaltatori/CollegaFatturaSalSubDialog";
import { fatturePerSalSub, type ContestoFattureSalSub, type FatturaContrattoSub } from "@/lib/subappaltatori/fattureSalContratto";

const uuid = (n: number) => `ce000080-0000-4000-8000-${String(n).padStart(12, "0")}`;
const azienda = uuid(1);
const ordine = uuid(2);
const codice = "DEMO-SUB-80MQ/S01";
const contratto = { id: uuid(3), company_id: azienda, numero_contratto: codice, importo_contrattuale: 2040, piva: "01234567890" };
const sal = [
  { id: uuid(4), company_id: azienda, contratto_id: contratto.id, numero_sal: 1, importo_lordo: 540, ritenuta_importo: 27, importo_netto: 513, stato: "verificato" },
  { id: uuid(5), company_id: azienda, contratto_id: contratto.id, numero_sal: 2, importo_lordo: 1500, ritenuta_importo: 75, importo_netto: 1425, stato: "verificato" },
];
const fatture: FatturaContrattoSub[] = [
  { id: uuid(6), company_id: azienda, cedente_piva: "IT01234567890", numero_fattura: "DEMO-F1", imponibile_totale: 513, testo: `Contratto n. ${codice}, SAL 1` },
  { id: uuid(7), company_id: azienda, cedente_piva: "01234567890", numero_fattura: "DEMO-F2", imponibile_totale: 1425, testo: `Contratto n. ${codice}, SAL 2` },
];

afterEach(cleanup);

it("mantiene aperta la scelta se il salvataggio fallisce, poi conferma lo stesso SAL al nuovo tentativo", async () => {
  const onConferma = vi.fn().mockRejectedValueOnce(new Error("Connessione interrotta")).mockResolvedValueOnce(undefined);
  const onChiudi = vi.fn();
  render(<CollegaFatturaSalSubDialog contesto={{ contratto, sal, collegate: [] }} disponibili={fatture} onConferma={onConferma} onChiudi={onChiudi} />);
  fireEvent.click(screen.getByRole("button", { name: /DEMO-F2/ }));
  expect(screen.getByRole("combobox", { name: "Collega a" })).toHaveTextContent(/SAL 2/);
  const invia = screen.getByRole("button", { name: "Conferma collegamento" });
  fireEvent.click(invia);
  expect(await screen.findByRole("alert")).toHaveTextContent("Connessione interrotta");
  expect(onChiudi).not.toHaveBeenCalled();
  fireEvent.click(invia);
  await waitFor(() => expect(onChiudi).toHaveBeenCalledOnce());
  expect(onConferma).toHaveBeenCalledTimes(2);
  expect(onConferma.mock.calls.map(([scelta]) => scelta.salId)).toEqual([sal[1].id, sal[1].id]);
});

it.each([
  { salIniziale: sal[0].id, fattura: fatture[1], collegate: [], motivo: /cita il SAL n. 2/ },
  { salIniziale: sal[1].id, fattura: { ...fatture[1], numero_fattura: "CUMULATIVA", imponibile_totale: 2040 }, collegate: [], motivo: /cumulativo/ },
  { salIniziale: sal[1].id, fattura: { ...fatture[1], numero_fattura: "DOPPIONE", id: uuid(8) },
    collegate: [{ ...fatture[1], contratto_subappalto_id: contratto.id, sal_subappaltatore_id: sal[1].id }], motivo: /già fatturato|già fatture/ },
])("ferma la fattura $fattura.numero_fattura se non corrisponde alla destinazione", ({ salIniziale, fattura, collegate, motivo }) => {
  const onConferma = vi.fn();
  render(<CollegaFatturaSalSubDialog contesto={{ contratto, sal, collegate }} disponibili={[fattura]} salIniziale={salIniziale} onConferma={onConferma} onChiudi={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(fattura.numero_fattura!) }));
  expect(screen.getByRole("alert")).toHaveTextContent(motivo);
  expect(screen.getByRole("button", { name: "Conferma collegamento" })).toBeDisabled();
  expect(onConferma).not.toHaveBeenCalled();
});

it("prova le due fatture demo con la RPC di collegamento e ritenta senza doppiare i costi", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function auth.uid() returns uuid language sql as $$ select '${uuid(9)}'::uuid $$;
      create function public.has_permission_for_company(uuid, text, uuid) returns boolean language sql as $$ select $3 = '${azienda}' $$;
      create function public.partner_tax_key(text) returns text language sql as $$ select regexp_replace(upper(coalesce($1,'')), '^IT([0-9]{11})$', '\\1') $$;
      create function public.azienda_collegamento_automatico(uuid) returns boolean language sql as $$ select false $$;

      create table subappaltatori_sicurezza(id uuid primary key, piva text);
      create table contratti_subappalto(id uuid primary key, company_id uuid, order_id uuid, numero_contratto text, acconto_importo numeric, subappaltatore_id uuid);
      create table sal_subappaltatori(id uuid primary key, contratto_id uuid, stato text, numero_sal integer);
      create table fatture_ricevute(
        id uuid primary key, company_id uuid, cedente_piva text, tipo_documento text, stato text, company_cost_id uuid, purchase_order_id uuid,
        imponibile_totale numeric, totale_documento numeric, contratto_subappalto_id uuid, sal_subappaltatore_id uuid, subappalto_acconto boolean,
        order_id_suggerito uuid, updated_at timestamptz
      );
      create table company_costs(id uuid primary key, company_id uuid, order_id uuid, updated_at timestamptz, purchase_order_id uuid, allocations jsonb);
      create table acquisti_collegamenti(
        id uuid primary key default gen_random_uuid(), company_id uuid, da_tipo text, da_id uuid, a_tipo text, a_id uuid, stato text,
        unique(company_id, da_tipo, da_id, a_tipo, a_id)
      );
      create function public.acquisti_collegamento_registra(uuid,text,uuid,uuid,text,uuid,uuid,text,text,jsonb,text,text,text,numeric,numeric,boolean,text)
      returns void language sql as $$
        insert into acquisti_collegamenti(company_id,da_tipo,da_id,a_tipo,a_id,stato) values ($1,$2,$3,$5,$6,'collegato')
        on conflict (company_id,da_tipo,da_id,a_tipo,a_id) do nothing;
      $$;
      create function public.acquisti_collegamento_cambia_stato(uuid,text,text) returns void language sql as $$
        update acquisti_collegamenti set stato=$2 where id=$1;
      $$;
      create function public.contabilizza_fattura_ricevuta(uuid) returns jsonb language sql as $$
        with c as (insert into company_costs(id,company_id) select gen_random_uuid(),company_id from fatture_ricevute where id=$1 returning id)
        update fatture_ricevute set company_cost_id=c.id from c where fatture_ricevute.id=$1 returning jsonb_build_object('company_cost_id',c.id);
      $$;
      insert into subappaltatori_sicurezza values ('${uuid(10)}', '${contratto.piva}');
      insert into contratti_subappalto values ('${contratto.id}', '${azienda}', '${ordine}', '${codice}', 0, '${uuid(10)}');
      insert into sal_subappaltatori values ${sal.map(s => `('${s.id}','${contratto.id}','${s.stato}',${s.numero_sal})`).join(",")};
      insert into fatture_ricevute(id,company_id,cedente_piva,tipo_documento,imponibile_totale) values
        ${fatture.map(f => `('${f.id}','${azienda}','${f.cedente_piva}','TD01',${f.imponibile_totale})`).join(",")};
    `);
    const migrazione = readFileSync("supabase/migrations/20290415210000_area_d_correzioni_revisione.sql", "utf8");
    const inizio = migrazione.indexOf("CREATE OR REPLACE FUNCTION public.subappalto_collega_fattura(");
    const fine = migrazione.indexOf("$function$;", inizio) + "$function$;".length;
    expect(inizio).toBeGreaterThan(-1);
    await db.exec(migrazione.slice(inizio, fine));
    const applica = async (scelta: ConfermaFatturaSalSub) => {
      const result = await db.query<{ result: { esito: string } }>(
        "select public.subappalto_collega_fattura($1,$2,$3,'manuale','demo',$4,$5) as result",
        [scelta.fatturaId, contratto.id, scelta.salId, JSON.stringify(scelta.prove), scelta.acconto],
      );
      return result.rows[0].result.esito;
    };
    const contesto: ContestoFattureSalSub = { contratto, sal, collegate: [] };
    const scelte: ConfermaFatturaSalSub[] = [];
    for (const [index, f] of fatture.entries()) {
      const onChiudi = vi.fn();
      render(<CollegaFatturaSalSubDialog contesto={contesto} disponibili={fatture.slice(index)} onChiudi={onChiudi} onConferma={async scelta => {
        expect(await applica(scelta)).toBe("contabilizzata_e_collegata");
        scelte.push(scelta);
      }} />);
      fireEvent.click(screen.getByRole("button", { name: new RegExp(f.numero_fattura!) }));
      expect(screen.getByRole("combobox", { name: "Collega a" })).toHaveTextContent(`SAL ${index + 1}`);
      fireEvent.click(screen.getByRole("button", { name: "Conferma collegamento" }));
      await waitFor(() => expect(onChiudi).toHaveBeenCalledOnce());
      const registrata = (await db.query<Pick<FatturaContrattoSub, "contratto_subappalto_id" | "sal_subappaltatore_id">>(
        "select contratto_subappalto_id,sal_subappaltatore_id from fatture_ricevute where id=$1", [f.id],
      )).rows[0];
      contesto.collegate.push({ ...f, ...registrata });
      expect(fatturePerSalSub(sal, contesto.collegate)[index]).toMatchObject({ fatturato: f.imponibile_totale, differenza: 0 });
      cleanup();
    }
    expect(await applica(scelte[1])).toBe("collegata");
    const dati = await db.query<{ fatture: number; costi: number; fatturato: string; legami: number }>(`
      select (select count(*)::int from fatture_ricevute where contratto_subappalto_id is not null) fatture,
             (select count(*)::int from company_costs where order_id='${ordine}') costi,
             (select sum(imponibile_totale)::text from fatture_ricevute) fatturato,
             (select count(*)::int from acquisti_collegamenti where a_tipo='sal') legami
    `);
    expect(dati.rows[0]).toEqual({ fatture: 2, costi: 2, fatturato: "1938", legami: 2 });
  } finally {
    await db.close();
  }
}, 20000);
