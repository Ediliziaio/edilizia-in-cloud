import { test } from "node:test";
import assert from "node:assert/strict";
import { contaErrori, nuoveViolazioni } from "../eslint-ratchet.mjs";

test("una riduzione globale non nasconde errori nuovi in altri file o regole",()=>{
  const baseline={"a.ts|react-hooks/refs":30};
  assert.deepEqual(nuoveViolazioni({"a.ts|react-hooks/refs":20},baseline),[]);
  assert.equal(nuoveViolazioni({"a.ts|react-hooks/refs":20,"b.ts|react-hooks/refs":1},baseline).length,1);
  assert.equal(nuoveViolazioni({"a.ts|react-hooks/set-state-in-effect":1},baseline).length,1);
  assert.equal(nuoveViolazioni({"a.ts|react-hooks/refs":31},baseline).length,1);
});
test("confronta percorsi relativi, conta gli errori parser e non trasforma avvisi in errori",()=>{
  assert.deepEqual(contaErrori([{filePath:"/repo/src/a.ts",messages:[
    {severity:2,ruleId:"regola"},{severity:1,ruleId:"avviso"},{severity:2,ruleId:null},
  ]}],"/repo"),{"src/a.ts|errore-parser":1,"src/a.ts|regola":1});
});
