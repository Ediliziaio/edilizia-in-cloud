/**
 * Generates the UTM tracking snippet for embedding on external websites.
 * This script captures UTM parameters, click IDs, and visitor data,
 * then sends them to the attribution-capture edge function.
 */
export function getTrackingSnippet(companyId: string, supabaseUrl: string): string {
  return `<!-- UTM Attribution Tracking -->
<script>
(function(){
  var COMPANY_ID = "${companyId}";
  var ENDPOINT = "${supabaseUrl}/functions/v1/attribution-capture";

  function uuid(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
      var r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16);
    });
  }

  function getCookie(n){
    var m=document.cookie.match(new RegExp('(^| )'+n+'=([^;]+)'));
    return m?m[2]:null;
  }

  function setCookie(n,v,d){
    var e=new Date();e.setTime(e.getTime()+d*864e5);
    document.cookie=n+'='+v+';expires='+e.toUTCString()+';path=/;SameSite=Lax';
  }

  var visitorId=getCookie('_attr_vid');
  if(!visitorId){visitorId=uuid();setCookie('_attr_vid',visitorId,365);}

  var sessionId=getCookie('_attr_sid');
  if(!sessionId){sessionId=uuid();setCookie('_attr_sid',sessionId,0.02);}

  var params=new URLSearchParams(window.location.search);
  var payload={
    company_id:COMPANY_ID,
    session_id:sessionId,
    visitor_id:visitorId,
    landing_page:window.location.pathname,
    referrer:document.referrer||null,
    utm_source:params.get('utm_source'),
    utm_medium:params.get('utm_medium'),
    utm_campaign:params.get('utm_campaign'),
    utm_content:params.get('utm_content'),
    utm_term:params.get('utm_term'),
    gclid:params.get('gclid'),
    fbclid:params.get('fbclid')
  };

  // Only send if there's attribution data or it's a new session
  if(payload.utm_source||payload.gclid||payload.fbclid||!getCookie('_attr_sent_'+sessionId)){
    setCookie('_attr_sent_'+sessionId,'1',0.02);
    fetch(ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      keepalive:true
    }).catch(function(){});
  }
})();
</script>`;
}
