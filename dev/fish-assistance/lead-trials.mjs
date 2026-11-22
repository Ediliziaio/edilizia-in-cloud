import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FishAudioClient } from "../../supabase/functions/_shared/fishAudio.ts";
import { createFishWebPreview } from "../../supabase/functions/_shared/fishWebPreview.ts";
import {
  enabledFishTools,
  fishConfigurationFingerprint,
  FISH_TOOLS,
} from "../../supabase/functions/_shared/fishAgentConfig.ts";
import {
  FISH_VOICE_STYLE,
  FISH_FLUENT_DIALOGUE,
  FISH_LEAD_POLICY,
  FISH_ITALIAN_PRONUNCIATION,
} from "../../supabase/functions/_shared/fishConversationPolicy.ts";
import { FISH_LEAD_DEMO } from "../../supabase/functions/_shared/fishScenarioExtras.ts";
import {
  fishActionConsent,
  fishCallbackNumberAllowed,
} from "../../supabase/functions/_shared/fishActionConsent.ts";
import {
  fishLeadBooking,
  fishLeadContact,
  fishOpportunityOutcome,
} from "../../supabase/functions/_shared/fishSalesTools.ts";
import { fishCalendarTool } from "../../supabase/functions/_shared/fishCalendarTools.ts";
import {
  richiestaRichiamo,
  suffissoTelefono,
} from "../../supabase/functions/_shared/ediliziaCustomerTools.ts";
import { dataRoma } from "../../supabase/functions/_shared/calendarioPrenotazione.ts";
import { FIXTURES } from "./database.mjs";
import { localDbAdapter } from "./db-adapter.mjs";

const CONTACT = "b1000000-0000-4000-a000-000000000005";
const OPPORTUNITY = "b1000000-0000-4000-a000-000000000006";
const LEAD_AGENT = "a1000000-0000-4000-a000-000000000006";
const SCENARIOS = ["lead_appointment", "lead_handoff"];
const TOOLS = [
  "disponibilita",
  "fissa_appuntamento",
  "richiesta_richiamo",
  "aggiorna_opportunita",
];
const { company, calendar, owner } = FIXTURES;
const { phone, name, address } = FISH_LEAD_DEMO;
const agent = {
  id: LEAD_AGENT,
  nome: "Lead CRM locale",
  lingua: "it",
  primo_messaggio:
    "Buongiorno, sono Giulia, l’assistente virtuale di Edilizia Demo. La chiamo per la sua richiesta sui serramenti. È un buon momento?",
  system_prompt: [
    FISH_VOICE_STYLE,
    FISH_FLUENT_DIALOGUE,
    FISH_LEAD_POLICY,
    FISH_ITALIAN_PRONUNCIATION,
    "COLLAUDO LOCALE: usa gli orari effettivi restituiti dal calendario di prova. Un salvataggio vale solo se lo strumento lo conferma. Riporta sempre gli esiti come di collaudo.",
  ].join("\n\n"),
  llm_model: "google/gemini-3.6-flash",
  durata_max_secondi: 300,
  tools_config: {
    voice_provider: "fish_audio",
    fish: {
      flow_id: "lead_qualification",
      calendar_id: calendar,
      routing: "first_available",
      timezone: "Europe/Rome",
      voice: { tts_model: "drama-3" },
      lead_profile: {
        company_name: "Edilizia Demo",
        areas: ["Brescia"],
        services: ["Finestre"],
        appointment_mode: "onsite",
      },
    },
    edilizia_tools: Object.fromEntries(
      [
        "get_availability",
        "create_appointment",
        "passa_a_operatore",
        "assign_to_user",
        "aggiorna_opportunita",
      ].map((id) => [id, { enabled: true }]),
    ),
    system_tools: { transfer_number: true },
  },
};

function transcript(turns) {
  if (!Array.isArray(turns) || turns.length > 120)
    throw new Error("Trascrizione di prova non valida");
  return turns
    .filter(
      (item) =>
        item?.final === true &&
        ["user", "agent"].includes(item.role) &&
        typeof item.text === "string",
    )
    .map((item) => ({
      role: item.role,
      text: item.text.slice(0, 2000),
      final: true,
    }));
}

