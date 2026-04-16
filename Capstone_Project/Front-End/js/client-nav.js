/**
 * General + Client nav auth (public-facing nav link .nav-auth-link):
 * - Default: "Log in" → /client/Client_Login.html
 * - Customer session only: "Log out" → POST /api/customer-logout → General_Dashboard
 * - Admin session (/api/me) does NOT change this link — admins use Admin Log out separately.
 * - ?logged_in=1: just signed in as customer (nav shows Log out before cookie is readable)
 * - sessionStorage hbc_customer_logged_in: set on customer sign-in; cleared on logout or API says logged out
 */
(function () {
  var FOOTER_COPY = '\u00a9 2026 HOUSTON BADMINTON CENTER. ALL RIGHTS RESERVED.';
  var FOOTER_COPY_CLASS = 'hbc-copyright';
  function applyUnifiedFooterCopy() {
    var footer = document.querySelector('footer');
    if (!footer) return;

    var container = footer.querySelector('.container') || footer;
    var line = container.querySelector('p');
    if (!line) {
      line = document.createElement('p');
      container.appendChild(line);
    }

    line.textContent = FOOTER_COPY;
    line.classList.add(FOOTER_COPY_CLASS);
  }

  applyUnifiedFooterCopy();

  var link = document.querySelector('.nav-auth-link');
  if (!link) return;

  var path = (window.location && window.location.pathname ? window.location.pathname : '').toLowerCase();
  var onClientPage = /\/client\/client_.*\.html$/.test(path) || /client_.*\.html$/.test(path);
  if (onClientPage) {
    var membershipTabs = document.querySelectorAll(
      '.nav-tabs a.nav-tab[href="Client_Membership.html"], .nav-tabs a.nav-tab[href="/client/Client_Membership.html"]'
    );
    membershipTabs.forEach(function (membershipTab) {
      if (membershipTab && membershipTab.parentElement) {
        membershipTab.parentElement.removeChild(membershipTab);
      }
    });

    var aboutTabs = document.querySelectorAll(
      '.nav-tabs a.nav-tab[href="Client_About.html"], .nav-tabs a.nav-tab[href="/client/Client_About.html"]'
    );
    aboutTabs.forEach(function (aboutTab) {
      if (aboutTab && aboutTab.parentElement) {
        aboutTab.parentElement.removeChild(aboutTab);
      }
    });

    var navTabsContainer = document.querySelector('.nav-tabs');
    if (navTabsContainer) {
      var profileTab =
        navTabsContainer.querySelector('a.nav-tab[href="Client_Profile.html"]') ||
        navTabsContainer.querySelector('a.nav-tab[href="/client/Client_Profile.html"]');
      if (!profileTab) {
        profileTab = document.createElement('a');
        profileTab.className = 'nav-tab';
        profileTab.href = 'Client_Profile.html';
        profileTab.textContent = 'Profile';
      } else {
        profileTab.href = 'Client_Profile.html';
      }

      var altServicesTab =
        navTabsContainer.querySelector('a.nav-tab[href="Client_AlternateServices.html"]') ||
        navTabsContainer.querySelector('a.nav-tab[href="/client/Client_AlternateServices.html"]') ||
        navTabsContainer.querySelector('a.nav-tab[href="General_AlternateServices.html"]') ||
        navTabsContainer.querySelector('a.nav-tab[href="/client/General_AlternateServices.html"]');

      if (altServicesTab && altServicesTab.nextSibling !== profileTab) {
        navTabsContainer.insertBefore(profileTab, altServicesTab.nextSibling);
      } else if (!profileTab.parentElement) {
        navTabsContainer.appendChild(profileTab);
      }
    }
  }

  var GENERAL = '/client/General_Dashboard.html';
  var LOGIN_TAB_ADMIN_KEY = 'hbc_login_tab';
  var CUSTOMER_FLAG = 'hbc_customer_logged_in';
  var CUSTOMER_LOGOUT_SYNC_KEY = 'hbc_customer_logout_at';

  function setCustomerFlag() {
    try {
      sessionStorage.setItem(CUSTOMER_FLAG, '1');
    } catch (e) {}
  }

  function clearCustomerFlag() {
    try {
      sessionStorage.removeItem(CUSTOMER_FLAG);
      sessionStorage.removeItem('hbc_customer_first_name');
    } catch (e) {}
  }

  function hasCustomerFlag() {
    try {
      return sessionStorage.getItem(CUSTOMER_FLAG) === '1';
    } catch (e) {
      return false;
    }
  }

  function notifyCrossTabLogout() {
    try {
      localStorage.setItem(CUSTOMER_LOGOUT_SYNC_KEY, String(Date.now()));
    } catch (e) {}
  }

  function performCustomerLogout(adminIn) {
    clearCustomerFlag();
    if (!adminIn) {
      try {
        sessionStorage.setItem(LOGIN_TAB_ADMIN_KEY, 'admin');
      } catch (e) {}
    }
    notifyCrossTabLogout();
    fetch('/api/customer-logout', { method: 'POST', credentials: 'same-origin' })
      .catch(function () {})
      .then(function () {
        window.location.href = GENERAL;
      });
  }

  function safeJson(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) {
          return { loggedIn: false, _unreliable: true };
        }
        return r.json().then(
          function (data) {
            return data;
          },
          function () {
            return { loggedIn: false, _unreliable: true };
          }
        );
      })
      .catch(function () {
        return { loggedIn: false, _unreliable: true };
      });
  }

  function showLogOut(onClick) {
    link.textContent = 'Log out';
    link.href = '#';
    link.setAttribute('aria-label', 'Log out and return to the public home page');
    link.addEventListener('click', function (e) {
      e.preventDefault();
      onClick();
    });
  }

  var params = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  if (params && params.get('logged_in') === '1') {
    setCustomerFlag();
    showLogOut(function () {
      performCustomerLogout(false);
    });
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    return;
  }

  Promise.all([safeJson('/api/me'), safeJson('/api/customer-me')]).then(function (results) {
    var adminIn = results[0] && results[0].loggedIn === true;
    var customerRes = results[1] || {};
    var customerLoggedIn = customerRes.loggedIn === true;
    var customerExplicitOut = customerRes.loggedIn === false && !customerRes._unreliable;

    if (customerLoggedIn) {
      setCustomerFlag();
    } else if (customerExplicitOut) {
      clearCustomerFlag();
    } else if (customerRes._unreliable && hasCustomerFlag()) {
      customerLoggedIn = true;
    }

    // Only customer login controls "Log out" here. An admin cookie alone must not show Log out
    // (e.g. user has Admin Layout open in another tab but never signed in as a customer).
    if (!customerLoggedIn) {
      return;
    }

    showLogOut(function () {
      performCustomerLogout(adminIn);
    });
  });

  window.addEventListener('storage', function (e) {
    if (e && e.key === CUSTOMER_LOGOUT_SYNC_KEY) {
      clearCustomerFlag();
      window.location.href = GENERAL;
    }
  });
})();

