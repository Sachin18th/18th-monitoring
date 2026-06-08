/*!
 * 18th Digitech — Storefront RUM error collector.
 * Zero dependencies. Silent-fail. Paste into <head>:
 *
 *   <script src="https://<platform>/api/rum/rum.js"
 *           data-ingest-url="https://<platform>/api/rum/errors"
 *           data-project-id="proj_xxx"
 *           data-connector-id="conn_xxx"></script>
 *
 * Config may alternatively be set via window.__RUM_CONFIG__ = { ingestUrl, projectId, connectorId }.
 */
(function () {
  'use strict';
  try {
    var ds = (document.currentScript && document.currentScript.dataset) || {};
    var cfg = window.__RUM_CONFIG__ || {};
    var INGEST = ds.ingestUrl || cfg.ingestUrl;
    var PROJECT = ds.projectId || cfg.projectId;
    var CONNECTOR = ds.connectorId || cfg.connectorId || '';
    if (!INGEST || !PROJECT) return; // not configured — do nothing

    var ENDPOINT = INGEST + (INGEST.indexOf('?') < 0 ? '?' : '&') +
      'projectId=' + encodeURIComponent(PROJECT) +
      (CONNECTOR ? '&connectorId=' + encodeURIComponent(CONNECTOR) : '');

    // Stable per-tab session id.
    var SID;
    try {
      SID = sessionStorage.getItem('rum_sid');
      if (!SID) {
        SID = (crypto && crypto.randomUUID) ? crypto.randomUUID()
          : 'sid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        sessionStorage.setItem('rum_sid', SID);
      }
    } catch (e) { SID = 'sid-' + Date.now().toString(36); }

    var queue = [];
    var timer = null;

    function flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!queue.length) return;
      var batch = queue.splice(0, queue.length);
      var payload = JSON.stringify({ errors: batch });
      var sent = false;
      try {
        if (navigator.sendBeacon) {
          sent = navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
        }
      } catch (e) { sent = false; }
      if (!sent) {
        try {
          fetch(ENDPOINT, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true, mode: 'cors' }).catch(function () {});
        } catch (e) {}
      }
    }

    function schedule() {
      if (queue.length >= 10) return flush();
      if (!timer) timer = setTimeout(flush, 5000);
    }

    function report(e) {
      try {
        e.session_id = SID;
        e.page_url = location.href;
        e.user_agent = navigator.userAgent;
        e.occurred_at = new Date().toISOString();
        queue.push(e);
        schedule();
      } catch (err) {}
    }

    // 1) Uncaught JS errors.
    window.addEventListener('error', function (ev) {
      try {
        var t = ev.target;
        // Resource load failures (img/script/link) bubble here in the capture phase.
        if (t && t !== window && t.tagName) {
          var tag = t.tagName;
          if (tag === 'IMG' || tag === 'SCRIPT' || tag === 'LINK') {
            report({ error_type: 'resource_error', resource_tag: tag, request_url: t.src || t.href || '', message: tag + ' failed to load: ' + (t.src || t.href || 'unknown') });
            return;
          }
        }
        report({ error_type: 'js_error', message: (ev.message || 'Script error'), source_url: ev.filename || '', stack: (ev.error && ev.error.stack) || '' });
      } catch (err) {}
    }, true);

    // 2) Unhandled promise rejections.
    window.addEventListener('unhandledrejection', function (ev) {
      try {
        var r = ev.reason;
        report({ error_type: 'promise_rejection', message: (r && r.message) || String(r) || 'Unhandled rejection', stack: (r && r.stack) || '' });
      } catch (err) {}
    });

    // 3) Network errors via fetch interception.
    if (window.fetch) {
      var orig = window.fetch;
      window.fetch = function () {
        var args = arguments;
        var start = (performance && performance.now) ? performance.now() : Date.now();
        var url = (args[0] && args[0].url) || args[0] || '';
        var method = (args[1] && args[1].method) || (args[0] && args[0].method) || 'GET';
        return orig.apply(this, args).then(function (resp) {
          try {
            if (resp && !resp.ok) {
              report({ error_type: 'network_error', request_url: String(url), status_code: resp.status, http_method: String(method).toUpperCase(), duration_ms: Math.round(((performance && performance.now) ? performance.now() : Date.now()) - start), message: 'HTTP ' + resp.status + ' ' + String(method).toUpperCase() + ' ' + String(url) });
            }
          } catch (err) {}
          return resp;
        }, function (e) {
          try {
            report({ error_type: 'network_error', request_url: String(url), http_method: String(method).toUpperCase(), duration_ms: Math.round(((performance && performance.now) ? performance.now() : Date.now()) - start), message: (e && e.message) || ('Request failed: ' + String(url)) });
          } catch (err) {}
          throw e;
        });
      };
    }

    // Flush whatever is queued before the page goes away.
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  } catch (e) { /* never break the storefront */ }
})();
