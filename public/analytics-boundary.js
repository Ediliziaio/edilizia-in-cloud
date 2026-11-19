/* Public-site document boundary for mixed React applications.
 * It sends no analytics events and never forwards form/query/state values.
 * Install before the consent-gated GTM loader, on explicitly allowed hosts.
 */
(function (w, d) {
  'use strict';
  if (!w || !d || w.EICAnalyticsBoundary) return;
  var installed = false;
  var config = null;
  var transitioning = false;
  var navigationPending = false;
  var committedPublic = false;
  var nativePush = null;
  var nativeReplace = null;

  function validId(value, prefix) {
    return typeof value === 'string' && new RegExp('^' + prefix + '-[A-Z0-9]{4,20}$').test(value) &&
      !/(?:PLACEHOLDER|REPLACE|YOUR|TODO|TBD|EXAMPLE)|-(?:X+|0+)$/.test(value);
  }
  function cleanPath(value) { return value.length > 1 ? value.replace(/\/+$/, '') : '/'; }
  function prefix(path, item) { return item === '/' ? path === '/' : path === item || path.indexOf(item + '/') === 0; }
  function isPublicUrl(url) {
    if (!config || url.protocol !== 'https:' || config.allowedHosts.indexOf(url.hostname.toLowerCase()) < 0) return false;
    var pathname;
    try { pathname = cleanPath(decodeURIComponent(url.pathname || '/')); } catch (_) { return false; }
    if (/@|[\r\n]/.test(pathname)) return false;
    if (/(?:^|[?&])(?:email|e-mail|mail|phone|telephone|telefono|nome|name|firstname|lastname|address|indirizzo|token|access_token|code|password)=/i.test(url.search)) return false;
    if (config.excludedPathPrefixes.some(function (item) { return prefix(pathname, item); })) return false;
    return config.allowedExactPaths.indexOf(pathname) >= 0 || config.allowedPathPrefixes.some(function (item) { return prefix(pathname, item); });
  }
  function here() { return new URL(w.location.href); }
  function disable() { if (config) w['ga-disable-' + config.measurementId] = true; }
  function crossDocument(url, replace) {
    // Disable Google before changing the URL or notifying any history listener.
    disable();
    if (navigationPending) return;
    transitioning = true;
    navigationPending = true;
    try {
      if (replace) w.location.replace(url.href);
      else w.location.assign(url.href);
    } finally {
      // A native beforeunload prompt may cancel the document navigation.
      // Permit subsequent router actions after that prompt, while Google stays
      // disabled and the measurement runtime stays quarantined until reload.
      w.setTimeout(function () { navigationPending = false; }, 0);
    }
  }
  function guardedHistory(original, replace) {
    return function () {
      if (navigationPending) return;
      var target;
      try { target = arguments.length > 2 && arguments[2] != null ? new URL(String(arguments[2]), w.location.href) : here(); }
      catch (_) { return original.apply(w.history, arguments); }
      // Preserve the History API's own same-origin validation; do not turn
      // an invalid cross-origin pushState into a navigation.
      if (target.origin !== here().origin) return original.apply(w.history, arguments);
      var targetPublic = isPublicUrl(target);
      if (targetPublic !== isPublicUrl(here())) { crossDocument(target, replace); return; }
      var result = original.apply(w.history, arguments);
      committedPublic = targetPublic;
      return result;
    };
  }
  function onPop(event) {
    var target = here();
    if (isPublicUrl(target) === committedPublic) return;
    // Capture is registered before GTM. Stop history consumers from observing
    // a private page in an already measured public document.
    disable();
    if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    crossDocument(target, true);
  }
  function onClick(event) {
    if (!event || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var anchor = event.target && typeof event.target.closest === 'function' ? event.target.closest('a[href]') : null;
    if (!anchor || anchor.hasAttribute('download') || anchor.target && anchor.target !== '_self') return;
    var target;
    try { target = new URL(anchor.href, w.location.href); } catch (_) { return; }
    if (target.origin !== here().origin || isPublicUrl(target) === isPublicUrl(here())) return;
    event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    crossDocument(target, false);
  }
  function paths(value) {
    return Array.isArray(value) ? value.filter(function (p) { return typeof p === 'string' && /^\/[^?#]*$/.test(p); }).map(cleanPath) : [];
  }
  function install(value) {
    if (!value || value.enabled !== true || !validId(value.containerId, 'GTM') || !validId(value.measurementId, 'G')) return getState();
    if (!Array.isArray(value.allowedHosts) || value.allowedHosts.indexOf(String(w.location.hostname).toLowerCase()) < 0 || w.location.protocol !== 'https:') return getState();
    var next = {
      measurementId: value.measurementId,
      allowedHosts: value.allowedHosts.map(function (h) { return String(h).toLowerCase(); }),
      allowedExactPaths: paths(value.allowedExactPaths),
      allowedPathPrefixes: paths(value.allowedPathPrefixes),
      excludedPathPrefixes: paths(value.excludedPathPrefixes)
    };
    if (!next.allowedExactPaths.length && !next.allowedPathPrefixes.length) return getState();
    if (installed) {
      // A running document never changes tracking identity or route policy.
      if (JSON.stringify(next) !== JSON.stringify(config)) disable();
      return getState();
    }
    config = next;
    installed = true;
    committedPublic = isPublicUrl(here());
    nativePush = w.history.pushState;
    nativeReplace = w.history.replaceState;
    w.history.pushState = guardedHistory(nativePush, false);
    w.history.replaceState = guardedHistory(nativeReplace, true);
    w.addEventListener('popstate', onPop, true);
    w.addEventListener('pageshow', onPop, true);
    d.addEventListener('click', onClick, true);
    return getState();
  }
  function getState() { return { version: 1, installed: installed, publicPage: installed && isPublicUrl(here()), transitioning: transitioning }; }
  w.EICAnalyticsBoundary = Object.freeze({ install: install, getState: getState });
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