(function () {
  "use strict";

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

  function findPrimaryScrollContainer() {
    var vh = window.innerHeight;
    var sh = getDocScrollHeight();
    if (sh > vh + 4) return null;
    var best = null;
    var bestArea = 0;
    var nodes = document.body ? document.body.getElementsByTagName("*") : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var st = window.getComputedStyle(el);
      var oy = st.overflowY;
      if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") continue;
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
    var nodes = document.body ? document.body.getElementsByTagName("*") : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var st = window.getComputedStyle(el);
      if (st.overflowY !== "auto" && st.overflowY !== "scroll" && st.overflowY !== "overlay") continue;
      if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = 0;
    }
  }

  function pickScrollTargetForClick() {
    var winY = window.scrollY || document.documentElement.scrollTop || 0;
    var bestEl = null;
    var bestTop = 0;
    var nodes = document.body ? document.body.getElementsByTagName("*") : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var st = window.getComputedStyle(el);
      if (st.overflowY !== "auto" && st.overflowY !== "scroll" && st.overflowY !== "overlay") continue;
      if (el.clientHeight < 80) continue;
      if (el.scrollHeight <= el.clientHeight + 2) continue;
      if (el.scrollTop > bestTop) {
        bestTop = el.scrollTop;
        bestEl = el;
      }
    }
    if (winY > bestTop) return { type: "window", start: winY };
    if (bestEl && bestTop > 0) return { type: "element", el: bestEl, start: bestTop };
    if (winY > 0) return { type: "window", start: winY };
    return null;
  }

  function ensureBackToTopButton() {
    var existing = document.getElementById("gh-back-top");
    if (existing) return existing;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "gh-back-top";
    btn.setAttribute("aria-label", "Back to top");
    btn.setAttribute("aria-hidden", "true");
    btn.setAttribute("tabindex", "-1");
    btn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>' +
      "</svg>";
    document.body.appendChild(btn);
    return btn;
  }

  function initBackToTop() {
    var path = (window.location && window.location.pathname ? window.location.pathname : "").toLowerCase();
    if (/\/client\/(general_contact|client_contact)\.html$/.test(path) || /(general_contact|client_contact)\.html$/.test(path)) {
      return;
    }
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var back = ensureBackToTopButton();
    if (!back) return;

    var nestedScrollEl = null;

    var toggleBack = function () {
      if (isAtScrollBottom()) {
        back.classList.add("gh-back-top--visible");
        back.setAttribute("aria-hidden", "false");
        back.removeAttribute("tabindex");
      } else {
        back.classList.remove("gh-back-top--visible");
        back.setAttribute("aria-hidden", "true");
        back.setAttribute("tabindex", "-1");
      }
    };

    function bindNestedScroll() {
      if (nestedScrollEl) {
        nestedScrollEl.removeEventListener("scroll", toggleBack);
        nestedScrollEl = null;
      }
      var n = findPrimaryScrollContainer();
      if (n) {
        nestedScrollEl = n;
        n.addEventListener("scroll", toggleBack, { passive: true });
      }
    }

    toggleBack();
    bindNestedScroll();
    window.addEventListener("scroll", toggleBack, { passive: true });
    window.addEventListener("resize", function () {
      bindNestedScroll();
      toggleBack();
    }, { passive: true });

    back.addEventListener("click", function () {
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
      if (t.type === "window") {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBackToTop);
  } else {
    initBackToTop();
  }
})();

(function () {
  "use strict";

  function initAltPageServicesMenu() {
    var root = document.querySelector("[data-alt-services]");
    if (!root) return;

    var btn = root.querySelector(".alt-inpage-services__trigger");
    var menu = root.querySelector(".alt-inpage-services__dropdown");
    if (!btn || !menu) return;

    function setOpen(open) {
      root.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      menu.setAttribute("aria-hidden", open ? "false" : "true");
    }

    setOpen(false);

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!root.classList.contains("is-open"));
    });

    menu.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function () {
        setOpen(false);
      });
    });

    document.addEventListener("click", function (e) {
      if (!root.classList.contains("is-open")) return;
      if (root.contains(e.target)) return;
      setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!root.classList.contains("is-open")) return;
      setOpen(false);
      btn.focus();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAltPageServicesMenu);
  } else {
    initAltPageServicesMenu();
  }
})();

function getNavPath() {
    return window.location.pathname;
}