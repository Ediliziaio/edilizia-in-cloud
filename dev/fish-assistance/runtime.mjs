import { randomUUID, createHash } from "node:crypto";
import {
  openLocalAssistanceDatabase,
  FIXTURES,
  CUSTOMERS,
  fullName,
  fullAddress,
} from "./database.mjs";
import { localDbAdapter } from "./db-adapter.mjs";
import { fishAssistanceTool } from "../../supabase/functions/_shared/fishAssistance.ts";
import { fishHasExplicitConsent } from "../../supabase/functions/_shared/fishActionConsent.ts";
import {
  normalizzaData,
  normalizzaOra,
} from "../../supabase/functions/_shared/ediliziaCustomerTools.ts";
import { dataRoma } from "../../supabase/functions/_shared/calendarioPrenotazione.ts";
import { localSpokenInput } from "./spoken-input.mjs";
const SCENARIOS = [
  { id: "new", name: "Nuova richiesta di assistenza" },
  { id: "returning", name: "Richiamo su un ticket esistente" },
  { id: "unknown", name: "Numero non presente nel gestionale" },
  { id: "ambiguous", name: "Numero associato a due clienti" },
  { id: "no_slots", name: "Calendario senza disponibilità" },
  { id: "collision", name: "Orario occupato prima della conferma" },
];
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const phrase = (value) =>
  String(value || "")
    .trim()
    .replace(/[.!?]+$/, "");
