/** Preserve the pool as event source; route external sync to the reserved member calendar. */
export async function bookingCalendarDestination(db:any,appointment:any,companyId:string){
 if(!appointment.id||!appointment.calendar_id)return appointment;
 const {data:stored,error}=await db.from('appointments').select('booking_member_calendar_id,assigned_to').eq('id',appointment.id).eq('company_id',companyId).maybeSingle();
 if(error)throw error;
 if(!stored?.booking_member_calendar_id){
  if(!stored?.assigned_to)return appointment;
  const {data:pool,error:poolError}=await db.from('marketing_calendars').select('calendar_type').eq('id',appointment.calendar_id).eq('company_id',companyId).maybeSingle();
  if(poolError)throw poolError;
  return pool?.calendar_type==='team'?{...appointment,calendar_id:null,assigned_to:stored.assigned_to}:appointment;
 }
 const {data:member,error:memberError}=await db.from('marketing_calendars').select('id,owner_id').eq('id',stored.booking_member_calendar_id).eq('company_id',companyId).maybeSingle();
 if(memberError)throw memberError;
 if(!member||member.owner_id!==stored.assigned_to)throw Error('Destinazione calendario non coerente con il responsabile');
 return {...appointment,calendar_id:member.id,assigned_to:stored.assigned_to};
}
