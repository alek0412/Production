/**
 * Admin Layout — Availability sheet upload (same card pattern as upcoming event images).
 */
(function () {
  'use strict';

  var preview = document.getElementById('popular-times-preview');
  var fileInput = document.getElementById('popular-times-pdf-file');
  var btnSave = document.getElementById('popular-times-pdf-save');
  var btnReset = document.getElementById('popular-times-pdf-reset');
  var statusEl = document.getElementById('popular-times-pdf-status');
  var saveDefaultLabel = btnSave ? btnSave.textContent : 'Save image';
  var lastServerPayload = null;
  var pendingObjectUrl = null;
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

  function revokePending() {
    if (pendingObjectUrl) {
      URL.revokeObjectURL(pendingObjectUrl);
      pendingObjectUrl = null;
    }
  }

  function renderPreviewFromServer(d) {
    if (!preview) return;
    preview.innerHTML = '';
    if (!d || !d.hasCustom) {
      return;
    }
    var url = d.url;
    if (d.kind === 'image') {
      var im = document.createElement('img');
      im.src = url;
      im.alt = 'Availability times preview';
      im.className = 'admin-marketing-preview-img';
      preview.appendChild(im);
      return;
    }
    var obj = document.createElement('object');
    obj.className = 'admin-marketing-preview-pdf';
    obj.type = 'application/pdf';
    obj.data = url;
    obj.setAttribute('aria-label', 'PDF preview');
    var fallback = document.createElement('p');
    fallback.className = 'admin-marketing-preview-empty';
    fallback.textContent = 'PDF';
    obj.appendChild(fallback);
    preview.appendChild(obj);
  }

  function renderLocalPreview(file) {
    if (!preview || !file) return;
    preview.innerHTML = '';
    revokePending();

    if (file.type === 'application/pdf') {
      pendingObjectUrl = URL.createObjectURL(file);
      var obj = document.createElement('object');
      obj.className = 'admin-marketing-preview-pdf';
      obj.type = 'application/pdf';
      obj.data = pendingObjectUrl;
      obj.setAttribute('aria-label', 'PDF preview');
      var fallback = document.createElement('p');
      fallback.className = 'admin-marketing-preview-empty';
      fallback.textContent = 'PDF';
      obj.appendChild(fallback);
      preview.appendChild(obj);
      return;
    }

    if (file.type.indexOf('image/') === 0) {
      var reader = new FileReader();
      reader.onload = function () {
        if (!preview) return;
        preview.innerHTML = '';
        var im = document.createElement('img');
        im.src = reader.result;
        im.alt = 'Availability times preview';
        im.className = 'admin-marketing-preview-img';
        preview.appendChild(im);
      };
      reader.readAsDataURL(file);
    }
  }

  function loadState() {
    var seq = ++loadStateSeq;
    fetch('/api/popular-times-pdf', { credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (text) {
          return parseResponseBody(r, text);
        });
      })
      .then(function (x) {
        if (seq !== loadStateSeq) return;
        if (x.ok && x.body && x.body.url != null) {
          lastServerPayload = x.body;
          if (!(fileInput && fileInput.files && fileInput.files[0])) {
            renderPreviewFromServer(lastServerPayload);
          }
        }
      })
      .catch(function () {});
  }

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) {
        revokePending();
        renderPreviewFromServer(lastServerPayload);
        return;
      }
      renderLocalPreview(f);
    });
  }

  if (btnSave && fileInput) {
    btnSave.addEventListener('click', function () {
      showStatus(statusEl, '', false);
      var f = fileInput.files && fileInput.files[0];
      if (!f) {
        showStatus(statusEl, 'Choose a PDF or image file first.', true);
        return;
      }
      btnSave.disabled = true;
      btnSave.textContent = 'Saving…';
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        fetch('/api/admin/popular-times-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ dataUrl: dataUrl }),
        })
          .then(function (r) {
            return r.text().then(function (text) {
              return parseResponseBody(r, text);
            });
          })
          .then(function (x) {
            if (x.ok && x.body && x.body.success) {
              showStatus(statusEl, 'Saved.', false);
              revokePending();
              fileInput.value = '';
              lastServerPayload = {
                url: x.body.url,
                hasCustom: x.body.hasCustom,
                kind: x.body.kind,
              };
              renderPreviewFromServer(lastServerPayload);
            } else {
              var msg =
                (x.body && x.body.message) ||
                (x.body && x.body._parseError ? 'Server returned an error.' : 'Could not save.');
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
            btnSave.textContent = saveDefaultLabel;
          });
      };
      reader.onerror = function () {
        showStatus(statusEl, 'Could not read file.', true);
        btnSave.disabled = false;
        btnSave.textContent = saveDefaultLabel;
      };
      reader.readAsDataURL(f);
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', function (e) {
      e.preventDefault();
      showStatus(statusEl, '', false);
      btnReset.disabled = true;
      fetch('/api/admin/popular-times-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ op: 'clear' }),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            return parseResponseBody(r, text);
          });
        })
        .then(function (x) {
          if (x.ok && x.body && x.body.success) {
            showStatus(statusEl, '', false);
            revokePending();
            if (fileInput) fileInput.value = '';
            lastServerPayload = {
              url: x.body.url,
              hasCustom: x.body.hasCustom,
              kind: x.body.kind,
            };
            renderPreviewFromServer(lastServerPayload);
          } else {
            var msg = (x.body && x.body.message) || 'Could not clear.';
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
          btnReset.disabled = false;
        });
    });
  }

  renderPreviewFromServer(null);
  loadState();
})();

