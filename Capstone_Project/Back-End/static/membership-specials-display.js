/**
 * Membership pages — teaser + specials body from API (plain text only).
 */
(function () {
  'use strict';

  var lastKey = '';

  function renderItems(items) {
    var inner = document.getElementById('membership-specials-inner');
    if (!inner || !items || !items.length) return;
    inner.innerHTML = '';
    items.forEach(function (item, idx) {
      var p = document.createElement('p');
      if (idx > 0) p.style.marginTop = '1rem';
      var title = document.createElement('strong');
      title.textContent = item.name || '';
      p.appendChild(title);
      var desc = item.description || '';
      if (desc.length > 0) {
        desc.split(/\r?\n/).forEach(function (line) {
          p.appendChild(document.createElement('br'));
          p.appendChild(document.createTextNode(line));
        });
      }
      inner.appendChild(p);
      if (idx < items.length - 1) {
        var hr = document.createElement('hr');
        hr.setAttribute(
          'style',
          'border: none; border-top: 1px solid rgba(255, 255, 255, 0.35); margin: 0.75rem 0;'
        );
        inner.appendChild(hr);
      }
    });
  }

  function payloadKey(d) {
    try {
      return JSON.stringify({
        revision: d && typeof d.revision === 'number' ? d.revision : 0,
        teaserText: d && typeof d.teaserText === 'string' ? d.teaserText : '',
        items: d && Array.isArray(d.items) ? d.items : [],
      });
    } catch (e) {
      return '';
    }
  }

  function refreshMembershipSpecials() {
    return fetch('/api/membership-specials-teaser', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var key = payloadKey(d);
        if (key === lastKey) return;
        lastKey = key;
        var teaser = document.getElementById('membership-specials-teaser-closed');
        if (teaser && d && typeof d.teaserText === 'string') {
          teaser.textContent = d.teaserText;
        }
        var inner = document.getElementById('membership-specials-inner');
        if (d && Array.isArray(d.items) && d.items.length) {
          renderItems(d.items);
        } else if (inner) {
          inner.innerHTML = '';
        }
      })
      .catch(function () {});
  }

  refreshMembershipSpecials();

  setInterval(function () {
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    refreshMembershipSpecials();
  }, 10000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      refreshMembershipSpecials();
    }
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      refreshMembershipSpecials();
    }
  });
})();
