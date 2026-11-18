/* EIC analytics loader v1. Basic consent: no Google request before analytics opt-in.
 * The GTM container must apply consent through the companion native consent template.
 * This file never sends page_view, form values, user data, or server-side events.
 */
(function (w, d) {
  'use strict';
  if (!w || !d) return;
  var KEY = '__EIC_ANALYTICS_RUNTIME_V1__';
  if (w[KEY]) {
    if (w.EIC_ANALYTICS_CONFIG) w[KEY].configure(w.EIC_ANALYTICS_CONFIG);
    return;
  }

  var config = null;
  var choice = { analytics: false, marketing: false };
  var consentSeen = false;
  var listeners = [];
  var script = null;
  var requested = false;
  var loaded = false;
  var reloadRequired = false;
  var fatalConflict = false;
  var status = 'disabled';
  var reason = 'missing-configuration';
  var defaultExcluded = ['/api', '/auth', '/app', '/account', '/admin', '/dashboard'];

  function consentState() {
    var permitted = !!config && !reloadRequired && !scopeReason();
    var ads = !!(permitted && config.allowMarketingConsent && choice.marketing);
    return {
      analytics_storage: permitted && choice.analytics ? 'granted' : 'denied',
      ad_storage: ads ? 'granted' : 'denied',
      ad_user_data: ads ? 'granted' : 'denied',
      ad_personalization: ads ? 'granted' : 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted'
    };
  }

  function placeholder(id) {
    return /(?:PLACEHOLDER|REPLACE|YOUR|TODO|TBD|EXAMPLE)/.test(id) || /-(?:X+|0+)$/.test(id);
  }

  function normalizeHost(value) {
    if (typeof value !== 'string') return '';
    var host = value.trim().toLowerCase();
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ? host : '';
  }

  function blockedHost(host) {
    return !host || /(?:^|\.)(?:localhost|local|test|invalid|example)$/.test(host) || /(?:^|\.)vercel\.app$/.test(host);
  }

  function pathList(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(function (p) { return typeof p === 'string' && /^\/[^?#]*$/.test(p); })
      .map(function (p) { return p.length > 1 ? p.replace(/\/+$/, '') : p; });
  }

  function validate(value) {
    if (!value || value.enabled !== true) return null;
    var containerId = typeof value.containerId === 'string' ? value.containerId.trim().toUpperCase() : '';
    var measurementId = typeof value.measurementId === 'string' ? value.measurementId.trim().toUpperCase() : '';
    var hosts = Array.isArray(value.allowedHosts) ? value.allowedHosts.map(normalizeHost) : [];
    if (!/^GTM-[A-Z0-9]{4,20}$/.test(containerId) || placeholder(containerId)) return null;
    if (!/^G-[A-Z0-9]{5,20}$/.test(measurementId) || placeholder(measurementId)) return null;
    if (!hosts.length || hosts.some(function (h) { return blockedHost(h); })) return null;
    return {
      containerId: containerId,
      measurementId: measurementId,
      allowedHosts: hosts,
      excludedPathPrefixes: defaultExcluded.concat(pathList(value.excludedPathPrefixes)),
      allowedPathPrefixes: pathList(value.allowedPathPrefixes),
      allowMarketingConsent: value.allowMarketingConsent === true,
      reloadOnRevoke: value.reloadOnRevoke !== false,
      siteName: typeof value.siteName === 'string' ? value.siteName.slice(0, 100) : ''
    };
  }

  function matchesPath(path, prefix) {
    return prefix === '/' ? path === '/' : path === prefix || path.indexOf(prefix + '/') === 0;
  }

  function scopeReason() {
    if (!config) return 'invalid-or-disabled-configuration';
    if (fatalConflict) return 'tracking-conflict';
    if (w.EICAnalyticsBoundary && typeof w.EICAnalyticsBoundary.getState === 'function') {
      try { if (w.EICAnalyticsBoundary.getState().transitioning === true) return 'document-boundary'; }
      catch (_) { return 'boundary-state-unavailable'; }
    }
    var host = String(w.location.hostname || '').toLowerCase();
    if (w.location.protocol !== 'https:' || blockedHost(host) || config.allowedHosts.indexOf(host) < 0) return 'host-not-allowed';
    var path;
    try { path = decodeURIComponent(w.location.pathname || '/'); } catch (_) { return 'invalid-path'; }
    if (path.indexOf('@') >= 0 || /[\r\n]/.test(path)) return 'sensitive-path';
    if (config.excludedPathPrefixes.some(function (p) { return matchesPath(path, p); })) return 'private-path';
    if (config.allowedPathPrefixes.length && !config.allowedPathPrefixes.some(function (p) { return matchesPath(path, p); })) return 'path-not-allowed';
    // Common contact/auth parameters are never an analytics landing page.
    if (/(?:^|[?&])(?:email|e-mail|mail|phone|telephone|telefono|nome|name|firstname|lastname|address|indirizzo|token|access_token|code|password)=/i.test(w.location.search || '')) return 'sensitive-query';
    return '';
  }

  function disableGa(disabled) {
    if (config) w['ga-disable-' + config.measurementId] = disabled;
  }

  function notifyConsent(includeListeners) {
    if (includeListeners !== false) listeners.slice().forEach(function (callback) {
      try { callback(consentState()); } catch (_) { /* GTM retains denied defaults if its callback fails. */ }
    });
    if (requested && Array.isArray(w.dataLayer)) {
      var consent = consentState();
      w.dataLayer.push({
        event: 'eic_consent_update',
        eic_analytics_storage: consent.analytics_storage,
        eic_ad_storage: consent.ad_storage,
        eic_ad_user_data: consent.ad_user_data,
        eic_ad_personalization: consent.ad_personalization
      });
    }
  }

  function clearAnalyticsCookies() {
    var names = String(d.cookie || '').split(';').map(function (part) { return part.split('=')[0].trim(); })
      .filter(function (name) { return /^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name); });
    var parts = String(w.location.hostname || '').split('.');
    var domains = [''];
    for (var i = 0; i < parts.length - 1; i++) {
      var domain = parts.slice(i).join('.');
      domains.push(domain, '.' + domain);
    }
    names.forEach(function (name) {
      domains.forEach(function (domain) {
        d.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax; Secure' + (domain ? '; Domain=' + domain : '');
      });
    });
  }

  function existingGoogleTag() {
    var scripts = d.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i] === script || !scripts[i].src) continue;
      try {
        var url = new URL(scripts[i].src, w.location.href);
        if (/^(?:www\.)?googletagmanager\.com$/.test(url.hostname) && /^\/(?:gtm\.js|gtag\/js)$/.test(url.pathname)) return true;
        if (/^(?:www\.)?google-analytics\.com$/.test(url.hostname) && /^\/(?:analytics|ga)\.js$/.test(url.pathname)) return true;
      } catch (_) { /* A non-URL script source is not a Google loader. */ }
    }
    if (w.google_tag_manager && Object.keys(w.google_tag_manager).some(function (key) { return /^GTM-/.test(key); })) return true;
    return Array.isArray(w.dataLayer) && w.dataLayer.some(function (item) {
      return item && (item.event === 'gtm.js' || item[0] === 'config' && /^G-/.test(String(item[1] || '')));
    });
  }

  function load() {
    if (requested || reloadRequired || !choice.analytics) return;
    reason = scopeReason();
    if (reason) { status = 'blocked'; disableGa(true); return; }
    if (existingGoogleTag()) { fatalConflict = true; status = 'conflict'; reason = 'existing-google-tag'; disableGa(true); return; }
    if (w.dataLayer && !Array.isArray(w.dataLayer)) { fatalConflict = true; status = 'conflict'; reason = 'invalid-data-layer'; disableGa(true); return; }
    w.dataLayer = w.dataLayer || [];
    requested = true;
    status = 'loading';
    reason = '';
    disableGa(false);
    // Publish only the fixed consent enums. No caller data or page/form values.
    notifyConsent(false);
    w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    script = d.createElement('script');
    script.id = 'eic-analytics-gtm';
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + config.containerId;
    script.referrerPolicy = 'no-referrer';
    script.onload = function () {
      loaded = true;
      if (choice.analytics && !reloadRequired && !scopeReason()) status = 'loaded';
      else { disableGa(true); status = 'revoked'; }
    };
    script.onerror = function () { disableGa(true); status = 'load-error'; reason = 'gtm-request-failed'; };
    (d.head || d.documentElement).appendChild(script);
  }

  function getState() {
    return {
      version: 1,
      enabled: !!config && !scopeReason(),
      status: status,
      reason: reason,
      containerId: config ? config.containerId : '',
      measurementId: config ? config.measurementId : '',
      consent: { analytics: choice.analytics, marketing: !!(config && config.allowMarketingConsent && choice.marketing) },
      googleConsent: consentState(),
      scriptRequested: requested,
      scriptLoaded: loaded,
      reloadRequired: reloadRequired
    };
  }

  function configure(value) {
    var next = validate(value);
    if (requested && (!next || next.containerId !== config.containerId || next.measurementId !== config.measurementId)) {
      fatalConflict = true; disableGa(true); notifyConsent(); status = 'conflict'; reason = 'configuration-changed-after-load'; return getState();
    }
    config = next;
    disableGa(!choice.analytics || !!scopeReason());
    if (!config) { status = 'disabled'; reason = 'invalid-or-disabled-configuration'; }
    else if (!requested) { reason = scopeReason(); status = reason ? 'blocked' : 'waiting-consent'; load(); }
    return getState();
  }

  function updateConsent(preferences) {
    var previous = choice.analytics;
    var next = {
      analytics: !!preferences && preferences.analytics === true,
      marketing: !!preferences && preferences.marketing === true
    };
    if (consentSeen && choice.analytics === next.analytics && choice.marketing === next.marketing) {
      disableGa(!choice.analytics || !!scopeReason() || reloadRequired);
      load();
      return getState();
    }
    consentSeen = true;
    choice = next;
    disableGa(!choice.analytics || !!scopeReason() || reloadRequired);
    notifyConsent();
    if (!choice.analytics) {
      clearAnalyticsCookies();
      if (requested && previous) {
        reloadRequired = true;
        status = 'revoked';
        reason = 'analytics-consent-revoked';
        if (script && script.parentNode) script.parentNode.removeChild(script);
        // CMP adapters must persist the denial BEFORE invoking this method.
        // Removing a script alone does not unload its timers/listeners.
        if (config && config.reloadOnRevoke && w.location && typeof w.location.reload === 'function') w.location.reload();
      } else if (!requested && config) { reason = scopeReason(); status = reason ? 'blocked' : 'waiting-consent'; }
    } else load();
    return getState();
  }

  function subscribeConsent(callback) {
    if (typeof callback !== 'function') return function () {};
    if (listeners.indexOf(callback) < 0) listeners.push(callback);
    callback(consentState());
    return function () { var index = listeners.indexOf(callback); if (index >= 0) listeners.splice(index, 1); };
  }

  function getPageContext() {
    if (!isTrackable()) return { page_location: '', page_referrer: '', page_title: '' };
    var referrer = '';
    try {
      var ref = new URL(d.referrer || '');
      // An external or app referrer may itself contain a customer identifier in
      // its path. Retain only its origin; GTM may keep a previous safe public URL.
      if (/^https?:$/.test(ref.protocol)) referrer = ref.origin;
    } catch (_) { /* An absent/invalid referrer remains empty. */ }
    return {
      page_location: w.location.origin + w.location.pathname,
      page_referrer: referrer,
      page_title: config && config.siteName ? config.siteName : String(w.location.hostname || '')
    };
  }

  function isTrackable() {
    return !!config && choice.analytics && !reloadRequired && status !== 'load-error' && !scopeReason();
  }

  function safePath() {
    return config && !scopeReason() ? w.location.pathname : '';
  }

  var api = Object.freeze({ version: 1, configure: configure, updateConsent: updateConsent, subscribeConsent: subscribeConsent, getState: getState, getPageContext: getPageContext, isTrackable: isTrackable, safePath: safePath });
  Object.defineProperty(w, KEY, { value: api });
  w.EICAnalytics = api;
  w.addEventListener('eic:analytics-consent', function (event) { updateConsent(event && event.detail); });
  configure(w.EIC_ANALYTICS_CONFIG);
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