export async function createLeadTrials(
  db,
  {
    apiKey = "",
    fish = apiKey.trim() ? new FishAudioClient(apiKey) : null,
  } = {},
) {
  const sales = await readFile(
    new URL(
      "../../supabase/migrations/20261110182246_fish_sales_and_operator_routing.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const start = sales.indexOf(
    "CREATE TABLE public.ai_fish_opportunity_outcomes",
  );
  const end = sales.indexOf("-- The published destinations", start);
  if (start < 0 || end < 0)
    throw new Error("SQL commerciale del gestionale non trovato");
  await db.transaction(async (tx) => {
    const installed = (
      await tx.query("SELECT to_regclass('public.local_lead_trials') present")
    ).rows[0].present;
    if (installed) return;
    await tx.exec(`
      ALTER TABLE marketing_contacts ADD COLUMN country text DEFAULT 'IT', ADD COLUMN deleted_at timestamptz;
      ALTER TABLE marketing_opportunities ADD COLUMN contact_id uuid, ADD COLUMN status text, ADD COLUMN notes text,
        ADD COLUMN next_action text, ADD COLUMN last_activity_at timestamptz, ADD COLUMN updated_at timestamptz,
        ADD COLUMN deleted_at timestamptz;
      ALTER TABLE ai_fish_calls ADD COLUMN contact_id uuid, ADD COLUMN direction text, ADD COLUMN to_number text;
      CREATE TABLE tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, contact_id uuid,
        created_by uuid, title text, notes text, due_date date, priority text, status text);
      CREATE TABLE local_lead_trials(id uuid PRIMARY KEY REFERENCES ai_fish_calls(id), scenario text NOT NULL,
        appointment_id uuid, callback_id uuid, transcript jsonb NOT NULL DEFAULT '[]');
      CREATE TABLE local_lead_binding(id boolean PRIMARY KEY DEFAULT true CHECK(id), state jsonb NOT NULL);
    `);
    await tx.exec(sales.slice(start, end));
    await tx.query(
      "INSERT INTO marketing_contacts(id,company_id,first_name,last_name,phone) VALUES($1,$2,'Laura','Bianchi',$3)",
      [CONTACT, company, phone],
    );
    await tx.query(
      "INSERT INTO marketing_opportunities(id,company_id,contact_id,status,notes) VALUES($1,$2,$3,'open','Opportunità di collaudo')",
      [OPPORTUNITY, company, CONTACT],
    );
    await tx.query("INSERT INTO user_roles VALUES($1,'company_admin')", [
      owner,
    ]);
    await tx.query(
      "INSERT INTO ai_agents_v2(id,company_id,nome,tools_config) VALUES($1,$2,$3,$4)",
      [LEAD_AGENT, company, agent.nome, JSON.stringify(agent.tools_config)],
    );
  });
  const callbacks = await readFile(
    new URL("../../supabase/migrations/20261122130859_fish_crm_callbacks.sql", import.meta.url),
    "utf8",
  );
  await db.transaction(async (tx) => {
    const installed = (
      await tx.query("SELECT to_regprocedure('public.fish_save_callback(uuid,uuid,text,uuid,uuid,text,text,date,text)') present")
    ).rows[0].present;
    if (installed) return;
    await tx.exec(`
      ALTER TABLE tasks ADD COLUMN created_at timestamptz DEFAULT now();
      ALTER TABLE ai_conversations_v2 ADD COLUMN contact_id uuid,
        ADD COLUMN iniziata_il timestamptz DEFAULT now();
    `);
    await tx.exec(callbacks);
    await tx.exec(`
      UPDATE tasks t SET fish_call_id = p.id
        FROM local_lead_trials p JOIN ai_fish_calls c ON c.id = p.id
        WHERE t.id = p.callback_id AND t.company_id = c.company_id;
      INSERT INTO ai_conversations_v2 (id, company_id, contact_id, trascrizione_json, terminata_il)
        SELECT p.id, c.company_id, c.contact_id, p.transcript,
          CASE WHEN jsonb_array_length(p.transcript) > 0 THEN now() END
        FROM local_lead_trials p JOIN ai_fish_calls c ON c.id = p.id
        ON CONFLICT (id) DO NOTHING;
    `);
  });
  await db.exec("ALTER TABLE local_lead_trials ADD COLUMN IF NOT EXISTS handoff_outcome text");
  let queue = Promise.resolve();
  const serial = (operation) => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  async function getTrial(conn, id) {
    const trial = (
      await conn.query("SELECT * FROM local_lead_trials WHERE id=$1", [id])
    ).rows[0];
    if (!trial) throw new Error("Collaudo lead non trovato");
    return trial;
  }
  async function createRecord(scenario) {
    if (!SCENARIOS.includes(scenario))
      throw new Error("Scenario lead non disponibile");
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO ai_fish_calls(id,company_id,agent_id,remote_session_id,contact_id,direction,to_number) VALUES($1::uuid,$2,$3,$1::uuid::text,$4,'outbound',$5)",
        [id, company, LEAD_AGENT, CONTACT, phone],
      );
      await tx.query(
        "INSERT INTO local_lead_trials(id,scenario) VALUES($1,$2)",
        [id, scenario],
      );
      await tx.query(
        "INSERT INTO ai_conversations_v2(id, company_id, contact_id) VALUES($1, $2, $3)",
        [id, company, CONTACT],
      );
    });
    return id;
  }
  async function snapshot(id) {
    const trial = await getTrial(db, id);
    const [appointment, callback, outcome, conversation] = await Promise.all([
      trial.appointment_id &&
        db.query(
          "SELECT id,contact_id,opportunity_id,appointment_date,appointment_time FROM appointments WHERE id=$1 AND company_id=$2",
          [trial.appointment_id, company],
        ),
      db.query(
        "SELECT id,contact_id,fish_call_id,title,notes,status,due_date FROM tasks WHERE fish_call_id=$1 AND company_id=$2",
        [id, company],
      ),
      db.query(
        "SELECT opportunity_id,outcome,note,next_action FROM ai_fish_opportunity_outcomes WHERE call_id=$1 AND company_id=$2",
        [id, company],
      ),
      db.query(
        "SELECT contact_id,iniziata_il,terminata_il,trascrizione_json FROM ai_conversations_v2 WHERE id=$1 AND company_id=$2",
        [id, company],
      ),
    ]);
    return {
      id,
      scenario: trial.scenario,
      contact: { id: CONTACT, name, address, phone },
      opportunityId: OPPORTUNITY,
      appointment: appointment?.rows?.[0] || null,
      callback: callback?.rows?.[0] || null,
      outcome: outcome.rows[0] || null,
      call: conversation.rows[0],
      transcript: conversation.rows[0].trascrizione_json,
    };
  }
  async function open(scenario) {
    if (!SCENARIOS.includes(scenario))
      throw new Error("Scenario lead non disponibile");
    if (!fish) throw new Error("Configura la chiave Fish sul server locale.");
    const state = (
      await db.query("SELECT state FROM local_lead_binding WHERE id=true")
    ).rows[0]?.state;
    const binding = {
      company_id: company,
      fish_agent_id: "private-lead-lab",
      voice_id: "0e36e185d0654d5bac3d24331562a0cc",
      preview_agent_id: null,
      preview_tool_ids: {},
      transfer_destinations: [],
      tool_ids: Object.fromEntries(
        enabledFishTools(agent).map((tool) => [tool, "local-" + tool]),
      ),
      ...state,
    };
    binding.config_fingerprint = await fishConfigurationFingerprint(
      agent,
      binding,
    );
    const bindingDb = {
      from(table) {
        if (table !== "ai_fish_agents")
          throw new Error("Binding locale non valido");
        return {
          update(values) {
            const save = async () => {
              Object.assign(binding, values);
              const {
                preview_agent_id,
                preview_tool_ids,
                preview_fingerprint,
              } = binding;
              await db.query(
                "INSERT INTO local_lead_binding(state) VALUES($1) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state",
                [
                  JSON.stringify({
                    preview_agent_id,
                    preview_tool_ids,
                    preview_fingerprint,
                  }),
                ],
              );
              return { data: { agent_id: LEAD_AGENT }, error: null };
            };
            const query = {
              eq: () => query,
              is: () => query,
              select: () => query,
              single: save,
              then: (resolve, reject) => save().then(resolve, reject),
            };
            return query;
          },
        };
      },
    };
    const session = await createFishWebPreview(
      { db: bindingDb, fish },
      agent,
      binding,
      "lead-crm-locale",
      scenario,
      {
        today:
          new Intl.DateTimeFormat("it-IT", {
            dateStyle: "long",
            timeZone: "Europe/Rome",
          }).format(new Date()) + ", Europe/Rome",
      },
    );
    return { ...session, local_trial_id: await createRecord(scenario) };
  }
  async function execute(id, input) {
    const tool = input.tool;
    if (tool === "passa_a_operatore") {
      const outcome = input.parameters?.esito;
      if (!["no_answer", "unavailable", "accepted"].includes(outcome))
        throw new Error("Esito del passaggio non valido");
      await db.query(
        "UPDATE local_lead_trials SET handoff_outcome=$2 WHERE id=$1 AND scenario='lead_handoff' AND handoff_outcome IS NULL",
        [id, outcome],
      );
      return { saved: true };
    }
    if (!TOOLS.includes(tool))
      throw new Error("Strumento di prova non disponibile");
    const params = Object.fromEntries(
      FISH_TOOLS[tool].fields.flatMap((key) => {
        const value = input.parameters?.[key];
        return typeof value === "string" && value.trim()
          ? [[key, value.trim().slice(0, 2000)]]
          : [];
      }),
    );
    const turns = transcript(input.transcript);
    return db.transaction(async (tx) => {
      const trial = await getTrial(tx, id);
      if (
        tool === "fissa_appuntamento" &&
        trial.scenario !== "lead_appointment"
      )
        return {
          creato: false,
          risposta: "Questo collaudo riguarda il richiamo.",
        };
      if (tool === "richiesta_richiamo" && trial.scenario !== "lead_handoff")
        return {
          creato: false,
          risposta: "Questo collaudo riguarda l’appuntamento.",
        };
      if (tool !== "disponibilita") {
        const consent = fishActionConsent(turns, tool, params);
        if (!consent.ok)
          return { creato: false, aggiornata: false, ...consent };
      }
      if (FISH_TOOLS[tool].required.some((key) => !params[key]))
        return {
          creato: false,
          aggiornata: false,
          risposta: "Raccogli tutti i dati richiesti prima di salvare.",
        };
      const adapter = localDbAdapter(tx);
      if (tool === "aggiorna_opportunita") {
        if (!trial.appointment_id && !(await tx.query(
          "SELECT id FROM tasks WHERE company_id=$1 AND fish_call_id=$2",
          [company, id],
        )).rows.length)
          return {
            aggiornata: false,
            risposta: "Conferma prima il salvataggio dell’azione concordata.",
          };
        return fishOpportunityOutcome(adapter, company, LEAD_AGENT, id, params);
      }
      if (tool === "richiesta_richiamo") {
        if (!["no_answer", "unavailable"].includes(trial.handoff_outcome))
          return { creato: false, risposta: "Completa prima il tentativo di passaggio al consulente." };
        if (
          !fishCallbackNumberAllowed(turns, phone, params.recapito) ||
          params.recapito !== phone
        )
          return {
            creato: false,
            risposta: "Usa il numero della scheda di collaudo.",
          };
        const result = await richiestaRichiamo(
          adapter,
          company,
          {
            rawPhone: phone,
            suffix: suffissoTelefono(phone),
            fallbackCreatedBy: owner,
            fishAgentId: LEAD_AGENT,
            conversationId: id,
          },
          params,
          await fishLeadContact(adapter, company, LEAD_AGENT, id, phone),
        );
        if (result.creato)
          await persistTranscript(tx, id, turns, false);
        return result;
      }
      if (
        tool === "fissa_appuntamento" &&
        (params.comune?.toLowerCase() !== "brescia" || !params.indirizzo)
      )
        return {
          creato: false,
          risposta: "Conferma il comune e l’indirizzo del sopralluogo.",
        };
      const leadBooking =
        tool === "fissa_appuntamento"
          ? await fishLeadBooking(adapter, company, LEAD_AGENT, id, phone)
          : undefined;
      if (tool === "fissa_appuntamento" && !leadBooking)
        return {
          creato: false,
          risposta: "Contatto di prova non verificabile.",
        };
      const result = await fishCalendarTool(
        adapter,
        company,
        calendar,
        phone,
        tool,
        params,
        undefined,
        { leadBooking, syncCalendar: async () => {} },
      );
      if (result.creato)
        await tx.query(
          "UPDATE local_lead_trials SET appointment_id=$2 WHERE id=$1",
          [id, result.appointment_id],
        );
      return result;
    });
  }
  async function persistTranscript(conn, id, messages, completed) {
    await conn.query(
      `UPDATE ai_conversations_v2
       SET trascrizione_json = CASE WHEN jsonb_array_length(trascrizione_json)<=$3 THEN $2 ELSE trascrizione_json END,
           terminata_il = CASE WHEN $4::boolean THEN coalesce(terminata_il, now()) ELSE terminata_il END
       WHERE id=$1 AND company_id=$5`,
      [id, JSON.stringify(messages), messages.length, completed, company],
    );
  }
  return {
    setup: () => ({
      ready: !!fish,
      name,
      address,
      phone,
      day: dataRoma(new Date(), 1),
    }),
    open: (scenario) => serial(() => open(scenario)),
    // Reuse the same call record when exercising the tools without the provider.
    createRecord: (scenario) => serial(() => createRecord(scenario)),
    snapshot: (id) => serial(() => snapshot(id)),
    execute: (id, input) => serial(() => execute(id, input)),
    saveTranscript: (id, turns) =>
      serial(async () => {
        await getTrial(db, id);
        const messages = transcript(turns);
        await persistTranscript(db, id, messages, true);
        return { saved: true };
      }),
  };
}
