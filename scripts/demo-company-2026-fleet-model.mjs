/** Pure fleet renewal plan. No database access; old documents and interventions survive. */
export function fleetRenewals(data, { asOf, marker, uid }) {
  if (!/^2026-\d{2}-\d{2}$/.test(asOf)) throw Error('2026 reference date required');
  const assets = new Map(data.mezzi.filter(m=>!m.deleted_at).map(m=>[m.id,m]));
  const documents=[], maintenance=[], scheduled=[], missing=[];
  for (const deadline of data.deadlines) {
    if (!assets.has(deadline.mezzo_id)) throw Error('Deadline without active asset');
    const asset=assets.get(deadline.mezzo_id);
    if (deadline.stato==='in_scadenza') {
      scheduled.push({asset,deadline,date:deadline.data_scadenza});
      continue;
    }
    if(deadline.stato!=='scaduto') continue;
    if(deadline.origine==='documento') {
      const old=data.mezzi_documenti.find(d=>d.id===deadline.riferimento_id);
      if(!old||old.categoria==='altro') throw Error('Unsupported renewal; human review required');
      const start=old.data_scadenza.startsWith('2025-')?'2026-01-01':old.data_scadenza;
      const due=old.data_scadenza.startsWith('2025-')?'2026-12-31':'2027'+old.data_scadenza.slice(4);
      if(start>asOf||due<=asOf) throw Error('Renewal must already be effective and remain valid');
      documents.push({previous:old.id,row:{id:uid('fleet-renewal-'+old.id),company_id:asset.company_id,mezzo_id:asset.id,
        categoria:old.categoria,titolo:`DEMO 2026 · ${old.categoria} · ${asset.nome}`,
        ente:'Simulazione interna, nessun ente o assicuratore reale',importo:old.importo,
        data_inizio:start,data_scadenza:due,alert_giorni_prima:30,
        file_path:null,file_name:null,note:`${marker} Rinnovo sintetico del documento ${old.id}. Nessuna polizza o certificazione reale. Importo per la stima del mezzo, non nuovo pagamento.`}});
    } else if(deadline.origine==='manutenzione') {
      const old=data.mezzi_manutenzioni.find(d=>d.id===deadline.riferimento_id);
      if(!old||!deadline.data_scadenza) throw Error('Mileage-only overdue service requires manual review');
      const date=deadline.data_scadenza;
      if(date>asOf||!date.startsWith('2026-')) throw Error('Actual maintenance must belong to elapsed 2026');
      maintenance.push({previous:old.id,asset,row:{id:uid('fleet-service-'+old.id),company_id:asset.company_id,mezzo_id:asset.id,
        tipo:old.tipo,data:date,costo:Number(old.costo??(asset.tipo==='furgone'?480:120)),contatore:asset.contatore==null?null:Math.round(Number(asset.contatore)*.9),
        officina:'Officina DEMO — intervento fittizio',prossima_data:'2027'+date.slice(4),
        prossimo_contatore:asset.contatore==null?null:Number(asset.contatore)+(asset.contatore_unita==='ore'?500:15000),
        descrizione:`${marker} Manutenzione simulata eseguita nel 2026; storico ${old.id} conservato. Nessuna certificazione reale.`}});
    } else throw Error('Unknown deadline source');
  }
  // Documents needed for demo vans, not imaginary warranties for generic tools.
  for(const asset of assets.values()) {
    if(asset.tipo!=='furgone'||asset.stato!=='in_servizio') continue;
    const required=['assicurazione','revisione',...(['leasing','noleggio_lungo'].includes(asset.possesso)?['contratto']:[]),...(asset.possesso==='proprieta'?['bollo']:[])];
    for(const category of required) {
      if(data.mezzi_documenti.some(d=>d.mezzo_id===asset.id&&d.categoria===category))continue;
      const due=category==='bollo'?'2026-12-31':category==='contratto'?'2027-12-31':'2027-06-30';
      missing.push({id:uid('fleet-missing-'+asset.id+'-'+category),company_id:asset.company_id,mezzo_id:asset.id,
        categoria:category,titolo:`DEMO 2026 · ${category} · ${asset.nome}`,ente:'Simulazione DEMO, non documento legale',
        importo:category==='contratto'?null:0,data_inizio:'2026-01-01',data_scadenza:due,alert_giorni_prima:30,
        file_path:null,file_name:null,note:`${marker} Esempio operativo sintetico; nessun certificato, polizza o pagamento reale. ${['leasing','noleggio_lungo'].includes(asset.possesso)?'Costi da contratto; non duplicare il canone.':'Importo da dettagliare nella simulazione economica.'}`});
    }
  }
  return {documents,maintenance,scheduled,missing};
}
