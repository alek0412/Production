(function () {
  var state = { profile: null };
  var MAX_RECENT_ACTIVITY = 3;

  var editModal = document.getElementById('profile-edit-modal');
  var deleteModal = document.getElementById('profile-delete-modal');
  var editTriggers = [
    document.getElementById('profile-edit-trigger'),
    document.getElementById('profile-edit-trigger-secondary'),
  ].filter(Boolean);
  var deleteTriggers = [
    document.getElementById('profile-delete-trigger'),
    document.getElementById('profile-delete-trigger-secondary'),
  ].filter(Boolean);
  var closeBtns = Array.prototype.slice.call(document.querySelectorAll('[data-close-modal]'));
  var editForm = document.getElementById('profile-edit-form');
  var deleteInput = document.getElementById('delete-confirm-input');
  var confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  var passwordLastChangedEl = document.getElementById('profile-password-last-changed');

  function esc(s) {
    return String(s == null ? '' : s);
  }

  function fullName(p) {
    if (!p) return '—';
    var n = (esc(p.firstName) + ' ' + esc(p.lastName)).trim();
    return n || '—';
  }

  function emergencyFullName(ec) {
    if (!ec) return '—';
    var n = (esc(ec.firstName) + ' ' + esc(ec.lastName)).trim();
    return n || '—';
  }

  function initials(p) {
    var fn = esc(p && p.firstName)
      .charAt(0)
      .toUpperCase();
    var ln = esc(p && p.lastName)
      .charAt(0)
      .toUpperCase();
    var t = (fn + ln).trim();
    return t || '?';
  }

  function passwordChangedStorageKey(email) {
    return 'hbc_password_changed_at:' + String(email || '').trim().toLowerCase();
  }

  function passwordLastChangedLabel(iso) {
    if (!iso) return 'Last changed recently';
    var when = new Date(iso);
    if (!when || isNaN(when.getTime())) return 'Last changed recently';
    var now = new Date();
    var dayMs = 24 * 60 * 60 * 1000;
    var d0 = new Date(when.getFullYear(), when.getMonth(), when.getDate());
    var d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.floor((d1 - d0) / dayMs);
    if (days <= 0) return 'Last changed today';
    if (days === 1) return 'Last changed 1 day ago';
    return 'Last changed ' + days + ' days ago';
  }

  function readPasswordChangedAt(email) {
    if (!email) return '';
    try {
      return sessionStorage.getItem(passwordChangedStorageKey(email)) || '';
    } catch (e) {
      return '';
    }
  }

  function writePasswordChangedAt(email, iso) {
    if (!email || !iso) return;
    try {
      sessionStorage.setItem(passwordChangedStorageKey(email), String(iso));
    } catch (e) {}
  }

  function applyPasswordLastChanged(email, isoOverride) {
    if (!passwordLastChangedEl) return;
    var iso = isoOverride || readPasswordChangedAt(email);
    passwordLastChangedEl.textContent = passwordLastChangedLabel(iso);
  }

  function renderActivity(activities) {
    var ul = document.getElementById('profile-activity-list');
    var empty = document.getElementById('profile-activity-empty');
    if (!ul) return;
    ul.innerHTML = '';
    var list = Array.isArray(activities) ? activities.slice(0, MAX_RECENT_ACTIVITY) : [];
    if (!list.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    list.forEach(function (item) {
      var li = document.createElement('li');
      var p = document.createElement('p');
      p.textContent = item.title || '';
      var sm = document.createElement('small');
      sm.textContent = item.detail || '';
      li.appendChild(p);
      li.appendChild(sm);
      ul.appendChild(li);
    });
  }

  function applyProfile(p) {
    state.profile = p || null;
    if (!p) return;
    var nameEl = document.getElementById('profile-name');
    var emailEl = document.getElementById('profile-email');
    var phoneEl = document.getElementById('profile-phone');
    var avatar = document.querySelector('.profile-avatar');
    var badge = document.querySelector('.profile-card--account > h3.profile-subheading');
    if (nameEl) nameEl.textContent = fullName(p);
    if (emailEl) emailEl.textContent = p.email || '—';
    if (phoneEl) phoneEl.textContent = p.phone || '—';
    if (avatar) avatar.textContent = initials(p);
    if (badge) badge.hidden = true;
    var ec = p.emergencyContact;
    var ecNameEl = document.getElementById('profile-emergency-name');
    var ecEmailEl = document.getElementById('profile-emergency-email');
    var ecPhoneEl = document.getElementById('profile-emergency-phone');
    if (ecNameEl) ecNameEl.textContent = emergencyFullName(ec);
    if (ecEmailEl) ecEmailEl.textContent = ec && ec.email ? esc(ec.email) : '—';
    if (ecPhoneEl) ecPhoneEl.textContent = ec && ec.phone ? esc(ec.phone) : '—';
    applyPasswordLastChanged(p.email || '');
    try {
      if (p.firstName) {
        sessionStorage.setItem('hbc_customer_first_name', String(p.firstName).trim());
      }
    } catch (e) {}
  }

  function fillEditForm() {
    var p = state.profile;
    var name = document.getElementById('edit-name');
    var mail = document.getElementById('edit-email');
    var phone = document.getElementById('edit-phone');
    var password = document.getElementById('edit-password');
    var confirm = document.getElementById('edit-password-confirm');
    if (!p) {
      if (name) name.value = '';
      if (mail) mail.value = '';
      if (phone) phone.value = '';
      if (password) password.value = '';
      if (confirm) confirm.value = '';
      return;
    }
    if (name) name.value = fullName(p) === '—' ? '' : fullName(p);
    if (mail) mail.value = p.email || '';
    if (phone) phone.value = p.phone || '';
    if (password) password.value = '';
    if (confirm) confirm.value = '';
  }

  function splitName(full) {
    var t = full.trim();
    if (!t) return { first_name: '', last_name: '' };
    var i = t.indexOf(' ');
    if (i === -1) return { first_name: t, last_name: '' };
    return { first_name: t.slice(0, i).trim(), last_name: t.slice(i + 1).trim() };
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function showProfileLoadError(message) {
    var main = document.querySelector('main');
    if (!main) return;
    var el = document.getElementById('profile-load-error');
    if (!el) {
      el = document.createElement('div');
      el.id = 'profile-load-error';
      el.className = 'profile-load-error-banner';
      el.setAttribute('role', 'alert');
      main.insertBefore(el, main.firstChild);
    }
    el.textContent =
      message ||
      'We could not load your profile. Check your connection and refresh the page.';
    el.hidden = false;
  }

  function parseJsonResponse(r) {
    return r.text().then(function (text) {
      var data = null;
      try {
        data = text && text.length ? JSON.parse(text) : {};
      } catch (e) {
        data = null;
      }
      return { ok: r.ok, status: r.status, data: data };
    });
  }

  function fetchCustomerMeOnce() {
    return fetch('/api/customer-me', { credentials: 'same-origin' }).then(parseJsonResponse);
  }

  function fetchCustomerMeWithRetries(attempt, maxAttempts) {
    attempt = attempt || 0;
    maxAttempts = maxAttempts || 4;
    return fetchCustomerMeOnce().then(function (res) {
      if (res.ok && res.data && res.data.loggedIn === true) {
        return res;
      }
      if (res.ok && res.data && res.data.loggedIn === false) {
        return res;
      }
      if (attempt + 1 < maxAttempts) {
        var delay = 280 + attempt * 220;
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve(fetchCustomerMeWithRetries(attempt + 1, maxAttempts));
          }, delay);
        });
      }
      return res;
    });
  }

  fetchCustomerMeWithRetries(0, 4).then(function (res) {
    if (res.ok && res.data && res.data.loggedIn === false) {
      window.location.href = '/client/Client_Login.html';
      return;
    }
    if (!res.ok || !res.data || res.data.loggedIn !== true) {
      showProfileLoadError();
      return;
    }
    if (res.data.profile) {
      applyProfile(res.data.profile);
    }
    fetch('/api/customer-activity', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .then(function (act) {
        if (act && act.success && Array.isArray(act.activities)) {
          renderActivity(act.activities);
        } else {
          renderActivity([]);
        }
      })
      .catch(function () {
        renderActivity([]);
      });
  }).catch(function () {
    showProfileLoadError();
  });

  editTriggers.forEach(function (btn) {
    btn.addEventListener('click', function () {
      fillEditForm();
      openModal(editModal);
    });
  });

  deleteTriggers.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (deleteInput) deleteInput.value = '';
      if (confirmDeleteBtn) confirmDeleteBtn.disabled = true;
      openModal(deleteModal);
    });
  });

  closeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      closeModal(editModal);
      closeModal(deleteModal);
    });
  });

  [editModal, deleteModal].forEach(function (modal) {
    if (!modal) return;
    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        closeModal(modal);
      }
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeModal(editModal);
      closeModal(deleteModal);
    }
  });

  if (editForm) {
    editForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var nameInput = document.getElementById('edit-name');
      var emailInput = document.getElementById('edit-email');
      var phoneInput = document.getElementById('edit-phone');
      var passwordInput = document.getElementById('edit-password');
      var confirmInput = document.getElementById('edit-password-confirm');
      var newPassword = passwordInput ? passwordInput.value : '';
      var confirmPassword = confirmInput ? confirmInput.value : '';
      if (newPassword || confirmPassword) {
        if (newPassword !== confirmPassword) {
          alert('New password and confirm password must match.');
          return;
        }
      }
      var parts = splitName(nameInput ? nameInput.value : '');
      var body = {
        first_name: parts.first_name,
        last_name: parts.last_name,
        email: emailInput ? emailInput.value.trim() : '',
        phone: phoneInput ? phoneInput.value.trim() : '',
      };
      if (newPassword && newPassword.trim()) {
        body.password = newPassword;
      }
      var emailBeforeUpdate = state.profile && state.profile.email ? state.profile.email : body.email;
      fetch('/api/customer', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            return { ok: r.ok, status: r.status, text: text };
          });
        })
        .then(function (out) {
          if (!out.ok) {
            alert(out.text || 'Could not save changes. Try again.');
            return;
          }
          if (state.profile) {
            state.profile.firstName = parts.first_name;
            state.profile.lastName = parts.last_name;
            state.profile.email = body.email;
            state.profile.phone = body.phone;
            applyProfile(state.profile);
          }
          if (body.password) {
            var changedAt = new Date().toISOString();
            writePasswordChangedAt(emailBeforeUpdate, changedAt);
            writePasswordChangedAt(body.email, changedAt);
            applyPasswordLastChanged(body.email, changedAt);
          }
          closeModal(editModal);
        })
        .catch(function () {
          alert('Network error while saving.');
        });
    });
  }

  if (deleteInput && confirmDeleteBtn) {
    deleteInput.addEventListener('input', function () {
      confirmDeleteBtn.disabled = deleteInput.value.trim() !== 'DELETE';
    });
    confirmDeleteBtn.addEventListener('click', function () {
      fetch('/api/customer', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
        .then(function (r) {
          return r.text().then(function (text) {
            return { ok: r.ok, text: text };
          });
        })
        .then(function (out) {
          if (!out.ok) {
            alert(out.text || 'Could not delete account.');
            return;
          }
          try {
            sessionStorage.removeItem('hbc_customer_logged_in');
            sessionStorage.removeItem('hbc_customer_first_name');
            sessionStorage.removeItem('hbc_client_preview_mode');
          } catch (e) {}
          window.location.href = '/client/Client_Login.html';
        })
        .catch(function () {
          alert('Network error while deleting account.');
        });
    });
  }
})();
