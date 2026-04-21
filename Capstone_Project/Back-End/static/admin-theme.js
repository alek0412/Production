(function () {
  var STORAGE_KEY = 'admin-theme';
  var SIDEBAR_KEY = 'admin-sidebar-collapsed';
  var DEFAULT_THEME = 'dark';
  /** Public home after admin sign-out (matches customer nav). */
  var GENERAL_HOME = '/client/General_Dashboard.html';
  /** Other open admin tabs listen for this and redirect to GENERAL_HOME. */
  var ADMIN_LOGOUT_SYNC_KEY = 'hbc_admin_logout_at';

  window.addEventListener('storage', function (e) {
    if (e && e.key === ADMIN_LOGOUT_SYNC_KEY) {
      window.location.href = GENERAL_HOME;
    }
  });

  function getSidebarCollapsedFromStorage() {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function applySidebarOnLoad() {
    if (getSidebarCollapsedFromStorage()) {
      document.body.classList.add('admin-sidebar-collapsed');
    }
  }

  function isSidebarCollapsed() {
    return document.body.classList.contains('admin-sidebar-collapsed');
  }

  function syncSidebarAria() {
    var aside = document.querySelector('.admin-sidebar');
    if (!aside) return;
    if (isSidebarCollapsed()) {
      aside.setAttribute('aria-hidden', 'true');
    } else {
      aside.removeAttribute('aria-hidden');
    }
  }

  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle('admin-sidebar-collapsed', collapsed);
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch (e) {}
    syncSidebarAria();
    syncSidebarToggle();
    if (collapsed && sidebarToggleEl && document.activeElement) {
      var aside = document.querySelector('.admin-sidebar');
      if (aside && aside.contains(document.activeElement) && sidebarToggleEl.focus) {
        sidebarToggleEl.focus();
      }
    }
  }

  var sidebarToggleEl = null;

  function syncSidebarToggle() {
    if (!sidebarToggleEl) return;
    var collapsed = isSidebarCollapsed();
    sidebarToggleEl.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    sidebarToggleEl.setAttribute(
      'aria-label',
      collapsed ? 'Show navigation menu' : 'Hide navigation menu'
    );
    sidebarToggleEl.textContent = collapsed ? 'Show menu' : 'Hide menu';
  }

  function getTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : DEFAULT_THEME;
    } catch (e) {
      return DEFAULT_THEME;
    }
  }

  function setTheme(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {}
    document.body.setAttribute('data-theme', value);
  }

  function applyThemeOnLoad() {
    setTheme(getTheme());
  }

  function renderDropdown(container) {
    container.innerHTML =
      '<div class="theme-dropdown">' +
        '<button type="button" class="theme-dropdown-btn" id="admin-theme-btn" aria-expanded="false" aria-haspopup="listbox" aria-label="Theme">' +
          'Theme' +
          '<svg class="theme-dropdown-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>' +
          '</svg>' +
        '</button>' +
        '<ul class="theme-dropdown-list" id="admin-theme-list" role="listbox" aria-label="Theme" hidden>' +
          '<li class="theme-dropdown-option" role="option" data-theme="light" tabindex="-1">Light</li>' +
          '<li class="theme-dropdown-option" role="option" data-theme="dark" tabindex="-1">Dark</li>' +
        '</ul>' +
      '</div>';
  }

  function bindDropdown(container) {
    var btn = document.getElementById('admin-theme-btn');
    var list = document.getElementById('admin-theme-list');
    if (!btn || !list) return;

    function close() {
      btn.setAttribute('aria-expanded', 'false');
      list.hidden = true;
    }

    function open() {
      btn.setAttribute('aria-expanded', 'true');
      list.hidden = false;
    }

    function choose(theme) {
      setTheme(theme);
      close();
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (list.hidden) open(); else close();
    });

    list.querySelectorAll('.theme-dropdown-option').forEach(function (opt) {
      opt.addEventListener('click', function (e) {
        e.stopPropagation();
        choose(opt.getAttribute('data-theme'));
      });
    });

    document.addEventListener('click', function () { close(); });
  }

  function init() {
    applyThemeOnLoad();
    applySidebarOnLoad();
    syncSidebarAria();
    var container = document.getElementById('admin-theme-container');
    if (container) {
      var topbarRight = document.createElement('div');
      topbarRight.className = 'admin-topbar-right';
      var logoutBtn = document.createElement('button');
      logoutBtn.type = 'button';
      logoutBtn.className = 'admin-logout-btn';
      logoutBtn.textContent = 'Log Out';
      logoutBtn.addEventListener('click', function () {
        try {
          localStorage.setItem(ADMIN_LOGOUT_SYNC_KEY, String(Date.now()));
        } catch (err) {}
        fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' })
          .catch(function () {})
          .then(function () {
            window.location.href = GENERAL_HOME;
          });
      });
      if (document.querySelector('.admin-layout')) {
        sidebarToggleEl = document.createElement('button');
        sidebarToggleEl.type = 'button';
        sidebarToggleEl.className = 'admin-sidebar-toggle';
        sidebarToggleEl.addEventListener('click', function () {
          setSidebarCollapsed(!isSidebarCollapsed());
        });
        topbarRight.appendChild(sidebarToggleEl);
        syncSidebarToggle();
      }
      container.parentNode.insertBefore(topbarRight, container);
      topbarRight.appendChild(container);
      topbarRight.appendChild(logoutBtn);
      renderDropdown(container);
      bindDropdown(container);
    }
    initPendingReservationsNavBadge();
    if (!document.querySelector('.reservations-page')) {
      initBackToTop();
    }
  }

  var reservationsPulseDelayTimer = null;

  function setReservationsPendingPulse(link, enabled) {
    if (!link) return;
    if (!enabled) {
      if (reservationsPulseDelayTimer) {
        clearTimeout(reservationsPulseDelayTimer);
        reservationsPulseDelayTimer = null;
      }
      link.classList.remove('admin-nav-link--pending-pulse');
      return;
    }
    if (link.classList.contains('admin-nav-link--pending-pulse') || reservationsPulseDelayTimer) {
      return;
    }
    reservationsPulseDelayTimer = setTimeout(function () {
      reservationsPulseDelayTimer = null;
      link.classList.add('admin-nav-link--pending-pulse');
    }, 5000);
  }

  function updateReservationsNavBadge(count) {
    var link = document.querySelector('a.admin-nav-link[href="Admin_Reservations.html"]');
    if (!link) return;
    var badge = link.querySelector('.admin-nav-pending-badge');
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    var n = typeof count === 'number' && count > 0 ? count : 0;
    if (n > 0) {
      link.setAttribute(
        'title',
        n + ' pending court booking request' + (n === 1 ? '' : 's')
      );
      setReservationsPendingPulse(link, true);
    } else {
      link.removeAttribute('title');
      setReservationsPendingPulse(link, false);
    }
  }

  function fetchPendingReservationNavCount() {
    fetch('/api/admin/pending-reservations', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.d || !out.d.success) {
          updateReservationsNavBadge(0);
          return;
        }
        var n =
          typeof out.d.count === 'number'
            ? out.d.count
            : out.d.reservations
              ? out.d.reservations.length
              : 0;
        updateReservationsNavBadge(n);
      })
      .catch(function () {
        updateReservationsNavBadge(0);
      });
  }

  function initPendingReservationsNavBadge() {
    if (!document.querySelector('.admin-layout')) return;
    fetchPendingReservationNavCount();
    setInterval(fetchPendingReservationNavCount, 50000);
    window.addEventListener('hbc-pending-reservations-count', function (ev) {
      if (ev && ev.detail && typeof ev.detail.count === 'number') {
        updateReservationsNavBadge(ev.detail.count);
      }
    });
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function getDocScrollHeight() {
    var doc = document.documentElement;
    var body = document.body;
    return Math.max(
      doc.scrollHeight,
      doc.offsetHeight,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0
    );
  }

  /** When the window does not scroll, find the main overflow element (e.g. .admin-content). */
  function findPrimaryScrollContainer() {
    var vh = window.innerHeight;
    var sh = getDocScrollHeight();
    if (sh > vh + 4) return null;
    var best = null;
    var bestArea = 0;
    var nodes = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var st = window.getComputedStyle(el);
      var oy = st.overflowY;
      if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
      var ch = el.clientHeight;
      if (ch < 100) continue;
      if (el.scrollHeight <= ch + 2) continue;
      var area = el.clientWidth * ch;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  }

  function isAtScrollBottom() {
    var pad = 2;
    var sc = findPrimaryScrollContainer();
    if (!sc) {
      var sh = getDocScrollHeight();
      var vh = window.innerHeight;
      if (sh <= vh + pad) return false;
      var scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      return scrollTop + vh >= sh - pad;
    }
    if (sc.scrollHeight <= sc.clientHeight + pad) return false;
    return sc.scrollTop + sc.clientHeight >= sc.scrollHeight - pad;
  }

  function resetAllScrollToTop() {
    try {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (e) {}
    var nodes = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var st = window.getComputedStyle(el);
      if (st.overflowY !== 'auto' && st.overflowY !== 'scroll' && st.overflowY !== 'overlay') continue;
      if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = 0;
    }
  }

  /** Picks window vs nested scroll by largest scroll offset (fixes click when doc is tall but main scroll is inside a panel). */
  function pickScrollTargetForClick() {
    var winY = window.scrollY || document.documentElement.scrollTop || 0;
    var bestEl = null;
    var bestTop = 0;
    var nodes = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var st = window.getComputedStyle(el);
      if (st.overflowY !== 'auto' && st.overflowY !== 'scroll' && st.overflowY !== 'overlay') continue;
      if (el.clientHeight < 80) continue;
      if (el.scrollHeight <= el.clientHeight + 2) continue;
      if (el.scrollTop > bestTop) {
        bestTop = el.scrollTop;
        bestEl = el;
      }
    }
    if (winY > bestTop) return { type: 'window', start: winY };
    if (bestEl && bestTop > 0) return { type: 'element', el: bestEl, start: bestTop };
    if (winY > 0) return { type: 'window', start: winY };
    return null;
  }

  function ensureBackToTopButton() {
    var existing = document.getElementById('gh-back-top');
    if (existing) return existing;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'gh-back-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.setAttribute('aria-hidden', 'true');
    btn.setAttribute('tabindex', '-1');
    btn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>' +
      '</svg>';
    document.body.appendChild(btn);
    return btn;
  }

  function initBackToTop() {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var back = ensureBackToTopButton();
    if (!back) return;

    var nestedScrollEl = null;

    function toggleBack() {
      if (isAtScrollBottom()) {
        back.classList.add('gh-back-top--visible');
        back.setAttribute('aria-hidden', 'false');
        back.removeAttribute('tabindex');
      } else {
        back.classList.remove('gh-back-top--visible');
        back.setAttribute('aria-hidden', 'true');
        back.setAttribute('tabindex', '-1');
      }
    }

    function bindNestedScroll() {
      if (nestedScrollEl) {
        nestedScrollEl.removeEventListener('scroll', toggleBack);
        nestedScrollEl = null;
      }
      var n = findPrimaryScrollContainer();
      if (n) {
        nestedScrollEl = n;
        n.addEventListener('scroll', toggleBack, { passive: true });
      }
    }

    toggleBack();
    bindNestedScroll();
    window.addEventListener('scroll', toggleBack, { passive: true });
    window.addEventListener('resize', function () {
      bindNestedScroll();
      toggleBack();
    }, { passive: true });

    back.addEventListener('click', function () {
      function finish() {
        resetAllScrollToTop();
      }
      if (reduce) {
        finish();
        return;
      }
      var t = pickScrollTargetForClick();
      if (!t || t.start <= 0) {
        finish();
        return;
      }
      if (t.type === 'window') {
        var start = t.start;
        var duration = Math.min(3800, Math.max(900, start * 0.95));
        var t0 = performance.now();
        function stepWin(now) {
          var p = Math.min((now - t0) / duration, 1);
          var y = start * (1 - easeInOutQuad(p));
          window.scrollTo(0, y);
          if (p < 1) window.requestAnimationFrame(stepWin);
          else finish();
        }
        window.requestAnimationFrame(stepWin);
        return;
      }
      var sc = t.el;
      var startSc = t.start;
      var dur = Math.min(3800, Math.max(900, startSc * 0.95));
      var t1 = performance.now();
      function stepEl(now) {
        var p = Math.min((now - t1) / dur, 1);
        sc.scrollTop = startSc * (1 - easeInOutQuad(p));
        if (p < 1) window.requestAnimationFrame(stepEl);
        else finish();
      }
      window.requestAnimationFrame(stepEl);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
