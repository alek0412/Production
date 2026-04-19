/**
 * Admin Dashboard — aggregates existing public + admin JSON APIs into one snapshot.
 */
(function () {
  'use strict';
  var exportUiInitialized = false;
  var exportTablesLoaded = false;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function todayYmd() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    });
  }

  function fetchBlob(url, opts) {
    return fetch(url, opts || { credentials: 'same-origin' }).then(function (r) {
      return r.blob().then(function (blob) {
        return { ok: r.ok, status: r.status, blob: blob, headers: r.headers };
      });
    });
  }

  function filenameFromContentDisposition(headerVal, fallback) {
    if (!headerVal) return fallback;
    var m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(String(headerVal));
    var raw = (m && (m[1] || m[2])) || '';
    if (!raw) return fallback;
    try {
      return decodeURIComponent(raw);
    } catch (e) {
      return raw;
    }
  }

  function setExportStatus(msg, kind) {
    var el = $('dashboard-export-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'admin-dashboard-export-status' + (kind ? ' is-' + kind : '');
  }

  function selectedTableNames() {
    var sel = $('dashboard-export-tables');
    if (!sel) return [];
    var out = [];
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].selected) out.push(sel.options[i].value);
    }
    return out;
  }

  /** DB table name → readable label for the export list only (values stay real names). */
  function tableNameToUiLabel(name) {
    if (!name) return '';
    return String(name)
      .split('_')
      .filter(function (p) {
        return p.length;
      })
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(' ');
  }

  function populateExportTableOptions(tables) {
    var sel = $('dashboard-export-tables');
    if (!sel) return;
    sel.innerHTML = '';
    for (var i = 0; i < tables.length; i++) {
      var opt = document.createElement('option');
      opt.value = tables[i];
      opt.textContent = tableNameToUiLabel(tables[i]);
      sel.appendChild(opt);
    }
  }

  function loadExportTables() {
    if (exportTablesLoaded) return Promise.resolve();
    setExportStatus('Loading table list…');
    return fetchJson('/api/admin/export/tables')
      .then(function (data) {
        if (!data || !data.success || !Array.isArray(data.tables)) {
          setExportStatus('Could not load table list.', 'error');
          return;
        }
        populateExportTableOptions(data.tables);
        exportTablesLoaded = true;
        setExportStatus('Select tables and click Export.', 'ok');
      })
      .catch(function () {
        setExportStatus('Could not load table list.', 'error');
      });
  }

  function bindExportEvents() {
    if (exportUiInitialized) return;
    exportUiInitialized = true;
    var btn = $('dashboard-export-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var formatSel = $('dashboard-export-format');
      var format = formatSel ? formatSel.value : 'xlsx';
      var tables = selectedTableNames();
      if (!tables.length) {
        setExportStatus('Select at least one table.', 'error');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Exporting…';
      setExportStatus('Preparing export…');
      fetchBlob('/api/admin/export', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: tables, format: format }),
      })
        .then(function (out) {
          if (!out.ok) throw new Error('Export failed');
          var cd = out.headers.get('Content-Disposition') || '';
          var fallback = 'hbc-export.' + (format === 'pdf' ? 'pdf' : 'xlsx');
          var fileName = filenameFromContentDisposition(cd, fallback);
          var url = URL.createObjectURL(out.blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          setExportStatus('Export downloaded: ' + fileName, 'ok');
        })
        .catch(function () {
          setExportStatus('Export failed. Please try again.', 'error');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Export selected tables';
        });
    });
  }

  function initExportPanel(manager) {
    var panel = $('dashboard-export-panel');
    if (!panel) return;
    panel.hidden = false;
    bindExportEvents();
    if (!manager || !manager.managerLoggedIn) {
      setExportStatus('Manager sign-in required to export database tables.', 'error');
      var btn = $('dashboard-export-btn');
      var sel = $('dashboard-export-tables');
      var fmt = $('dashboard-export-format');
      if (btn) btn.disabled = true;
      if (sel) sel.disabled = true;
      if (fmt) fmt.disabled = true;
      return;
    }
    var btn2 = $('dashboard-export-btn');
    var sel2 = $('dashboard-export-tables');
    var fmt2 = $('dashboard-export-format');
    if (btn2) btn2.disabled = false;
    if (sel2) sel2.disabled = false;
    if (fmt2) fmt2.disabled = false;
    loadExportTables();
  }

  function checkAuth() {
    return fetch('/api/me', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || data.loggedIn !== true) {
          window.location.replace('/client/Client_Login.html');
          return false;
        }
        return true;
      })
      .catch(function () {
        /* Offline or file:// — still try to paint dashboard from APIs */
        return true;
      });
  }

  function countEventImagesFilled(payload) {
    if (!payload || !Array.isArray(payload.images)) return { filled: 0, total: 0 };
    var total = payload.images.length;
    var filled = 0;
    for (var i = 0; i < payload.images.length; i++) {
      if (payload.images[i] && payload.images[i].url) filled++;
    }
    return { filled: filled, total: total };
  }

  function truncate(s, max) {
    var t = (s || '').trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
  }

  function renderPendingList(container, payload) {
    if (!container) return;
    var list = (payload && payload.reservations) || [];
    if (!payload || !payload.success) {
      container.innerHTML =
        '<p class="admin-dashboard-empty">Could not load the queue. Open <a href="Admin_Reservations.html">Reservations</a> to review.</p>';
      return;
    }
    if (list.length === 0) {
      container.innerHTML =
        '<p class="admin-dashboard-empty admin-dashboard-empty--good">All clear — no booking requests waiting for a reply. Time for a victory lap.</p>';
      return;
    }
    var max = 6;
    var rows = [];
    for (var i = 0; i < list.length && i < max; i++) {
      var r = list[i];
      var name =
        [r.customer_first_name, r.customer_last_name].filter(Boolean).join(' ').trim() || 'Guest';
      var when = esc(r.reservation_date || '') + ' · ' + esc(r.reservation_start_time || '') + '–' + esc(r.reservation_end_time || '');
      rows.push(
        '<li class="admin-dashboard-queue-item">' +
          '<span class="admin-dashboard-queue-name">' +
          esc(name) +
          '</span>' +
          '<span class="admin-dashboard-queue-meta">' +
          when +
          '</span>' +
          '</li>'
      );
    }
    var more = list.length > max ? '<p class="admin-dashboard-queue-more">+' + (list.length - max) + ' more in Reservations</p>' : '';
    container.innerHTML = '<ul class="admin-dashboard-queue">' + rows.join('') + '</ul>' + more;
  }

  function renderSitePulse(el, pricing, popular, specials) {
    if (!el) return;
    var parts = [];

    var teaser = specials && specials.teaserText ? truncate(specials.teaserText, 72) : '';
    if (teaser) {
      parts.push(
        '<p class="admin-dashboard-pulse-line"><strong>Membership teaser:</strong> ' + esc(teaser) + '</p>'
      );
    }

    if (specials && Array.isArray(specials.items)) {
      var names = specials.items
        .slice(0, 3)
        .map(function (it) {
          return it && it.name ? it.name : '';
        })
        .filter(Boolean);
      if (names.length) {
        parts.push(
          '<p class="admin-dashboard-pulse-line"><strong>Specials on the board:</strong> ' +
            esc(names.join(' · ')) +
            (specials.items.length > 3 ? ' …' : '') +
            '</p>'
        );
      }
    }

    if (pricing) {
      var pr = pricing.hasCustom ? 'Custom file' : 'Default asset';
      var pk = pricing.kind === 'pdf' ? 'PDF' : 'Image';
      parts.push(
        '<p class="admin-dashboard-pulse-line"><strong>Membership pricing sheet:</strong> ' +
          pr +
          ' · ' +
          pk +
          '</p>'
      );
    }

    if (popular) {
      var pt = popular.hasCustom ? 'Custom file' : 'Default asset';
      var pk2 = popular.kind === 'pdf' ? 'PDF' : popular.kind === 'image' ? 'Image' : 'PDF';
      parts.push(
        '<p class="admin-dashboard-pulse-line"><strong>Popular times:</strong> ' + pt + ' · ' + pk2 + '</p>'
      );
    }

    if (parts.length === 0) {
      el.innerHTML = '<p class="admin-dashboard-empty">Site content APIs did not return detail.</p>';
      return;
    }
    el.innerHTML = parts.join('');
  }

  function applySnapshot(bundle) {
    var adminMe = bundle[0];
    var pending = bundle[1];
    var events = bundle[2];
    var pricing = bundle[3];
    var popular = bundle[4];
    var specials = bundle[5];
    var manager = bundle[6];
    var schedule = bundle[7];

    var first = adminMe && adminMe.loggedIn && adminMe.firstName ? String(adminMe.firstName).trim() : '';
    var heading = $('dashboard-hero-heading');
    var lede = $('dashboard-hero-lede');
    if (heading) {
      heading.textContent = first ? 'Hey, ' + first + ' — welcome back' : 'Houston Badminton HQ';
    }
    if (lede) {
      lede.textContent =
        'Keep the courts lively and the energy high—everything you need to help players enjoy a smooth, fun day of badminton is right here.';
    }

    var pendingCount = 0;
    if (pending && pending.success) {
      pendingCount =
        typeof pending.count === 'number'
          ? pending.count
          : pending.reservations
            ? pending.reservations.length
            : 0;
    }
    var pendingEl = $('dashboard-stat-pending');
    if (pendingEl) pendingEl.textContent = String(pendingCount);
    var pendingHint = $('dashboard-stat-pending-hint');
    if (pendingHint) {
      pendingHint.textContent =
        pendingCount === 0 ? 'Inbox quiet — smooth sailing.' : 'Needs a reply from staff.';
    }

    var ev = countEventImagesFilled(events || {});
    var evEl = $('dashboard-stat-events');
    if (evEl) evEl.textContent = ev.filled + ' / ' + ev.total;
    var evHint = $('dashboard-stat-events-hint');
    if (evHint) {
      evHint.textContent =
        ev.total === 0
          ? 'Home spotlight slots'
          : ev.filled === ev.total
            ? 'Home tiles are fully loaded'
            : ev.filled === 0
              ? 'Add hero images on Layout'
              : 'Spotlight filling up';
    }

    var todayCount = 0;
    if (schedule && schedule.success && Array.isArray(schedule.reservations)) {
      todayCount = schedule.reservations.length;
    }
    var todayEl = $('dashboard-stat-today');
    if (todayEl) todayEl.textContent = String(todayCount);
    var todayHint = $('dashboard-stat-today-hint');
    if (todayHint) {
      todayHint.textContent =
        todayCount === 0 ? 'Courts wide open today (on the schedule).' : 'Bookings on deck for today.';
    }

    var specCount = specials && Array.isArray(specials.items) ? specials.items.length : 0;
    var specEl = $('dashboard-stat-specials');
    if (specEl) specEl.textContent = String(specCount);
    var specHint = $('dashboard-stat-specials-hint');
    if (specHint) {
      specHint.textContent =
        specCount === 1 ? 'One special in the member box' : specCount + ' specials in the member box';
    }

    var mgrEl = $('dashboard-stat-manager');
    var mgrHint = $('dashboard-stat-manager-hint');
    if (mgrEl && mgrHint) {
      if (manager && manager.managerLoggedIn) {
        mgrEl.textContent = 'Unlocked';
        mgrHint.textContent = 'Employee roster tools are ready.';
      } else {
        mgrEl.textContent = 'Locked';
        mgrHint.textContent = 'Use manager sign-in on Employees for full access.';
      }
    }

    renderPendingList($('dashboard-pending-list'), pending);
    renderSitePulse($('dashboard-site-pulse'), pricing, popular, specials);
    initExportPanel(manager);

    var root = $('admin-dashboard-root');
    if (root) root.hidden = false;
  }

  function loadAll() {
    var date = todayYmd();
    Promise.all([
      fetchJson('/api/admin/me'),
      fetchJson('/api/admin/pending-reservations'),
      fetchJson('/api/upcoming-events'),
      fetchJson('/api/membership-pricing'),
      fetchJson('/api/popular-times-pdf'),
      fetchJson('/api/membership-specials-teaser'),
      fetchJson('/api/admin/manager-me'),
      fetchJson('/api/schedule-reservations?date=' + encodeURIComponent(date)),
    ]).then(applySnapshot);
  }

  function init() {
    checkAuth().then(function (ok) {
      if (!ok) return;
      loadAll();
      setInterval(loadAll, 60000);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
