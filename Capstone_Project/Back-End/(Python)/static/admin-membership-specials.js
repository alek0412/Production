/**
 * Admin Layout — membership teaser + specials (name + description per block).
 */
(function () {
  'use strict';

  var teaserInput = document.getElementById('membership-specials-teaser-input');
  var itemsRoot = document.getElementById('membership-specials-items-admin');
  var toolbarEl = document.getElementById('membership-specials-toolbar');
  var btnAdd = document.getElementById('membership-specials-add');
  var btnSave = document.getElementById('membership-specials-save-all');
  var statusEl = document.getElementById('membership-specials-status');

  var workingItems = [];
  var loadStateSeq = 0;

  function parseResponseBody(r, text) {
    var j = {};
    if (text && text.length) {
      try {
        j = JSON.parse(text);
      } catch (e) {
        j = { message: text.slice(0, 200), _parseError: true };
      }
    }
    return { ok: r.ok, body: j };
  }

  function showStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#b91c1c' : '#15803d';
  }

  function renderItemsEditor() {
    if (!itemsRoot) return;
    if (toolbarEl && toolbarEl.parentNode) {
      toolbarEl.parentNode.removeChild(toolbarEl);
    }
    itemsRoot.innerHTML = '';
    workingItems.forEach(function (item, idx) {
      var card = document.createElement('div');
      card.className = 'admin-marketing-slot admin-membership-special-card';

      var h = document.createElement('h2');
      h.className = 'admin-marketing-slot-title';
      h.textContent = 'Special ' + (idx + 1);
      card.appendChild(h);

      var ln = document.createElement('label');
      ln.className = 'admin-marketing-label';
      ln.textContent = 'Name of Special';
      card.appendChild(ln);

      var nameIn = document.createElement('input');
      nameIn.type = 'text';
      nameIn.className = 'admin-marketing-input membership-sp-name-in';
      nameIn.maxLength = 200;
      nameIn.value = item.name || '';
      nameIn.autocomplete = 'off';
      card.appendChild(nameIn);

      var ld = document.createElement('label');
      ld.className = 'admin-marketing-label';
      ld.textContent = 'Description';
      card.appendChild(ld);

      var descTa = document.createElement('textarea');
      descTa.className = 'admin-marketing-input admin-marketing-textarea membership-sp-desc-in';
      descTa.rows = 6;
      descTa.value = item.description || '';
      card.appendChild(descTa);

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'btn btn-ghost admin-membership-special-remove';
      rm.textContent = 'Remove this special';
      rm.setAttribute('data-remove-index', String(idx));
      card.appendChild(rm);

      itemsRoot.appendChild(card);
    });

    if (toolbarEl && itemsRoot) {
      var cards = itemsRoot.querySelectorAll('.admin-membership-special-card');
      var lastCard = cards[cards.length - 1];
      if (lastCard) {
        lastCard.appendChild(toolbarEl);
      } else {
        itemsRoot.parentNode.insertBefore(toolbarEl, itemsRoot.nextSibling);
      }
    }

    itemsRoot.querySelectorAll('[data-remove-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-remove-index'), 10);
        if (!Number.isFinite(i)) return;
        workingItems.splice(i, 1);
        if (workingItems.length < 1) {
          workingItems.push({ name: '', description: '' });
        }
        renderItemsEditor();
      });
    });
  }

  function readFormIntoWorking() {
    if (!itemsRoot) return;
    var cards = itemsRoot.querySelectorAll('.admin-membership-special-card');
    var next = [];
    cards.forEach(function (card) {
      var n = card.querySelector('.membership-sp-name-in');
      var d = card.querySelector('.membership-sp-desc-in');
      next.push({
        name: n && n.value ? n.value.trim() : '',
        description: d && d.value ? d.value.slice(0, 4000) : '',
      });
    });
    workingItems = next;
  }

  function syncWorkingFromPayload(d) {
    if (!d || !Array.isArray(d.items)) {
      workingItems = [{ name: '', description: '' }];
      return;
    }
    workingItems = d.items.map(function (it) {
      return {
        name: typeof it.name === 'string' ? it.name : '',
        description: typeof it.description === 'string' ? it.description : '',
      };
    });
    if (workingItems.length < 1) {
      workingItems.push({ name: '', description: '' });
    }
  }

  function loadState() {
    var seq = ++loadStateSeq;
    fetch('/api/membership-specials-teaser', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (text) {
          return parseResponseBody(r, text);
        });
      })
      .then(function (x) {
        if (seq !== loadStateSeq) return;
        if (x.ok && x.body && typeof x.body.teaserText === 'string') {
          if (teaserInput) teaserInput.value = x.body.teaserText;
          syncWorkingFromPayload(x.body);
          renderItemsEditor();
        } else {
          syncWorkingFromPayload({});
          renderItemsEditor();
        }
      })
      .catch(function () {
        if (seq !== loadStateSeq) return;
        syncWorkingFromPayload({});
        renderItemsEditor();
      });
  }

  if (btnAdd && itemsRoot) {
    btnAdd.addEventListener('click', function () {
      readFormIntoWorking();
      workingItems.push({ name: '', description: '' });
      renderItemsEditor();
    });
  }

  if (btnSave && teaserInput && itemsRoot) {
    btnSave.addEventListener('click', function () {
      readFormIntoWorking();
      showStatus(statusEl, '', false);
      btnSave.disabled = true;
      fetch('/api/admin/membership-specials-teaser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          teaserText: teaserInput.value,
          items: workingItems,
        }),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            return parseResponseBody(r, text);
          });
        })
        .then(function (x) {
          if (x.ok && x.body && x.body.success) {
            showStatus(statusEl, 'Saved.', false);
            if (typeof x.body.teaserText === 'string' && teaserInput) {
              teaserInput.value = x.body.teaserText;
            }
            syncWorkingFromPayload(x.body);
            renderItemsEditor();
          } else {
            var msg =
              (x.body && x.body.message) ||
              (x.body && x.body._parseError ? 'Server error.' : 'Could not save.');
            if (x.body && x.body.message === 'Not authenticated') {
              msg = 'Session expired. Log in to the admin again.';
            }
            showStatus(statusEl, msg, true);
          }
        })
        .catch(function () {
          showStatus(statusEl, 'Network error.', true);
        })
        .then(function () {
          btnSave.disabled = false;
        });
    });
  }

  loadState();
})();
