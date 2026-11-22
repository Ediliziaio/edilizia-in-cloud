import { buildFishOutboundRequest } from "../../supabase/functions/_shared/fishAudio.ts";
import { CUSTOMERS } from "./database.mjs";

const line = { id: "local-office-line", number: "+390000000404" };
const caller = CUSTOMERS[0];
const defaultSettings = { officeSeconds: 15, outboundEnabled: true };
const durations = [5, 10, 15, 20, 30];
const expiry = 60 * 60 * 1000;
const maxTrials = 50;
const validId = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

const phrases = {
  ai: "Buongiorno, sono Giulia, l’assistente virtuale di Edilizia Test Locale. In ufficio non riescono a rispondere. Se vuole, posso richiamarla da questo stesso numero. Le va?",
  consented:
    "Va bene, la richiamo appena chiudiamo. Vedrà sul telefono lo stesso numero dell’ufficio.",
  callback_answered:
    "Buongiorno, sono Giulia, l’assistente virtuale di Edilizia Test Locale. La richiamo come concordato. Mi racconta come posso aiutarla?",
};

function promptFor(trial) {
  if (!trial.settings.outboundEnabled) {
    if (trial.phase === "ai")
      return "Buongiorno, sono Giulia, l’assistente virtuale di Edilizia Test Locale. In ufficio non riescono a rispondere. Vuole che lasci una richiesta di richiamo?";
    if (trial.phase === "consented")
      return "Va bene, lascio la richiesta all’ufficio, così un collega può richiamarla.";
  }
  return phrases[trial.phase] ?? null;
}

export function createPhoneTrials(now = Date.now) {
  const trials = new Map();
  const setup = () => ({
    companyNumber: line.number,
    callerNumber: caller.phone,
    officeGroup: "Ufficio · interno 201",
    defaultSettings,
    durations,
  });

  function report(trial) {
    return {
      ...trial,
      events: [...trial.events],
      prompt: promptFor(trial),
      now: now(),
    };
  }

  function record(trial, phase, label, at = now()) {
    trial.phase = phase;
    trial.version++;
    trial.events.push({ version: trial.version, label, at });
  }

  function read(id) {
    const trial = trials.get(id);
    if (!trial || trial.createdAt + expiry <= now()) {
      trials.delete(id);
      throw new Error("Prova telefonica scaduta o non trovata");
    }
    if (trial.phase === "office_ringing" && trial.deadline <= now()) {
      record(
        trial,
        "ai",
        "Tempo scaduto. L’ufficio non ha risposto, prende la chiamata l’AI.",
        trial.deadline,
      );
    }
    return trial;
  }

  function start({ requestId, officeSeconds, outboundEnabled }) {
    if (
      typeof requestId !== "string" ||
      !validId.test(requestId) ||
      !durations.includes(officeSeconds) ||
      typeof outboundEnabled !== "boolean"
    ) {
      throw new Error("Impostazioni della prova non valide");
    }
    if (trials.has(requestId)) {
      const existing = read(requestId);
      if (
        existing.settings.officeSeconds !== officeSeconds ||
        existing.settings.outboundEnabled !== outboundEnabled
      )
        throw new Error("Impostazioni della prova già avviata");
      return report(existing);
    }
    while (trials.size >= maxTrials) trials.delete(trials.keys().next().value);
    const createdAt = now();
    const trial = {
      id: requestId,
      version: 0,
      phase: "office_ringing",
      settings: { officeSeconds, outboundEnabled },
      createdAt,
      deadline: createdAt + officeSeconds * 1000,
      inbound: { from: caller.phone, to: line.number },
      callback: null,
      events: [
        {
          version: 0,
          label: "Chiamata in entrata. Squilla prima l’ufficio.",
          at: createdAt,
        },
      ],
    };
    trials.set(requestId, trial);
    return report(trial);
  }

  function advance(id, { action, version }) {
    const trial = read(id);
    if (!Number.isInteger(version) || version < 0 || version > trial.version)
      throw new Error("Versione della prova non valida");
    if (version < trial.version) return report(trial);

    if (trial.phase === "office_ringing" && action === "office_answer") {
      record(
        trial,
        "office_answered",
        "L’ufficio ha risposto e gestisce la chiamata.",
      );
    } else if (trial.phase === "office_ringing" && action === "skip_wait") {
      record(
        trial,
        "ai",
        "Mancata risposta simulata. La chiamata passa all’AI.",
      );
    } else if (trial.phase === "ai" && action === "accept_callback") {
      record(trial, "consented", "Il cliente ha accettato il richiamo.");
    } else if (trial.phase === "ai" && action === "decline_callback") {
      record(
        trial,
        "declined",
        "Il cliente ha rifiutato il richiamo. La chiamata è chiusa.",
      );
    } else if (trial.phase === "consented" && action === "hang_up") {
      record(trial, "inbound_ended", "La chiamata in entrata è terminata.");
      if (trial.settings.outboundEnabled) {
        // Use the production request builder, then resolve its line locally.
        // The resulting request is never sent to a carrier or to Fish.
        const request = buildFishOutboundRequest({
          agentId: "local-assistant",
          phoneNumberId: line.id,
          toNumber: trial.inbound.from,
          idempotencyKey: `local-callback-${id}`,
          companyId: "local-company",
        });
        trial.callback = { from: line.number, to: request.body.to_number };
        record(
          trial,
          "callback_ringing",
          "L’AI richiama utilizzando la stessa linea aziendale.",
        );
      } else {
        record(
          trial,
          "callback_blocked",
          "Uscita SIP disabilitata. Il richiamo resta da gestire in ufficio.",
        );
      }
    } else if (
      trial.phase === "callback_ringing" &&
      action === "answer_callback"
    ) {
      record(trial, "callback_answered", "Il cliente ha risposto al richiamo.");
    } else if (
      trial.phase === "callback_ringing" &&
      action === "miss_callback"
    ) {
      record(
        trial,
        "callback_unanswered",
        "Il cliente non ha risposto al richiamo.",
      );
    } else {
      throw new Error("Azione non disponibile per questa fase");
    }
    return report(trial);
  }

  function speech(id, version) {
    const trial = read(id);
    const prompt = promptFor(trial);
    if (version !== trial.version || !prompt)
      throw new Error("Nessuna risposta vocale per questa fase");
    return prompt;
  }

  return { setup, start, advance, snapshot: (id) => report(read(id)), speech };
}
