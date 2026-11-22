import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalFishVoice } from "./voice.mjs";
import { localSpokenInput } from "./spoken-input.mjs";
import { createAssistanceLab } from "./runtime.mjs";
import { createAssistanceHttpServer } from "./server.mjs";

test("speech uses only Drama 3 and the fixed Italian voice; replay and ASR retries use a bounded cache", async () => {
  const requests = [];
  const voice = createLocalFishVoice(
    "private-test-key",
    async (url, options) => {
      requests.push({ url, options });
      return url.endsWith("/tts")
        ? new Response(Buffer.alloc(200), {
            headers: { "Content-Type": "audio/mpeg" },
          })
        : Response.json({ text: "Sì, confermo.", duration: 2, segments: [] });
    },
  );
  assert.equal(voice.status().model, "drama-3");
  assert.ok(!JSON.stringify(voice.status()).includes("private-test-key"));
  await voice.speech("Buongiorno");
  await voice.speech("Buongiorno");
  const first = requests[0];
  assert.equal(first.url, "https://api.fish.audio/v1/tts");
  assert.equal(first.options.headers.model, "drama-3");
  assert.equal(
    JSON.parse(first.options.body).reference_id,
    "0e36e185d0654d5bac3d24331562a0cc",
  );
  assert.equal(first.options.redirect, "error");
  assert.equal(requests.length, 1);
  const audio = Buffer.alloc(200, 1);
  assert.equal(
    (await voice.transcribe(audio, "audio/webm")).text,
    "Sì, confermo.",
  );
  await voice.transcribe(audio, "audio/webm");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, "https://api.fish.audio/v1/asr");
  assert.equal(requests[1].options.headers.model, "transcribe-1");
  assert.ok(requests[1].options.body instanceof FormData);
  await assert.rejects(voice.transcribe(audio, "text/html"));
  assert.equal(requests.length, 2);
});

test("speech failure is explicit with no fallback and never echoes provider secrets", async () => {
  const voice = createLocalFishVoice(
    "private-test-key",
    async () => new Response("secret upstream body", { status: 402 }),
  );
  await assert.rejects(
    voice.speech("Buongiorno"),
    (e) =>
      /Credito Fish insufficiente/.test(e.message) &&
      !e.message.includes("secret"),
  );
  await assert.rejects(
    createLocalFishVoice().speech("Buongiorno"),
    /FISH_API_KEY/,
  );
});

test("voice HTTP reads only saved agent replies and transcription never advances a case or grants consent", async () => {
  const lab = await createAssistanceLab();
  const calls = [];
  const voice = {
    status: () => ({ configured: true, model: "drama-3" }),
    speech: async (text) => {
      calls.push(text);
      return Buffer.alloc(200);
    },
    transcribe: async () => ({ text: "Sì, confermo", duration: 2 }),
  };
  const server = createAssistanceHttpServer(lab, { voice });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base =
    "http://127.0.0.1:" + server.address().port + "/__local-assistance";
  try {
    const boot = await (await fetch(base + "/bootstrap")).json();
    const headers = {
      "X-Local-Assistance-Token": boot.token,
      "Content-Type": "application/json",
    };
    let state = await lab.start({
      requestId: randomUUID(),
      customerId: boot.customers[0].id,
      calendarId: boot.defaultCalendarId,
      scenario: "new",
    });
    const session = base + "/sessions/" + state.session.id;
    assert.equal(
      (
        await fetch(session + "/speech", {
          method: "POST",
          headers,
          body: JSON.stringify({ text: "arbitrary text", model: "other" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(session + "/speech", {
          method: "POST",
          headers,
          body: JSON.stringify({ messageId: randomUUID() }),
        })
      ).status,
      400,
    );
    const audio = await fetch(session + "/speech", {
      method: "POST",
      headers,
      body: JSON.stringify({ messageId: state.session.messages[0].id }),
    });
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get("X-Fish-Speech-Model"), "drama-3");
    assert.equal(calls[0], state.session.messages[0].text);
    for (const text of [
      "La finestra non si chiude",
      "No",
      "Mi chiamo Mario Prova.",
      "Via dei Collaudi dieci, Città Test.",
    ])
      state = await lab.turn(state.session.id, {
        requestId: randomUUID(),
        text,
      });
    assert.equal(state.session.phase, "ticket_confirmation");
    assert.equal(state.ticket, null);
    const before = state.session.messages.length;
    const result = await fetch(session + "/transcribe", {
      method: "POST",
      headers: { ...headers, "Content-Type": "audio/webm;codecs=opus" },
      body: Buffer.alloc(200),
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).text, "Sì, confermo");
    state = await lab.snapshot(state.session.id);
    assert.equal(state.ticket, null);
    assert.equal(state.session.messages.length, before);
    assert.equal(
      (
        await fetch(session + "/transcribe", {
          method: "POST",
          headers: {
            ...headers,
            Origin: "https://example.com",
            "Content-Type": "audio/webm",
          },
          body: Buffer.alloc(200),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(session + "/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await lab.close();
  }
});

test("spoken inputs support explicit identity, dates and times without interpreting negative replies as a slot", () => {
  assert.equal(
    localSpokenInput("name", "Mi chiamo Mario Prova."),
    "Mario Prova",
  );
  assert.equal(
    localSpokenInput("address", "Abito in Via dei Collaudi dieci, Città Test."),
    "Via dei Collaudi 10, Città Test",
  );
  assert.equal(localSpokenInput("day", "Domani."), "Domani");
  assert.equal(
    localSpokenInput("day", "Il diciotto novembre 2026."),
    "2026-11-18",
  );
  assert.equal(localSpokenInput("slot", "Alle nove e mezza."), "09:30");
  assert.equal(localSpokenInput("slot", "Non alle nove."), "Non alle nove");
  assert.equal(
    localSpokenInput("ticket_confirmation", "No, non confermo."),
    "No, non confermo",
  );
});
