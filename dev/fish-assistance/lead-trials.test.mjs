import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createLeadTrials } from "./lead-trials.mjs";
import { createAssistanceLab } from "./runtime.mjs";

const confirm = (question) => [
  { role: "agent", text: question, final: true },
  { role: "user", text: "Sì, confermo.", final: true },
];

test("lead actions persist on the verified CRM records with consent, without duplicate writes", async () => {
  const lab = await createAssistanceLab();
  try {
    const lead = await createLeadTrials(lab.db);
    const { name, phone, day } = lead.setup();
    const id = await lead.createRecord("lead_appointment");
    await lab.db.query(
      `INSERT INTO marketing_contacts (id, company_id, phone)
       SELECT $1, company_id, to_number FROM ai_fish_calls WHERE id=$2`,
      [randomUUID(), id],
    );
    const booking = {
      tool: "fissa_appuntamento",
      parameters: {
        data: day,
        ora: "10:00",
        motivo: "Sopralluogo per cinque finestre",
        nome: name,
        comune: "Brescia",
        indirizzo: "Via Roma 25",
        contact_id: "untrusted",
      },
      transcript: confirm("È un buon momento?"),
    };
    assert.equal((await lead.execute(id, booking)).creato, false);
    assert.equal((await lead.snapshot(id)).appointment, null);

    booking.transcript = confirm(
      "Posso prenotare il sopralluogo alle dieci e annotarlo per l’ufficio?",
    );
    const stored = await lead.execute(id, booking);
    const retry = await lead.execute(id, booking);
    assert.equal(stored.creato, true);
    assert.equal(retry.appointment_id, stored.appointment_id);

    const outcome = {
      tool: "aggiorna_opportunita",
      parameters: {
        esito: "interessato",
        nota: "Interessata a cinque finestre",
        prossimo_passo: "Sopralluogo confermato",
        confermato: "si",
      },
      transcript: booking.transcript,
    };
    assert.equal((await lead.execute(id, outcome)).aggiornata, true);
    await lead.saveTranscript(id, booking.transcript);
    const saved = await lead.snapshot(id);
    assert.equal(saved.appointment.contact_id, saved.contact.id);
    assert.equal(saved.appointment.opportunity_id, saved.opportunityId);
    assert.equal(saved.outcome.opportunity_id, saved.opportunityId);
    assert.equal(saved.outcome.next_action, "Sopralluogo confermato");
    assert.deepEqual(saved.transcript, booking.transcript);

    const callbackId = await lead.createRecord("lead_handoff");
    const callback = {
      tool: "richiesta_richiamo",
      parameters: {
        nome: name,
        motivo: "Operatore non disponibile",
        recapito: phone,
      },
      transcript: confirm("Posso registrare un richiamo su questo recapito?"),
    };
    assert.equal((await lead.execute(callbackId, callback)).creato, false);
    const transfer = (id, esito) => lead.execute(id, {
      tool: "passa_a_operatore", parameters: { esito },
    });
    const connected = await lead.createRecord("lead_handoff");
    await transfer(connected, "accepted");
    assert.equal((await lead.execute(connected, callback)).creato, false);
    await transfer(callbackId, "no_answer");
    assert.equal((await lead.execute(callbackId, {
      ...callback, transcript: confirm("Vuole un richiamo per il preventivo?"),
    })).creato, false);
    assert.equal((await lead.execute(callbackId, {
      ...callback,
      transcript: [callback.transcript[0], { role: "user", text: "No, non mi richiami.", final: true }],
    })).creato, false);
    assert.equal((await lead.snapshot(callbackId)).callback, null);
    assert.equal(
      (await lead.execute(callbackId, {
        ...callback,
        parameters: { ...callback.parameters, recapito: "+390000000099" },
      })).creato,
      false,
    );
    const [task, duplicate] = await Promise.all([
      lead.execute(callbackId, callback),
      lead.execute(callbackId, {
        ...callback,
        parameters: { ...callback.parameters, motivo: "Disponibilità per preventivo" },
      }),
    ]);
    assert.equal(task.creato, true);
    assert.equal(duplicate.task_id, task.task_id);
    const fullTranscript = [...callback.transcript, { role: "agent", text: "Il richiamo è registrato.", final: true }];
    await lead.saveTranscript(callbackId, fullTranscript);
    const callbackSaved = await lead.snapshot(callbackId);
    assert.equal(callbackSaved.callback.id, task.task_id);
    assert.equal(callbackSaved.callback.contact_id, saved.contact.id);
    assert.equal(callbackSaved.callback.fish_call_id, callbackId);
    assert.ok(callbackSaved.callback.notes.includes(phone));
    assert.equal(callbackSaved.appointment, null);
    assert.deepEqual(callbackSaved.transcript, fullTranscript);
    assert.equal(callbackSaved.call.contact_id, saved.contact.id);
    assert.ok(callbackSaved.call.terminata_il);
    assert.equal((await lab.db.query("SELECT id FROM tasks WHERE fish_call_id=$1", [callbackId])).rows.length, 1);
    assert.equal((await lab.db.query(`SELECT has_function_privilege(
      'authenticated', 'public.fish_save_callback(uuid,uuid,text,uuid,uuid,text,text,date,text)', 'EXECUTE'
    ) AS allowed`)).rows[0].allowed, false);
  } finally {
    await lab.db.close();
  }
});
