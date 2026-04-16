/**
 * Admin Layout — About gallery: up to 20 image slots (Layout page only).
 */
(function () {
  'use strict';

  var MIN = 1;
  var MAX = 20;
  var currentSlotCount = 6;

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
      return 'Session expired. Log in to the admin again.';
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
    var root = $('about-gallery-slots-root');
    if (!root) return;
    root.className = 'admin-marketing-grid';
    root.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var slotEl = document.createElement('div');
      slotEl.className = 'admin-marketing-slot';
      slotEl.setAttribute('data-slot', String(i));
      slotEl.innerHTML =
        '<h2 class="admin-marketing-slot-title">Picture ' +
        (i + 1) +
        '</h2>' +
        '<div class="admin-marketing-preview" id="about-gallery-preview-' +
        i +
        '"></div>' +
        '<label class="admin-marketing-label" for="about-gallery-file-' +
        i +
        '">PDF or image file</label>' +
        '<input type="file" id="about-gallery-file-' +
        i +
        '" class="admin-marketing-file" accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.heic,.avif">' +
        '<div class="admin-marketing-actions">' +
        '<button type="button" class="btn btn-primary" id="about-gallery-save-' +
        i +
        '">Save</button>' +
        '<button type="button" class="btn btn-ghost" id="about-gallery-clear-' +
        i +
        '">Remove</button>' +
        '</div>' +
        '<p class="admin-marketing-status" id="about-gallery-status-' +
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
      var prev = $('about-gallery-preview-' + i);
      if (prev) {
        prev.innerHTML = '';
        if (slot.url) {
          var isPdf = slot.kind === 'pdf' || /\.pdf(\?|$)/i.test(slot.url);
          if (isPdf) {
            var obj = document.createElement('object');
            obj.className = 'admin-marketing-preview-pdf';
            obj.type = 'application/pdf';
            obj.data = slot.url;
            obj.setAttribute('aria-label', 'PDF preview');
            var pf = document.createElement('p');
            pf.className = 'admin-marketing-preview-empty';
            pf.textContent = 'PDF';
            obj.appendChild(pf);
            prev.appendChild(obj);
          } else {
            var im = document.createElement('img');
            im.src = slot.url;
            im.alt = slot.alt || 'Preview';
            im.className = 'admin-marketing-preview-img';
            prev.appendChild(im);
          }
        } else {
          var ph = document.createElement('span');
          ph.className = 'admin-marketing-preview-empty';
          ph.textContent = 'No file';
          prev.appendChild(ph);
        }
      }
    }
  }

  function loadState() {
    fetch('/api/about-gallery-asset', { credentials: 'include' })
      .then(function (r) {
        return r.text().then(function (text) {
          return parseResponseBody(r, text);
        });
      })
      .then(function (out) {
        var data = out && out.body ? out.body : {};
        if (!(out && out.ok)) {
          return;
        }
        if (data && typeof data.minSlots === 'number') MIN = data.minSlots;
        if (data && typeof data.maxSlots === 'number') MAX = data.maxSlots;
        var images = (data && data.images) || [];
        var n = typeof data.slotCount === 'number' ? data.slotCount : images.length;
        if (n < MIN) n = MIN;
        if (n > MAX) n = MAX;
        currentSlotCount = n;
        var sel = $('about-gallery-slot-count');
        if (sel && sel.value !== String(n)) sel.value = String(n);
        if (sel && sel.options.length === 0) populateSelect();
        renderSlots(n);
        fillPreviews(images);
      })
      .catch(function () {});
  }

  function populateSelect() {
    var sel = $('about-gallery-slot-count');
    if (!sel) return;
    sel.innerHTML = '';
    for (var o = MIN; o <= MAX; o++) {
      var opt = document.createElement('option');
      opt.value = String(o);
      opt.textContent = o === 1 ? '1 picture' : o + ' pictures';
      sel.appendChild(opt);
    }
  }

  function bindSlot(slot) {
    var fileInput = $('about-gallery-file-' + slot);
    var saveBtn = $('about-gallery-save-' + slot);
    var clearBtn = $('about-gallery-clear-' + slot);
    var statusEl = $('about-gallery-status-' + slot);

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        showStatus(statusEl, '', false);
        var f = fileInput && fileInput.files && fileInput.files[0];
        if (!f) {
          showStatus(statusEl, 'Choose a PDF or image file first.', true);
          return;
        }
        fileToDataUrl(f)
          .then(function (dataUrl) {
            return fetch('/api/admin/about-gallery-asset', {
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
        fetch('/api/admin/about-gallery-asset', {
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
              showStatus(statusEl, 'Removed.', false);
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
    var sel = $('about-gallery-slot-count');
    var st = $('about-gallery-slot-count-status');
    if (!sel) return;
    populateSelect();

    sel.addEventListener('change', function () {
      var next = parseInt(sel.value, 10);
      if (!Number.isFinite(next) || next === currentSlotCount) return;
      if (next < currentSlotCount) {
        if (
          !window.confirm(
            'Fewer slots will remove the last picture slots and delete any images in them. Continue?'
          )
        ) {
          sel.value = String(currentSlotCount);
          return;
        }
      }
      showStatus(st, 'Updating…', false);
      fetch('/api/admin/about-gallery-asset', {
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
            showStatus(st, 'Updated.', false);
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

  function initClearAll() {
    var btn = $('about-gallery-clear-all');
    var st = $('about-gallery-global-status');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!window.confirm('Remove every uploaded gallery picture? The public About pages will show an empty gallery until you upload again.')) {
        return;
      }
      showStatus(st, 'Removing…', false);
      btn.disabled = true;
      fetch('/api/admin/about-gallery-asset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'clearAll' }),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            return parseResponseBody(r, text);
          });
        })
        .then(function (out) {
          if (out.ok && out.body && out.body.success) {
            showStatus(st, 'All pictures removed.', false);
            loadState();
          } else {
            showStatus(st, authFailureMessage((out.body && out.body.message) || 'Could not clear.'), true);
          }
        })
        .catch(function () {
          showStatus(st, 'Network error.', true);
        })
        .then(function () {
          btn.disabled = false;
        });
    });
  }

  initSlotCountControl();
  initClearAll();
  loadState();
})();
