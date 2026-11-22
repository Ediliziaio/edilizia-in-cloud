import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
export const FIXTURES = {
  company: "a1000000-0000-4000-a000-000000000002",
  agent: "a1000000-0000-4000-a000-000000000003",
  owner: "a1000000-0000-4000-a000-000000000001",
  calendar: "a1000000-0000-4000-a000-000000000004",
  emptyCalendar: "a1000000-0000-4000-a000-000000000005",
  returnTicket: "d1000000-0000-4000-a000-000000000001",
};
export const CUSTOMERS = [
  {
    id: "b1000000-0000-4000-a000-000000000001",
    first_name: "Mario",
    last_name: "Prova",
    phone: "+390000000101",
    address: "Via dei Collaudi 10",
    city: "Città Test",
  },
  {
    id: "b1000000-0000-4000-a000-000000000002",
    first_name: "Giulia",
    last_name: "Collaudo",
    phone: "+390000000202",
    address: "Via delle Prove 22",
    city: "Città Test",
  },
  {
    id: "b1000000-0000-4000-a000-000000000003",
    first_name: "Omonimo",
    last_name: "Uno",
    phone: "+390000000303",
    address: "Via Test 3",
    city: "Città Test",
  },
  {
    id: "b1000000-0000-4000-a000-000000000004",
    first_name: "Omonimo",
    last_name: "Due",
    phone: "+390000000303",
    address: "Via Test 4",
    city: "Città Test",
  },
];
export const fullName = (c) => c.first_name + " " + c.last_name;
export const fullAddress = (c) => c.address + ", " + c.city;
const migration = (name) =>
  readFile(
    new URL("../../supabase/migrations/" + name, import.meta.url),
    "utf8",
  );
function functionSql(source, name) {
  const start = source.search(
    new RegExp("CREATE (?:OR REPLACE )?FUNCTION public\\." + name + "\\(", "i"),
  );
  if (start < 0) throw new Error("Local function missing: " + name);
  const body = source.indexOf("$$", start);
  const end = source.indexOf("$$;", body + 2);
  if (end < 0) throw new Error("Local function incomplete");
  return source.slice(start, end + 3);
}
export async function openLocalAssistanceDatabase(dataDir) {
  if (dataDir) await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const db = new PGlite(dataDir);
  await db.waitReady;
  const [schema, customer, conversations, memory, calendar, assistance] =
    await Promise.all([
      readFile(new URL("./schema.sql", import.meta.url), "utf8"),
      migration("20261110165759_fish_crm_live_trial.sql"),
      migration("20261110182217_fish_ticket_conversations.sql"),
      migration("20261110192439_fish_customer_case_memory.sql"),
      migration("20290311160000_team_calendars_atomic_booking.sql"),
      migration("20261117165309_fish_silvio_assistance.sql"),
    ]);
  const calendarEnd =
    "grant execute on function public.reserve_calendar_booking(uuid,uuid,date,time,time,integer,integer,integer,jsonb) to service_role;";
  const calendarSql = calendar.slice(
    0,
    calendar.indexOf(calendarEnd) + calendarEnd.length,
  );
  if (!calendarSql.endsWith(calendarEnd))
    throw new Error("Canonical local calendar SQL missing");
  const sql = [
    schema,
    functionSql(customer, "fish_customer_phone"),
    functionSql(customer, "fish_match_customer"),
    functionSql(conversations, "fish_link_ticket_conversation"),
    functionSql(conversations, "fish_ticket_transcript_mirror"),
    "CREATE TRIGGER fish_ticket_transcript_mirror AFTER INSERT OR UPDATE OF trascrizione_json,riassunto,terminata_il ON public.ai_conversations_v2 FOR EACH ROW EXECUTE FUNCTION public.fish_ticket_transcript_mirror();",
    functionSql(memory, "fish_customer_case_memory"),
    functionSql(memory, "fish_apply_ticket_update"),
    calendarSql,
    assistance,
  ];
  const hash = createHash("sha256").update(sql.join("\n")).digest("hex");
  const exists = (
    await db.query("SELECT to_regclass('public.local_lab_metadata') present")
  ).rows[0].present;
  if (exists) {
    const meta = (
      await db.query("SELECT version,source_hash FROM local_lab_metadata")
    ).rows[0];
    if (meta?.version !== 1 || meta.source_hash !== hash) {
      await db.close();
      throw new Error(
        "Il database di collaudo usa una versione diversa. Avvia con una nuova cartella locale, senza sovrascrivere i dati.",
      );
    }
    return db;
  }
  try {
    await db.transaction(async (tx) => {
      for (const statement of sql) await tx.exec(statement);
      await tx.query("INSERT INTO companies VALUES($1,$2)", [
        FIXTURES.company,
        "Edilizia Test Locale",
      ]);
      await tx.query(
        "INSERT INTO profiles(id,company_id,first_name,last_name) VALUES($1,$2,$3,$4)",
        [FIXTURES.owner, FIXTURES.company, "Operatore", "Locale"],
      );
      for (const c of CUSTOMERS) {
        await tx.query(
          "INSERT INTO profiles(id,company_id,first_name,last_name,phone,country,address,city) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            c.id,
            FIXTURES.company,
            c.first_name,
            c.last_name,
            c.phone,
            "IT",
            c.address,
            c.city,
          ],
        );
        await tx.query("INSERT INTO user_roles VALUES($1,'customer')", [c.id]);
        await tx.query(
          "INSERT INTO marketing_contacts(id,company_id,first_name,last_name,phone) VALUES($1,$2,$3,$4,$5)",
          [c.id, FIXTURES.company, c.first_name, c.last_name, c.phone],
        );
      }
      for (const [id, name] of [
        [FIXTURES.calendar, "Agenda assistenza di test"],
        [FIXTURES.emptyCalendar, "Agenda di test senza disponibilità"],
      ])
        await tx.query(
          "INSERT INTO marketing_calendars(id,company_id,name,owner_id) VALUES($1,$2,$3,$4)",
          [id, FIXTURES.company, name, FIXTURES.owner],
        );
      for (let day = 0; day < 7; day++)
        await tx.query(
          "INSERT INTO marketing_calendar_availability(calendar_id,day_of_week,start_time,end_time) VALUES($1,$2,'09:00','17:00')",
          [FIXTURES.calendar, day],
        );
      await tx.query("INSERT INTO ai_agents_v2 VALUES($1,$2,$3,$4)", [
        FIXTURES.agent,
        FIXTURES.company,
        "Assistente di collaudo",
        JSON.stringify({
          voice_provider: "fish_audio",
          fish: {
            flow_id: "support_appointment",
            calendar_id: FIXTURES.calendar,
          },
        }),
      ]);
      await tx.query("INSERT INTO local_lab_metadata VALUES(1,$1)", [hash]);
    });
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