const clean = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/, "");
const rpcChecked = async (client, name, params) => {
  const result = await client.rpc(name, params);
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
export async function createAssistanceLab({ dataDir } = {}) {
  const db = await openLocalAssistanceDatabase(dataDir);
  const client = localDbAdapter(db);
  let queue = Promise.resolve();
  let closed = false;
  const serial = (operation) => {
    if (closed) return Promise.reject(new Error("Laboratorio chiuso"));
    const pending = queue.then(operation);
    queue = pending.catch(() => {});
    return pending;
  };
  const message = (state, role, text) =>
    state.messages.push({
      id: randomUUID(),
      role,
      text,
      final: true,
      type: "message",
      at: new Date().toISOString(),
    });
  async function tool(session, name, params) {
    const result = await fishAssistanceTool(
      client,
      FIXTURES.company,
      FIXTURES.agent,
      session.id,
      session.phone,
      name,
      params,
      session.state.messages,
      { syncCalendar: async () => {} },
    );
    session.state.tools.push({
      id: randomUUID(),
      name,
      at: new Date().toISOString(),
      result,
    });
    return result;
  }
  async function get(id) {
    if (!uuid(id)) throw new Error("Sessione locale non valida");
    const row = (
      await db.query("SELECT * FROM local_lab_sessions WHERE id=$1", [id])
    ).rows[0];
    if (!row) throw new Error("Sessione locale non trovata");
    return row;
  }
  async function persist(session) {
    await db.query(
      "UPDATE local_lab_sessions SET state=$2,updated_at=now() WHERE id=$1",
      [session.id, JSON.stringify(session.state)],
    );
    await db.query(
      "UPDATE ai_conversations_v2 SET trascrizione_json=$2,riassunto=$3,terminata_il=$4 WHERE id=$1",
      [
        session.id,
        JSON.stringify(session.state.messages),
        session.state.phase === "done"
          ? "Ticket e appuntamento confermati nel collaudo locale"
          : null,
        ["done", "needs_office"].includes(session.state.phase)
          ? new Date().toISOString()
          : null,
      ],
    );
  }
  const ticketQuestion = (state) =>
    state.existingTicket
      ? `Aggiungo alla segnalazione ${state.existingTicket.slice(0, 8).toUpperCase()} questa nota: ${phrase(state.problem)}. I dati sono ${state.name}, ${state.address}. Confermi l’aggiornamento?`
      : `Quindi, ${state.name}, il problema è: ${phrase(state.problem)}. L’indirizzo è ${state.address}. Apro la segnalazione con questi dati, va bene?`;
  function suggestions(session) {
    const s = session.state;
    const customer = CUSTOMERS.find((c) => c.id === s.customerFixture);
    switch (s.phase) {
      case "problem":
        return ["La finestra della camera non si chiude bene da ieri."];
      case "urgency":
        return ["No, nessun pericolo immediato", "Sì, serve una persona"];
      case "name":
        return customer ? [fullName(customer)] : [];
      case "address":
        return customer ? [fullAddress(customer)] : [];
      case "ticket_choice":
        return [
          ...(s.memoryTickets || []).map((t) => "Riprendi " + t.riferimento),
          "Nuova segnalazione",
        ];
      case "ticket_confirmation":
        return ["Sì, confermo", "Correggi problema"];
      case "appointment_choice":
        return ["Sì, vorrei un appuntamento", "No, seguirà l’ufficio"];
      case "day":
        return [
          dataRoma(new Date(), 1),
          dataRoma(new Date(), 2),
          "Lascia all’ufficio",
        ];
      case "slot":
        return s.slots || [];
      case "appointment_confirmation":
        return ["Sì, confermo l’appuntamento", "No, scelgo un altro orario"];
      default:
        return [];
    }
  }
  async function snapshot(id) {
    const session = await get(id);
    const row = (
      await db.query(
        "SELECT * FROM ai_fish_assistance WHERE company_id=$1 AND agent_id=$2 AND session_id=$3",
        [FIXTURES.company, FIXTURES.agent, id],
      )
    ).rows[0];
    const customer = row?.customer_id
      ? (
          await db.query(
            "SELECT id,first_name,last_name,phone,address,city FROM profiles WHERE id=$1 AND company_id=$2",
            [row.customer_id, FIXTURES.company],
          )
        ).rows[0]
      : null;
    const ticket = row?.ticket_id
      ? (
          await db.query(
            "SELECT id,customer_id,subject,descrizione,indirizzo_intervento,status,created_at FROM tickets WHERE id=$1 AND company_id=$2",
            [row.ticket_id, FIXTURES.company],
          )
        ).rows[0]
      : null;
    const appointment = row?.appointment_id
      ? (
          await db.query(
            "SELECT id,calendar_id,appointment_date,appointment_time,appointment_end_time,assigned_to,status,title,description FROM appointments WHERE id=$1 AND company_id=$2",
            [row.appointment_id, FIXTURES.company],
          )
        ).rows[0]
      : null;
    if (appointment)
      appointment.appointment_date =
        typeof appointment.appointment_date === "string"
          ? appointment.appointment_date.slice(0, 10)
          : appointment.appointment_date.toISOString().slice(0, 10);
    const transcript = ticket
      ? (
          await db.query(
            "SELECT transcript FROM ticket_ai_conversations WHERE ticket_id=$1 AND company_id=$2 AND remote_session_id=$3",
            [ticket.id, FIXTURES.company, id],
          )
        ).rows[0]?.transcript || []
      : [];
    const notes = ticket
      ? (
          await db.query(
            "SELECT id,note,created_at FROM ticket_ai_actions WHERE ticket_id=$1 AND company_id=$2 ORDER BY created_at",
            [ticket.id, FIXTURES.company],
          )
        ).rows
      : [];
    const steps = row
      ? (
          await db.query(
            "SELECT ordine,azione_chiave,stato FROM silvio_task_passi WHERE task_id=$1 ORDER BY ordine",
            [row.task_id],
          )
        ).rows
      : [];
    const fixture = CUSTOMERS.find(
      (c) => c.id === session.state.customerFixture,
    );
    return {
      mode: "local",
      productionConnected: false,
      session: {
        id,
        scenario: session.scenario,
        phase: session.state.phase,
        messages: session.state.messages,
        tools: session.state.tools,
        suggestions: suggestions(session),
        day: session.state.day || null,
      },
      fixture: fixture
        ? {
            name: fullName(fixture),
            address: fullAddress(fixture),
            phone: session.phone,
          }
        : null,
      customer,
      ticket: ticket ? { ...ticket, transcript, notes } : null,
      appointment,
      steps,
      activity: row
        ? {
            ...row,
            customerName: customer ? fullName(customer) : null,
            problem: ticket?.descrizione || null,
            appointment: appointment
              ? {
                  date: appointment.appointment_date,
                  time: appointment.appointment_time,
                  status: appointment.status,
                }
              : null,
          }
        : null,
    };
  }
  async function bootstrap() {
    const calendars = (
      await db.query(
        "SELECT id,name,duration_minutes FROM marketing_calendars ORDER BY name",
      )
    ).rows;
    const sessions = (
      await db.query(
        "SELECT id,scenario,created_at,state->>'phase' phase FROM local_lab_sessions ORDER BY created_at DESC LIMIT 10",
      )
    ).rows;
    return {
      mode: "local",
      productionConnected: false,
      backend: "PostgreSQL locale",
      scenarios: SCENARIOS,
      customers: CUSTOMERS.slice(0, 2).map((c) => ({
        id: c.id,
        name: fullName(c),
        address: fullAddress(c),
        phone: c.phone,
      })),
      calendars,
      defaultCalendarId: FIXTURES.calendar,
      defaultDay: dataRoma(new Date(), 1),
      sessions,
    };
  }
  async function start(input) {
    if (
      !uuid(input.requestId) ||
      !SCENARIOS.some((s) => s.id === input.scenario) ||
      !CUSTOMERS.slice(0, 2).some((c) => c.id === input.customerId) ||
      ![FIXTURES.calendar, FIXTURES.emptyCalendar].includes(input.calendarId)
    )
      throw new Error("Scegli cliente, scenario e calendario di test");
    const old = (
      await db.query(
        "SELECT id,scenario,state FROM local_lab_sessions WHERE client_request_id=$1",
        [input.requestId],
      )
    ).rows[0];
    if (old) {
      if (
        old.scenario !== input.scenario ||
        old.state.customerFixture !== input.customerId ||
        old.state.requestCalendar !== input.calendarId
      )
        throw new Error("Richiesta locale riutilizzata con dati diversi");
      return snapshot(old.id);
    }
    const selected = CUSTOMERS.find((c) => c.id === input.customerId);
    const phone =
      input.scenario === "unknown"
        ? "+390000000999"
        : input.scenario === "ambiguous"
          ? "+390000000303"
          : selected.phone;
    const calendarId =
      input.scenario === "no_slots" ? FIXTURES.emptyCalendar : input.calendarId;
    const id = randomUUID();
    const session = {
      id,
      scenario: input.scenario,
      phone,
      calendar_id: calendarId,
      state: {
        phase: "problem",
        customerFixture: selected.id,
        requestCalendar: input.calendarId,
        messages: [],
        tools: [],
        problem: "",
        name: "",
        address: "",
      },
    };
    await db.query(
      "UPDATE ai_agents_v2 SET tools_config=jsonb_set(tools_config,'{fish,calendar_id}',$1) WHERE id=$2",
      [JSON.stringify(calendarId), FIXTURES.agent],
    );
    if (input.scenario === "returning") {
      const ticketId = "d1000000-0000-4000-a000-" + selected.id.slice(-12);
      await db.query(
        "INSERT INTO tickets(id,company_id,customer_id,subject,titolo,descrizione,indirizzo_intervento,status,priority,priorita,fonte,tipo) VALUES($1,$2,$3,'Assistenza di test già aperta','Assistenza di test già aperta','Finestra con maniglia da verificare',$4,'aperto','normale','media','api','supporto') ON CONFLICT(id) DO NOTHING",
        [ticketId, FIXTURES.company, selected.id, fullAddress(selected)],
      );
    }
    await db.query(
      "INSERT INTO local_lab_sessions(id,client_request_id,scenario,phone,calendar_id,state) VALUES($1,$2,$3,$4,$5,$6)",
      [
        id,
        input.requestId,
        input.scenario,
        phone,
        calendarId,
        JSON.stringify(session.state),
      ],
    );
    await db.query("INSERT INTO ai_fish_calls VALUES($1,$2,$3,$4)", [
      id,
      FIXTURES.company,
      FIXTURES.agent,
      id,
    ]);
    await db.query(
      "INSERT INTO ai_conversations_v2(id,company_id) VALUES($1,$2)",
      [id, FIXTURES.company],
    );
    const identified = await tool(session, "info_cliente", {});
    if (!identified.trovato) {
      session.state.phase = "needs_office";
      message(
        session.state,
        "agent",
        "Il numero non identifica una sola scheda cliente. Lascio la richiesta da verificare all’ufficio: non apro ticket e non prenoto appuntamenti.",
      );
    } else
      message(
        session.state,
        "agent",
        "Buongiorno, sono l’assistente virtuale dell’azienda di test. Raccontami il problema, così vediamo come aiutarti.",
      );
    await persist(session);
    return snapshot(id);
  }
  async function turn(id, input) {
    if (
      !uuid(input.requestId) ||
      typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > 2000
    )
      throw new Error("Scrivi una risposta entro 2000 caratteri");
    const text = input.text.trim(),
      digest = hash(text);
    const prior = (
      await db.query(
        "SELECT body_hash,response FROM local_lab_requests WHERE session_id=$1 AND request_id=$2",
        [id, input.requestId],
      )
    ).rows[0];
    if (prior) {
      if (prior.body_hash !== digest)
        throw new Error("Richiesta locale riutilizzata con un testo diverso");
      return prior.response;
    }
    const session = await get(id),
      s = session.state;
    if (["done", "needs_office"].includes(s.phase))
      throw new Error("Questo collaudo è concluso. Avviane uno nuovo.");
    message(s, "user", text);
    if (s.phase === "problem") {
      if (text.length < 8)
        message(
          s,
          "agent",
          "Mi descrivi il problema con qualche dettaglio in più?",
        );
      else {
        s.problem = text;
        s.phase = "urgency";
        message(s, "agent", "C’è un pericolo immediato per persone o cose?");
      }
    } else if (s.phase === "urgency") {
      if (/^no\b|nessun|non (?:c.e|ci sono)/.test(clean(text))) {
        if (s.name && s.address) {
          s.phase = "ticket_confirmation";
          message(s, "agent", ticketQuestion(s));
        } else {
          s.phase = "name";
          message(s, "agent", "Mi dici nome e cognome?");
        }
      } else if (fishHasExplicitConsent(text)) {
        const c = (
          await db.query(
            "SELECT id FROM ai_fish_assistance WHERE session_id=$1",
            [id],
          )
        ).rows[0];
        await rpcChecked(client, "fish_assistance_office", {
          p_case: c.id,
          p_company: FIXTURES.company,
          p_reason: "operator",
        });
        s.phase = "needs_office";
        message(
          s,
          "agent",
          "Questa richiesta deve essere valutata da una persona. Nel collaudo la lascio all’ufficio, senza programmare un intervento ordinario o promettere soccorsi.",
        );
      } else
        message(
          s,
          "agent",
          "Mi confermi se c’è un pericolo immediato? Puoi rispondere sì oppure no.",
        );
    } else if (s.phase === "name") {
      s.name = localSpokenInput("name", text);
      s.phase = "address";
      message(
        s,
        "agent",
        "Grazie. Qual è l’indirizzo dell’intervento, compreso il comune?",
      );
    } else if (s.phase === "address") {
      s.address = localSpokenInput("address", text);
      const result = await tool(session, "memoria_pratica", {
        nome: s.name,
        indirizzo: s.address,
      });
      if (!result.verificato) {
        s.phase = "name";
        s.name = "";
        s.address = "";
        message(
          s,
          "agent",
          "I dati dichiarati non coincidono con la scheda associata al numero. Non ho aperto ticket. Mi ridici nome e cognome?",
        );
      } else {
        s.memoryTickets = (result.tickets || []).filter((t) => t.aperto);
        if (s.memoryTickets.length) {
          s.phase = "ticket_choice";
          message(
            s,
            "agent",
            "C’è già una segnalazione aperta. Vuoi riprendere uno dei ticket qui sotto oppure aprire una nuova segnalazione per questo problema?",
          );
        } else {
          s.phase = "ticket_confirmation";
          message(s, "agent", ticketQuestion(s));
        }
      }
    } else if (s.phase === "ticket_choice") {
      const picked = (s.memoryTickets || []).find(
        (t) => clean(text) === "riprendi " + clean(t.riferimento),
      );
      if (picked || clean(text) === "nuova segnalazione") {
        s.existingTicket = picked?.ticket_id || null;
        s.phase = "ticket_confirmation";
        message(s, "agent", ticketQuestion(s));
      } else
        message(
          s,
          "agent",
          "Scegli il riferimento della segnalazione da riprendere oppure “Nuova segnalazione”.",
        );
    } else if (s.phase === "ticket_confirmation") {
      if (clean(text) === "correggi problema") {
        s.phase = "problem";
        message(
          s,
          "agent",
          "Va bene, non salvo la segnalazione. Dimmi qual è il problema corretto.",
        );
      } else {
        const result = await tool(
          session,
          s.existingTicket ? "aggiorna_ticket" : "crea_ticket",
          {
            nome: s.name,
            indirizzo: s.address,
            descrizione: s.problem,
            urgenza: "normale",
            confermato: "si",
            ...(s.existingTicket ? { ticket_id: s.existingTicket } : {}),
          },
        );
        if (result.creato || result.aggiornato) {
          s.phase = "appointment_choice";
          message(
            s,
            "agent",
            `La segnalazione ${String(result.ticket_id).slice(0, 8).toUpperCase()} è ${result.aggiornato ? "aggiornata" : "aperta"} e collegata alla tua scheda. Vuoi concordare un appuntamento?`,
          );
        } else
          message(
            s,
            "agent",
            "Non ho salvato modifiche al ticket. " + ticketQuestion(s),
          );
      }
    } else if (s.phase === "appointment_choice") {
      if (fishHasExplicitConsent(text)) {
        s.phase = "day";
        message(
          s,
          "agent",
          "Quale giorno preferisci? Puoi scegliere la data qui sotto.",
        );
      } else if (/\bno\b|ufficio|non (?:voglio|desidero)/.test(clean(text))) {
        const c = (
          await db.query(
            "SELECT id FROM ai_fish_assistance WHERE session_id=$1",
            [id],
          )
        ).rows[0];
        await rpcChecked(client, "fish_assistance_office", {
          p_case: c.id,
          p_company: FIXTURES.company,
          p_reason: "declined",
        });
        s.phase = "needs_office";
        message(
          s,
          "agent",
          "Va bene, il ticket resta salvato. Lascio l’appuntamento da concordare all’ufficio, nel centro attività.",
        );
      } else
        message(
          s,
          "agent",
          "Vuoi concordare un appuntamento oppure preferisci lasciare il seguito all’ufficio?",
        );
    } else if (s.phase === "day") {
      if (clean(text).includes("ufficio")) {
        const c = (
          await db.query(
            "SELECT id FROM ai_fish_assistance WHERE session_id=$1",
            [id],
          )
        ).rows[0];
        await rpcChecked(client, "fish_assistance_office", {
          p_case: c.id,
          p_company: FIXTURES.company,
          p_reason: s.slots?.length ? "declined" : "no_slots",
        });
        s.phase = "needs_office";
        message(
          s,
          "agent",
          "Il ticket resta salvato. Lascio l’appuntamento da concordare all’ufficio.",
        );
      } else {
        const date =
          clean(localSpokenInput("day", text)) === "domani"
            ? dataRoma(new Date(), 1)
            : normalizzaData(localSpokenInput("day", text));
        if (!date)
          message(
            s,
            "agent",
            "Scegli una data dal calendario oppure scrivila nel formato giorno/mese/anno.",
          );
        else {
          const result = await tool(session, "disponibilita", { data: date });
          s.day = date;
          s.slots = result.slot || [];
          if (s.slots.length) {
            s.phase = "slot";
            message(
              s,
              "agent",
              "Questi sono gli orari disponibili per il giorno scelto. Quale preferisci?",
            );
          } else
            message(
              s,
              "agent",
              "Per quel giorno non ho disponibilità da proporre. Puoi scegliere un altro giorno oppure lasciare la richiesta all’ufficio.",
            );
        }
      }
    } else if (s.phase === "slot") {
      const time = normalizzaOra(localSpokenInput("slot", text));
      if (!s.slots.includes(time))
        message(
          s,
          "agent",
          "Quell’orario non è tra quelli disponibili. Scegli uno degli orari proposti.",
        );
      else {
        s.time = time;
        s.phase = "appointment_confirmation";
        message(
          s,
          "agent",
          `Posso fissare l’appuntamento per il ${s.day.split("-").reverse().join("/")} alle ${time}, a ${s.address}, per controllare il problema che mi hai descritto?`,
        );
      }
    } else if (s.phase === "appointment_confirmation") {
      if (!fishHasExplicitConsent(text)) {
        s.phase = "slot";
        message(
          s,
          "agent",
          "Non ho prenotato l’appuntamento. Scegli di nuovo un orario tra quelli proposti.",
        );
      } else {
        if (session.scenario === "collision" && !s.collisionInjected) {
          await rpcChecked(client, "calendar_booking_slots", {
            p_calendar: session.calendar_id,
            p_date: s.day,
            p_exclude: null,
          });
          await db.query(
            "SELECT reserve_calendar_booking($1,$2,$3,$4::time,($4::time+interval '30 minutes')::time,0,0,30,$5)",
            [
              session.calendar_id,
              FIXTURES.company,
              s.day,
              s.time,
              JSON.stringify({
                title: "Impegno di test inserito durante la conferma",
                request_key: "collision:" + id,
              }),
            ],
          );
          s.collisionInjected = true;
        }
        const result = await tool(session, "fissa_appuntamento", {
          nome: s.name,
          indirizzo: s.address,
          data: s.day,
          ora: s.time,
          motivo: s.problem,
        });
        if (result.creato) {
          s.phase = "done";
          message(
            s,
            "agent",
            result.risposta +
              " Il ticket e l’appuntamento sono collegati. Trovi anche la conversazione nella segnalazione di test.",
          );
        } else {
          s.phase = "day";
          message(
            s,
            "agent",
            "L’appuntamento non è confermato. Il ticket è salvato: scegliamo un’altra disponibilità?",
          );
        }
      }
    }
    await persist(session);
    const result = await snapshot(id);
    await db.query("INSERT INTO local_lab_requests VALUES($1,$2,$3,$4)", [
      id,
      input.requestId,
      digest,
      JSON.stringify(result),
    ]);
    return result;
  }
  return {
    bootstrap: () => serial(bootstrap),
    start: (input) => serial(() => start(input)),
    turn: (id, input) => serial(() => turn(id, input)),
    snapshot: (id) => serial(() => snapshot(id)),
    async close() {
      closed = true;
      await queue;
      await db.close();
    },
    db,
  };
}
