import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { avviaPreviewPrerender, chiudiPreviewPrerender } from "../prerender-preview.mjs";

test("rifiuta la preview estranea, serve solo la nostra build e libera la porta", async () => {
  const root = await mkdtemp(join(tmpdir(), "eic-preview-"));
  const estraneo = createServer((_req,res)=>res.end("build estranea"));
  let nostra;
  try {
    await mkdir(join(root,"dist"));
    await writeFile(join(root,"dist","index.html"),"build corretta");
    await new Promise(resolve=>estraneo.listen(0,"127.0.0.1",resolve));
    const port=estraneo.address().port;
    await assert.rejects(avviaPreviewPrerender(root,port,false),/already in use/);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(),"build estranea");
    estraneo.closeAllConnections();
    await new Promise(resolve=>estraneo.close(resolve));
    nostra=await avviaPreviewPrerender(root,port,false);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(),"build corretta");
    await chiudiPreviewPrerender(nostra); nostra=undefined;
    await assert.rejects(fetch(`http://127.0.0.1:${port}`));
  } finally {
    estraneo.closeAllConnections(); estraneo.close();
    if(nostra)await chiudiPreviewPrerender(nostra);
    await rm(root,{recursive:true,force:true});
  }
});
