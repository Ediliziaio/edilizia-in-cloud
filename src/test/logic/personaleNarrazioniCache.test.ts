import {expect,it} from 'vitest';
import {computeDerivedReport,CACHE_VERSION} from '@/features/talent-profile/lib/reportCache';
it('genera narrazioni personalizzate anziché scartarle per argomenti mancanti',()=>{
 const traits=Object.fromEntries(['ORG','AUT','GP','ADS','DET','VEN','HRM','LDR','PRO','COM','ESP','RC','FIN','SUC','PRI'].map(k=>[k,60]));
 const report=computeDerivedReport({traits,candidateName:'Persona Demo',candidateSesso:null as null,syndromes:[]});
 expect(Object.keys(report.trait_narratives)).toHaveLength(15);
 for(const narrative of Object.values(report.trait_narratives)){expect(narrative.testo.length).toBeGreaterThan(0);expect(narrative.testo).not.toContain('[Nome]');expect(narrative.testo).not.toContain('undefined');}
 expect(CACHE_VERSION).toBeGreaterThan(1);
});
