import{describe,it,expect}from'vitest';
import{normalizeFishTranscript}from'../../../supabase/functions/_shared/fishTranscript';
describe('Spoken transcript boundary',()=>{
 it('keeps spoken roles and drops tool metadata and private fields',()=>{expect(normalizeFishTranscript([{segmentId:'a',role:'agent',text:' Buongiorno ',final:true,token:'private',tool:{secret:'private'}}])).toEqual([{segment_id:'a',role:'agent',text:'Buongiorno',final:true}]);});
 it.each([
 {name:'tool roles',segments:[{segmentId:'a',role:'tool',text:'secret'}]},
 {name:'duplicate segment ids',segments:[{segmentId:'a',role:'user',text:'ok'},{segmentId:'a',role:'user',text:'duplicate'}]},
 {name:'unbounded text',segments:[{segmentId:'a',role:'user',text:'x'.repeat(8001)}]}
 ])('rejects $name',({segments})=>{expect(()=>normalizeFishTranscript(segments)).toThrow();});
});
