/**
 * Admin Layout — dynamic slot count and upload/clear for upcoming event images (home dashboards).
 */
(function () {
  'use strict';

  var MIN = 1;
  var MAX = 6;
  var currentSlotCount = 3;

  function $(id) {
    return document.getElementById(id);
  }

  function showStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#b91c1c' : '#15803d';
  }

  function authFailureMessage(msg) {
    if (msg === 'Not authenticated') {
      return 'Session expired or you are not logged in as admin. Use the admin sign-in on the login page.';
    }
    return msg || 'Could not complete.';
  }

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

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error('Could not read file'));
      };
      reader.readAsDataURL(file);
    });
  }

  function renderSlots(count) {
    var root = $('marketing-slots-root');
    if (!root) return;
    root.className = 'admin-marketing-grid admin-marketing-grid--n' + count;
    root.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var slotEl = document.createElement('div');
      slotEl.className = 'admin-marketing-slot';
      slotEl.setAttribute('data-slot', String(i));
      slotEl.innerHTML =
        '<h2 class="admin-marketing-slot-title">Event image ' +
        (i + 1) +
        '</h2>' +
        '<div class="admin-marketing-preview" id="marketing-preview-' +
        i +
        '"></div>' +
        '<label class="admin-marketing-label" for="marketing-file-' +
        i +
        '">Image file</label>' +
        '<input type="file" id="marketing-file-' +
        i +
        '" class="admin-marketing-file" accept="image/jpeg,image/png,image/gif,image/webp">' +
        '<div class="admin-marketing-actions">' +
        '<button type="button" class="btn btn-primary" id="marketing-save-' +
        i +
        '">Save image</button>' +
        '<button type="button" class="btn btn-ghost" id="marketing-clear-' +
        i +
        '">Remove</button>' +
        '</div>' +
        '<p class="admin-marketing-status" id="marketing-status-' +
        i +
        '" role="status"></p>';
      root.appendChild(slotEl);
    }
    for (var j = 0; j < count; j++) {
      bindSlot(j);
    }
  }

  function fillPreviews(images) {
    var list = images || [];
    for (var i = 0; i < list.length; i++) {
      var slot = list[i] || {};
      var prev = $('marketing-preview-' + i);
      if (prev) {
        prev.innerHTML = '';
        if (slot.url) {
          var im = document.createElement('img');
          im.src = slot.url;
          im.alt = slot.alt || 'Preview';
          im.className = 'admin-marketing-preview-img';
          prev.appendChild(im);
        } else {
          var ph = document.createElement('span');
          ph.className = 'admin-marketing-preview-empty';
          ph.textContent = 'No image';
          prev.appendChild(ph);
        }
      }
    }
  }

  function loadState() {
    fetch('/api/upcoming-events', { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && typeof data.minSlots === 'number') MIN = data.minSlots;
        if (data && typeof data.maxSlots === 'number') MAX = data.maxSlots;
        var images = (data && data.images) || [];
        var n = typeof data.slotCount === 'number' ? data.slotCount : images.length;
        if (n < MIN) n = MIN;
        if (n > MAX) n = MAX;
        currentSlotCount = n;
        var sel = $('marketing-slot-count');
        if (sel && sel.value !== String(n)) sel.value = String(n);
        if (sel && sel.options.length === 0) populateSelect();
        renderSlots(n);
        fillPreviews(images);
      })
      .catch(function () {});
  }

  function populateSelect() {
    var sel = $('marketing-slot-count');
    if (!sel) return;
    sel.innerHTML = '';
    for (var o = MIN; o <= MAX; o++) {
      var opt = document.createElement('option');
      opt.value = String(o);
      opt.textContent = o === 1 ? '1 image' : o + ' images';
      sel.appendChild(opt);
    }
  }

  function bindSlot(slot) {
    var fileInput = $('marketing-file-' + slot);
    var saveBtn = $('marketing-save-' + slot);
    var clearBtn = $('marketing-clear-' + slot);
    var statusEl = $('marketing-status-' + slot);

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        showStatus(statusEl, '', false);
        var f = fileInput && fileInput.files && fileInput.files[0];
        if (!f) {
          showStatus(statusEl, 'Choose an image file first.', true);
          return;
        }
        fileToDataUrl(f)
          .then(function (dataUrl) {
            return fetch('/api/admin/upcoming-events', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slot: slot,
                dataUrl: dataUrl,
                alt: '',
              }),
            });
          })
          .then(function (r) {
            return r.text().then(function (text) {
              return parseResponseBody(r, text);
            });
          })
          .then(function (out) {
            if (out.ok && out.body && out.body.success) {
              showStatus(statusEl, 'Saved.', false);
              if (fileInput) fileInput.value = '';
              loadState();
            } else {
              showStatus(statusEl, authFailureMessage((out.body && out.body.message) || 'Could not save.'), true);
            }
          })
          .catch(function () {
            showStatus(statusEl, 'Network error.', true);
          });
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        showStatus(statusEl, '', false);
        fetch('/api/admin/upcoming-events', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot: slot, op: 'clear' }),
        })
          .then(function (r) {
            return r.text().then(function (text) {
              return parseResponseBody(r, text);
            });
          })
          .then(function (out) {
            if (out.ok && out.body && out.body.success) {
              showStatus(statusEl, 'Cleared.', false);
              loadState();
            } else {
              showStatus(statusEl, authFailureMessage((out.body && out.body.message) || 'Could not clear.'), true);
            }
          })
          .catch(function () {
            showStatus(statusEl, 'Network error.', true);
          });
      });
    }
  }

  function initSlotCountControl() {
    var sel = $('marketing-slot-count');
    var st = $('marketing-slot-count-status');
    if (!sel) return;
    populateSelect();

    sel.addEventListener('change', function () {
      var next = parseInt(sel.value, 10);
      if (!Number.isFinite(next) || next === currentSlotCount) return;
      if (next < currentSlotCount) {
        if (
          !confirm(
            'Fewer slots will remove the last event image slots and delete any images in them. Continue?'
          )
        ) {
          sel.value = String(currentSlotCount);
          return;
        }
      }
      showStatus(st, 'Updating…', false);
      fetch('/api/admin/upcoming-events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'setCount', count: next }),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            return parseResponseBody(r, text);
          });
        })
        .then(function (out) {
          if (out.ok && out.body && out.body.success) {
            currentSlotCount = next;
            showStatus(st, 'Layout updated.', false);
            loadState();
          } else {
            showStatus(st, authFailureMessage((out.body && out.body.message) || 'Could not update.'), true);
            sel.value = String(currentSlotCount);
          }
        })
        .catch(function () {
          showStatus(st, 'Network error.', true);
          sel.value = String(currentSlotCount);
        });
    });
  }

  fetch('/api/me', { credentials: 'include' })
    .then(function (r) {
      return r.json().then(function (data) {
        return { ok: r.ok, data: data };
      });
    })
    .then(function (x) {
      if (x.ok && x.data && x.data.loggedIn === true) {
        initSlotCountControl();
        loadState();
        return;
      }
      window.location.replace('/client/Client_Login.html');
    })
    .catch(function () {
      window.location.replace('/client/Client_Login.html');
    });
})();
