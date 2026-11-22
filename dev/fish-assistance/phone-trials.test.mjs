import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPhoneTrials } from "./phone-trials.mjs";
import { createAssistanceHttpServer } from "./server.mjs";

test("an office answer wins before the deadline and cannot become an AI callback", () => {
  let now = 0;
  const lab = createPhoneTrials(() => now);
  const initial = lab.start({
    requestId: randomUUID(),
    officeSeconds: 15,
    outboundEnabled: true,
  });
  now = 14_999;
  const answered = lab.advance(initial.id, {
    version: initial.version,
    action: "office_answer",
  });
  now = 20_000;
  assert.equal(lab.snapshot(initial.id).phase, "office_answered");
  assert.equal(answered.callback, null);
  assert.throws(() =>
    lab.advance(initial.id, {
      version: answered.version,
      action: "accept_callback",
    }),
  );
});

test("the office deadline wins over a late answer, and consent plus hangup starts one callback from the inbound line", () => {
  let now = 0;
  const lab = createPhoneTrials(() => now);
  const settings = {
    requestId: randomUUID(),
    officeSeconds: 15,
    outboundEnabled: true,
  };
  const initial = lab.start(settings);
  assert.equal(lab.start(settings).id, initial.id);
  assert.throws(() => lab.start({ ...settings, officeSeconds: 10 }));
  now = 15_000;
  const ai = lab.advance(initial.id, {
    version: initial.version,
    action: "office_answer",
  });
  assert.equal(ai.phase, "ai");
  assert.match(lab.speech(initial.id, ai.version), /stesso numero/);
  assert.throws(() =>
    lab.advance(initial.id, { version: ai.version, action: "hang_up" }),
  );
  const consent = lab.advance(initial.id, {
    version: ai.version,
    action: "accept_callback",
  });
  assert.equal(consent.callback, null);
  const action = { version: consent.version, action: "hang_up" };
  const callback = lab.advance(initial.id, action);
  assert.equal(callback.phase, "callback_ringing");
  assert.deepEqual(callback.callback, {
    from: initial.inbound.to,
    to: initial.inbound.from,
  });
  assert.deepEqual(lab.advance(initial.id, action).events, callback.events);
  assert.equal(
    lab.advance(initial.id, {
      version: callback.version,
      action: "answer_callback",
    }).phase,
    "callback_answered",
  );
});

test("declining callback or disabling SIP outbound cannot produce a callback", () => {
  const lab = createPhoneTrials();
  const initial = lab.start({
    requestId: randomUUID(),
    officeSeconds: 5,
    outboundEnabled: false,
  });
  const ai = lab.advance(initial.id, {
    version: initial.version,
    action: "skip_wait",
  });
  const consent = lab.advance(initial.id, {
    version: ai.version,
    action: "accept_callback",
  });
  assert.match(consent.prompt, /richiesta all’ufficio/);
  const blocked = lab.advance(initial.id, {
    version: consent.version,
    action: "hang_up",
  });
  assert.equal(blocked.phase, "callback_blocked");
  assert.equal(blocked.callback, null);

  const second = lab.start({
    requestId: randomUUID(),
    officeSeconds: 5,
    outboundEnabled: true,
  });
  const secondAi = lab.advance(second.id, { version: 0, action: "skip_wait" });
  const declined = lab.advance(second.id, {
    version: secondAi.version,
    action: "decline_callback",
  });
  assert.equal(declined.phase, "declined");
  assert.equal(declined.callback, null);
});

test("local phone HTTP accepts only fixture settings and can speak only the selected trial prompt", async () => {
  const spoken = [];
  const server = createAssistanceHttpServer(
    { bootstrap: () => ({ mode: "local", productionConnected: false }) },
    {
      voice: {
        status: () => ({ configured: true }),
        speech: async (text) => {
          spoken.push(text);
          return Buffer.alloc(200);
        },
      },
    },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/__local-assistance`;
  try {
    const boot = await fetch(base + "/bootstrap").then((response) =>
      response.json(),
    );
    const post = (
      path,
      body,
      headers = { "X-Local-Assistance-Token": boot.token },
    ) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    const settings = {
      requestId: randomUUID(),
      ...boot.phoneSetup.defaultSettings,
    };
    assert.equal((await post("/phone-trials", settings, {})).status, 403);
    assert.equal(
      (await post("/phone-trials", { ...settings, to: "+390000000999" }))
        .status,
      400,
    );
    const { trial } = await post("/phone-trials", settings).then((response) =>
      response.json(),
    );
    const path = "/phone-trials/" + trial.id;
    assert.equal(trial.inbound.to, boot.phoneSetup.companyNumber);
    assert.equal((await post(path + "/speech", { version: 0 })).status, 400);
    const { trial: ai } = await post(path, {
      version: 0,
      action: "skip_wait",
    }).then((response) => response.json());
    assert.equal(
      (await post(path + "/speech", { version: ai.version, text: "arbitrary" }))
        .status,
      400,
    );
    const audio = await post(path + "/speech", { version: ai.version });
    assert.equal(audio.headers.get("X-Fish-Speech-Model"), "drama-3");
    assert.deepEqual(spoken, [ai.prompt]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
