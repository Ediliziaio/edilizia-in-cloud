/**
 * Generates the UTM tracking snippet for embedding on external websites.
 * V4: Uses localStorage/sessionStorage, captures all click IDs,
 * persists UTM across pages, exposes window._attrSessionId.
 */
export function getTrackingSnippet(companyId: string, supabaseUrl: string): string {
  return `<!-- UTM Attribution Tracking V4 -->
<script>
(function(){
  var COMPANY_ID = "${companyId}";
  var ENDPOINT = "${supabaseUrl}/functions/v1/attribution-capture";

  function uuid(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
      var r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16);
    });
  }

  // Visitor ID — persistent in localStorage (365 days equivalent)
  var visitorId=localStorage.getItem('_attr_vid');
  if(!visitorId){visitorId=uuid();localStorage.setItem('_attr_vid',visitorId);}

  // Session ID — sessionStorage (cleared on tab close)
  var sessionId=sessionStorage.getItem('_attr_sid');
  var isNewSession=!sessionId;
  if(!sessionId){sessionId=uuid();sessionStorage.setItem('_attr_sid',sessionId);}

  // Expose globally for form submissions
  window._attrSessionId=sessionId;
  window._attrVisitorId=visitorId;

  var params=new URLSearchParams(window.location.search);

  // Persist UTM params in localStorage for multi-page navigation
  var utmKeys=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  utmKeys.forEach(function(k){
    var v=params.get(k);
    if(v){localStorage.setItem('_attr_'+k,v);}
  });

  // Read UTM — prefer URL params, fallback to stored
  function getUtm(k){return params.get(k)||localStorage.getItem('_attr_'+k)||null;}

  var payload={
    company_id:COMPANY_ID,
    session_id:sessionId,
    visitor_id:visitorId,
    landing_url:window.location.href,
    landing_page:window.location.pathname,
    referrer:document.referrer||null,
    user_agent:navigator.userAgent||null,
    utm_source:getUtm('utm_source'),
    utm_medium:getUtm('utm_medium'),
    utm_campaign:getUtm('utm_campaign'),
    utm_content:getUtm('utm_content'),
    utm_term:getUtm('utm_term'),
    gclid:params.get('gclid'),
    fbclid:params.get('fbclid'),
    ttclid:params.get('ttclid'),
    msclkid:params.get('msclkid'),
    li_fat_id:params.get('li_fat_id')
  };

  // Send if there's attribution data or it's a new session
  var hasAttribution=payload.utm_source||payload.gclid||payload.fbclid||payload.ttclid||payload.msclkid||payload.li_fat_id;
  if(hasAttribution||isNewSession){
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
