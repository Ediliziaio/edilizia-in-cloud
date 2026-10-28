import { randomUUID } from "node:crypto";
import { makeCompleteWindowSurvey } from "../../src/test/fixtures/completeWindowSurvey";
import { surveyElementReview } from "../../src/lib/surveys/elementWorkflow";

export const DEMO_COMPANY = "d2000000-0000-4000-a000-000000000002";
export const IMPORT_SURVEY = "094083a9-ae8e-4f12-b545-30d9ea1b2473";
export const IMPORT_KEY = "DEMO-SERRAMENTI-COMPLETO-20261028";
export function prepareWindowImport() {
  const source = makeCompleteWindowSurvey();
  if (
    source.areas.length !== 6 ||
    source.elements.length !== 16 ||
    source.media.length
  )
    throw new Error(
      "Il dataset deve avere 6 ambienti, 16 schede e nessun media inventato",
    );
  const areaIds = new Map(source.areas.map((a) => [a.id, randomUUID()]));
  return {
    survey: {
      id: IMPORT_SURVEY,
      company_id: DEMO_COMPANY,
      status: "draft",
      address: "DEMO — Serramenti completi · 16 schede",
      city: "SIMULAZIONE — nessun immobile reale",
      header_data: {
        ...source.survey.header_data,
        demo_import_key: IMPORT_KEY,
      },
      notes: `${IMPORT_KEY}. Importazione dimostrativa autorizzata il 28/10/2026: 6 ambienti, 16 schede. Quote e configurazioni sintetiche; nessun cliente, commessa, foto, firma, ordine o invio. Le misure non sono verificate per produzione. ${source.survey.notes}`,
    },
    areas: source.areas.map((a) => ({
      id: areaIds.get(a.id)!,
      survey_id: IMPORT_SURVEY,
      name: a.name,
      position: a.position,
      area_data: {},
      notes: "Ambiente dimostrativo; da rilevare sul posto.",
      is_complete: false,
    })),
    elements: source.elements.map((e) => {
      const type = source.template.schema.element_types.find(
        (t) => t.key === e.element_type,
      );
      if (!type || e.values.rv_order_checked !== false)
        throw new Error("Tipo o verifica di ordine non coerente");
      const review = surveyElementReview(type, e.values, new Set());
      return {
        id: randomUUID(),
        survey_id: IMPORT_SURVEY,
        area_id: areaIds.get(e.area_id)!,
        element_type: e.element_type,
        element_label: e.element_label,
        position: e.position,
        values: structuredClone(e.values),
        quantity: e.quantity,
        notes: [
          e.notes,
          "SIMULAZIONE: dati non rilevati in cantiere, nessuna approvazione per ordine.",
        ]
          .filter(Boolean)
          .join("\n"),
        is_complete: false,
        missing_required_fields: review.missing.map((f) => f.key),
      };
    }),
  };
}

export function windowImportSql(
  payload: ReturnType<typeof prepareWindowImport>,
) {
  const literal = JSON.stringify(payload).replaceAll("'", "''");
  return `begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $import_serramenti$
declare
  p jsonb := '${literal}'::jsonb;
  sid uuid := '${IMPORT_SURVEY}';
  cid uuid := '${DEMO_COMPANY}';
  tid uuid := '669ad79f-b13a-484c-9137-3388a2ae4a71';
  before_headers text; before_areas text; before_elements text;
begin
  perform pg_advisory_xact_lock(hashtext('${IMPORT_KEY}:' || cid::text));
  if not exists(select 1 from public.companies where id=cid and name='Demo Azienda 2 S.r.l.') then raise exception 'Azienda demo non riconosciuta'; end if;
  if not exists(select 1 from public.survey_templates where id=tid and category='infissi' and is_active and (company_id=cid or company_id is null)) then raise exception 'Modello reale non disponibile'; end if;
  if exists(select 1 from public.surveys where id=sid) then
    if not exists(select 1 from public.surveys where id=sid and company_id=cid and header_data->>'demo_import_key'='${IMPORT_KEY}')
      or (select count(*) from public.survey_areas where survey_id=sid)<>6
      or (select count(*) from public.survey_elements where survey_id=sid)<>16 then raise exception 'Importazione esistente non coerente: nessuna sovrascrittura'; end if;
    return;
  end if;
  if exists(select 1 from public.surveys where company_id=cid and header_data->>'demo_import_key'='${IMPORT_KEY}') then raise exception 'Importazione già presente con altro identificativo'; end if;
  if jsonb_array_length(p->'areas')<>6 or jsonb_array_length(p->'elements')<>16 or p#>>'{survey,company_id}'<>cid::text or p#>>'{survey,status}'<>'draft' then raise exception 'Payload non autorizzato'; end if;
  select md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' order by s.id),'')) into before_headers from public.surveys s where s.company_id=cid;
  select md5(coalesce(string_agg(md5(to_jsonb(a)::text),'' order by a.id),'')) into before_areas from public.survey_areas a join public.surveys s on s.id=a.survey_id where s.company_id=cid;
  select md5(coalesce(string_agg(md5(to_jsonb(e)::text),'' order by e.id),'')) into before_elements from public.survey_elements e join public.surveys s on s.id=e.survey_id where s.company_id=cid;
  insert into public.surveys(id,company_id,template_id,status,mode,address,city,header_data,notes)
    values(sid,cid,tid,'draft','structured',p#>>'{survey,address}',p#>>'{survey,city}',p#>'{survey,header_data}',p#>>'{survey,notes}');
  insert into public.survey_areas(id,survey_id,name,position,area_data,notes,is_complete)
    select id,survey_id,name,position,area_data,notes,false from jsonb_to_recordset(p->'areas') as x(id uuid,survey_id uuid,name text,position integer,area_data jsonb,notes text);
  insert into public.survey_elements(id,survey_id,area_id,element_type,element_label,position,values,quantity,notes,is_complete,missing_required_fields)
    select id,survey_id,area_id,element_type,element_label,position,values,quantity,notes,false,missing_required_fields from jsonb_to_recordset(p->'elements') as x(id uuid,survey_id uuid,area_id uuid,element_type text,element_label text,position integer,values jsonb,quantity integer,notes text,missing_required_fields text[]);
  if (select count(*) from public.survey_areas where survey_id=sid)<>6 or (select count(*) from public.survey_elements where survey_id=sid)<>16 then raise exception 'Importazione incompleta'; end if;
  if exists(select 1 from public.survey_elements e join public.survey_areas a on a.id=e.area_id where e.survey_id=sid and a.survey_id<>sid) then raise exception 'Collegamenti ambienti non coerenti'; end if;
  if before_headers<>(select md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' order by s.id),'')) from public.surveys s where s.company_id=cid and s.id<>sid)
    or before_areas<>(select md5(coalesce(string_agg(md5(to_jsonb(a)::text),'' order by a.id),'')) from public.survey_areas a join public.surveys s on s.id=a.survey_id where s.company_id=cid and s.id<>sid)
    or before_elements<>(select md5(coalesce(string_agg(md5(to_jsonb(e)::text),'' order by e.id),'')) from public.survey_elements e join public.surveys s on s.id=e.survey_id where s.company_id=cid and s.id<>sid)
    then raise exception 'Un record preesistente è cambiato: rollback completo'; end if;
end $import_serramenti$;
commit;
select id,code,status,address,(select count(*) from public.survey_areas where survey_id=s.id) ambienti,(select count(*) from public.survey_elements where survey_id=s.id) elementi from public.surveys s where id='${IMPORT_SURVEY}';`;
}
