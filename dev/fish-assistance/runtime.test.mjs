import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssistanceLab } from "./runtime.mjs";
let savedFetch;
before(() => {
  savedFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("External network forbidden in local lab");
  };
});
after(() => {
  globalThis.fetch = savedFetch;
});
async function open(scenario = "new", dataDir) {
  const lab = await createAssistanceLab({ dataDir });
  const boot = await lab.bootstrap();
  let state = await lab.start({
    requestId: randomUUID(),
    customerId: boot.customers[0].id,
    calendarId: boot.defaultCalendarId,
    scenario,
  });
  return {
    lab,
    boot,
    get state() {
      return state;
    },
    async say(text, requestId = randomUUID()) {
      state = await lab.turn(state.session.id, { requestId, text });
      return state;
    },
  };
}
async function identify(ctx) {
  await ctx.say("La finestra della camera non si chiude bene");
  await ctx.say("No, nessun pericolo immediato");
  await ctx.say(ctx.state.fixture.name);
  await ctx.say(ctx.state.fixture.address);
}
async function saveTicket(ctx) {
  await identify(ctx);
  if (ctx.state.session.phase === "ticket_choice")
    await ctx.say("Nuova segnalazione");
  await ctx.say("Sì, confermo");
}
async function chooseSlot(ctx) {
  await ctx.say("Sì");
  await ctx.say(ctx.boot.defaultDay);
  await ctx.say(ctx.state.session.suggestions[0]);
}
test("local backend saves the real linked journey, separate consent and complete transcript, without any fetch", async () => {
  const ctx = await open();
  try {
    await identify(ctx);
    assert.equal(ctx.state.ticket, null);
    await ctx.say("Sì, non apra il ticket");
    assert.equal(ctx.state.ticket, null);
    await ctx.say("Sì, confermo");
    assert.equal(ctx.state.ticket.customer_id, ctx.state.customer.id);
    assert.equal(ctx.state.appointment, null);
    await chooseSlot(ctx);
    assert.equal(ctx.state.appointment, null);
    const request = randomUUID();
    const result = await ctx.say("Sì, confermo l’appuntamento", request);
    const repeated = await ctx.say("Sì, confermo l’appuntamento", request);
    assert.equal(result.appointment.id, repeated.appointment.id);
    assert.equal(result.session.phase, "done");
    assert.match(result.appointment.appointment_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(
      result.steps.map((s) => s.stato),
      ["fatto", "fatto", "fatto"],
    );
    assert.ok(result.ticket.transcript.length >= 19);
    assert.match(result.appointment.description, new RegExp(result.ticket.id));
    assert.equal(
      (await ctx.lab.db.query("SELECT count(*)::int n FROM appointments"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await ctx.lab.db.query("SELECT count(*)::int n FROM tickets")).rows[0].n,
      1,
    );
    await assert.rejects(
      ctx.say("Testo diverso", request),
      /dati diversi|testo diverso/,
    );
  } finally {
    await ctx.lab.close();
  }
});
test("wrong identity and unknown/ambiguous caller never create business records", async () => {
  const ctx = await open();
  try {
    await ctx.say("La finestra non si chiude bene");
    await ctx.say("No");
    await ctx.say("Altro Cliente");
    await ctx.say("Indirizzo diverso");
    assert.equal(ctx.state.session.phase, "name");
    assert.equal(ctx.state.ticket, null);
    assert.equal(ctx.state.appointment, null);
  } finally {
    await ctx.lab.close();
  }
  for (const scenario of ["unknown", "ambiguous"]) {
    const other = await open(scenario);
    try {
      assert.equal(other.state.session.phase, "needs_office");
      assert.equal(other.state.customer, null);
      assert.equal(
        (await other.lab.db.query("SELECT count(*)::int n FROM tickets"))
          .rows[0].n,
        0,
      );
    } finally {
      await other.lab.close();
    }
  }
});
test("returning caller adds a note to the selected existing ticket and links this conversation", async () => {
  const ctx = await open("returning");
  try {
    await identify(ctx);
    assert.equal(ctx.state.session.phase, "ticket_choice");
    const choice = ctx.state.session.suggestions.find((s) =>
      s.startsWith("Riprendi"),
    );
    await ctx.say(choice);
    await ctx.say("Sì, confermo");
    assert.equal(ctx.state.activity.ticket_action, "updated");
    assert.equal(ctx.state.ticket.notes.length, 1);
    assert.equal(
      (await ctx.lab.db.query("SELECT count(*)::int n FROM tickets")).rows[0].n,
      1,
    );
    assert.ok(ctx.state.ticket.transcript.length > 0);
  } finally {
    await ctx.lab.close();
  }
});
test("a real calendar conflict at confirmation retains the ticket and offers another day", async () => {
  const ctx = await open("collision");
  try {
    await saveTicket(ctx);
    await chooseSlot(ctx);
    await ctx.say("Sì, confermo");
    assert.equal(ctx.state.session.phase, "day");
    assert.equal(ctx.state.appointment, null);
    assert.ok(ctx.state.ticket.id);
    assert.equal(ctx.state.activity.reason, "booking");
    assert.equal(
      (await ctx.lab.db.query("SELECT count(*)::int n FROM appointments"))
        .rows[0].n,
      1,
    );
  } finally {
    await ctx.lab.close();
  }
});
test("no slots can finish in the office queue, and immediate danger does not create a routine ticket", async () => {
  const ctx = await open("no_slots");
  try {
    await saveTicket(ctx);
    await ctx.say("Sì");
    await ctx.say(ctx.boot.defaultDay);
    assert.equal(ctx.state.session.phase, "day");
    await ctx.say("Lascia all’ufficio");
    assert.equal(ctx.state.session.phase, "needs_office");
    assert.ok(ctx.state.ticket);
    assert.equal(ctx.state.appointment, null);
  } finally {
    await ctx.lab.close();
  }
  const danger = await open();
  try {
    await danger.say("C’è un problema alla finestra");
    await danger.say("Sì, serve una persona");
    assert.equal(danger.state.session.phase, "needs_office");
    assert.equal(danger.state.ticket, null);
  } finally {
    await danger.lab.close();
  }
});
test("file-backed PostgreSQL resumes saved sessions after closing and reopening the backend", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eic-assistance-local-"));
  let lab;
  try {
    const ctx = await open("new", join(dir, "nested", "postgres"));
    lab = ctx.lab;
    await saveTicket(ctx);
    const id = ctx.state.session.id,
      ticket = ctx.state.ticket.id;
    await lab.close();
    lab = await createAssistanceLab({
      dataDir: join(dir, "nested", "postgres"),
    });
    const restored = await lab.snapshot(id);
    assert.equal(restored.ticket.id, ticket);
    assert.equal(restored.session.phase, "appointment_choice");
    assert.ok(restored.ticket.transcript.length > 0);
  } finally {
    await lab?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
