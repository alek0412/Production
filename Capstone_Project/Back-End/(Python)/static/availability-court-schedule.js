/**
 * Embeds the admin-style court schedule on Availability pages (below Popular times).
 * Loads GET /api/schedule-reservations — same pending + confirmed rows as the admin calendar for that day.
 * - data-availability-embed="guest" (General): clicks prompt waiver message.
 * - data-availability-embed="client" (Client): logged-in customers can POST /api/reservation (Flask).
 */
(function () {
  'use strict';

  var mode = document.body.getAttribute('data-availability-embed') || 'guest';
  var root = document.getElementById('availability-court-schedule-root');
  if (!root) return;

  var WAIVER_MSG =
    'You must sign the waiver to make an account to reserve!';
  var RESERVATION_THANK_YOU_MSG =
    'Thank you for reserving. If you need to cancel, call 346-229-4921.';
  var scheduleDate = new Date();
  scheduleDate.setHours(12, 0, 0, 0);

  var PICKLEBALL_COURT_NUMBERS = [2, 4, 6, 8, 10];
  var TABLE_TENNIS_COURT_NUMBER = 11;
  var BADMINTON_ONLY_COURTS = [1, 3, 5, 7, 9, 12];

  function isPickleballCourtNumber(n) {
    return n !== null && PICKLEBALL_COURT_NUMBERS.indexOf(n) !== -1;
  }
  function isTableTennisCourtNumber(n) {
    return n === TABLE_TENNIS_COURT_NUMBER;
  }
  /** Match Admin_Reservations.html: pending = orange; confirmed uses court-type colors. */
  function visualClassForDbBlock(courtNum, status) {
    var pending = Number(status) === 1;
    if (pending) return 'is-orange';
    if (isPickleballCourtNumber(courtNum)) return 'is-event';
    if (isTableTennisCourtNumber(courtNum)) return 'is-table-tennis';
    return 'is-blue';
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatScheduleDateIso(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isSameCalendarDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  var CAL_COLS_HTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    .map(function (n) {
      var label = 'Court ' + n;
      var tt = n === 11 ? ' data-court-use="table-tennis-practice"' : '';
      return '<div class="cal-col" data-court="' + label + '"' + tt + '><div class="cal-col-body"></div></div>';
    })
    .join('');

  /** Same shell as admin: empty court bodies; blocks come from API. */
  var SCHEDULE_INNER =
    '<div class="reservations-shell">' +
    '<div class="res-date-toolbar" id="pub-res-date-toolbar" role="region" aria-label="Schedule date">' +
    '<div class="res-date-nav">' +
    '<button type="button" class="res-date-arrow" id="pub-res-date-prev" aria-label="Previous day">‹</button>' +
    '<div class="res-date-label-block">' +
    '<span class="res-date-weekday" id="pub-res-date-weekday"></span>' +
    '<time class="res-date-full" id="pub-res-date-full" datetime=""></time>' +
    '</div>' +
    '<button type="button" class="res-date-arrow" id="pub-res-date-next" aria-label="Next day">›</button>' +
    '</div>' +
    '</div>' +
    '<div class="reservations-schedule-outer" id="pub-res-schedule-outer">' +
    '<div class="reservations-schedule-wrap">' +
    '<div class="res-schedule-corner" aria-hidden="true"></div>' +
    '<div class="res-schedule-headers" id="pub-res-schedule-headers">' +
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      .map(function (n) {
        var label = 'Court ' + n;
        var extra = n === 11 ? ' cal-col-head--stack' : '';
        var inner =
          n === 11
            ? '<span class="cal-col-head-label cal-col-head-label--stack"><span class="cal-col-head-line">Court 11</span><span class="cal-col-head-sub">Badminton / table tennis</span></span>'
            : '<span class="cal-col-head-label">' + label + '</span>';
        return (
          '<div class="cal-col-head' +
          extra +
          '">' +
          inner +
          '<button type="button" class="cal-col-add-btn pub-cal-col-add" data-court="' +
          label +
          '" title="Reserve" aria-label="Reserve on ' +
          label +
          '"><span aria-hidden="true">+</span></button></div>'
        );
      })
      .join('') +
    '</div>' +
    '<aside class="reservations-time-scale" id="pub-reservations-time-scale" aria-label="Time scale"></aside>' +
    '<section class="reservations-calendar" id="pub-reservations-calendar" aria-label="Court availability">' +
    CAL_COLS_HTML +
    '</section>' +
    '</div>' +
    '</div>' +
    '</div>';

  function hhmm24ToMinutes(s) {
    var p = String(s || '').trim().split(':');
    var h = parseInt(p[0], 10);
    var m = parseInt(p[1] || '0', 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return h * 60 + m;
  }

  function formatMinutesAsTime12(totalMins) {
    var t = totalMins % (24 * 60);
    if (t < 0) t += 24 * 60;
    var h24 = Math.floor(t / 60);
    var min = t % 60;
    var suffix = h24 >= 12 ? 'PM' : 'AM';
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + String(min).padStart(2, '0') + ' ' + suffix;
  }

  function hhmm24To12Label(s) {
    return formatMinutesAsTime12(hhmm24ToMinutes(s));
  }

  function hhmm24ToSlotStart(s) {
    var minutes = hhmm24ToMinutes(s);
    var base = 10 * 60;
    return Math.max(0, Math.min(27, Math.floor((minutes - base) / 30)));
  }

  function hhmm24ToSlotEnd(s) {
    var minutes = hhmm24ToMinutes(s);
    var base = 10 * 60;
    return Math.max(0, Math.min(28, Math.ceil((minutes - base) / 30)));
  }

  function slotIndexToHhmm(slotIdx) {
    var idx = Number.isFinite(slotIdx) ? Math.max(0, Math.min(27, slotIdx)) : 0;
    var mins = 10 * 60 + idx * 30;
    return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }

  function decorateBlockNoActions(block) {
    if (!block || block.dataset.decorated === '1') return;
    var lines = block.innerHTML
      .split('<br>')
      .map(function (line) {
        return line.replace(/<[^>]+>/g, '').trim();
      })
      .filter(Boolean);
    if (!lines.length) return;
    var first = lines[0];
    var rest = lines.slice(1).join(' ');
    block.innerHTML = '';
    var titleEl = document.createElement('div');
    titleEl.className = 'cal-block-title';
    titleEl.textContent = first;
    block.appendChild(titleEl);
    if (rest) {
      var metaEl = document.createElement('div');
      metaEl.className = 'cal-block-meta';
      metaEl.textContent = rest;
      block.appendChild(metaEl);
    }
    block.dataset.decorated = '1';
  }

  function applyBlockSlotLayout(block) {
    if (!block) return;
    var start = parseInt(block.dataset.slotStart, 10);
    var span = parseInt(block.dataset.slotSpan, 10);
    var s = Number.isFinite(start) ? start : 0;
    var n = Number.isFinite(span) ? span : 2;
    block.style.setProperty('--slot-start', String(s));
    block.style.setProperty('--slot-span', String(Math.max(1, n)));
  }

  function buildScheduleBlock(row) {
    var courtNum = row.court_id != null ? parseInt(row.court_id, 10) : null;
    var block = document.createElement('div');
    block.className =
      'cal-block cal-block--db cal-block--public ' + visualClassForDbBlock(courtNum, row.reservation_status);
    var ss = hhmm24ToSlotStart(row.reservation_start_time);
    var es = hhmm24ToSlotEnd(row.reservation_end_time);
    var span = Math.max(1, es - ss);
    block.dataset.slotStart = String(ss);
    block.dataset.slotSpan = String(span);
    block.dataset.reservationId = String(row.reservation_id);

    var name =
      [row.customer_first_name, row.customer_last_name].filter(Boolean).join(' ').trim() || 'Guest';
    var t1 = hhmm24To12Label(row.reservation_start_time);
    var t2 = hhmm24To12Label(row.reservation_end_time);
    var meta =
      t1 +
      ' – ' +
      t2 +
      ' · ' +
      (Number(row.reservation_status) === 1 ? 'Pending approval' : 'Confirmed');

    var titleEl = document.createElement('div');
    titleEl.className = 'cal-block-title';
    titleEl.textContent = name;
    var metaEl = document.createElement('div');
    metaEl.className = 'cal-block-meta';
    metaEl.textContent = meta;
    block.appendChild(titleEl);
    block.appendChild(metaEl);
    block.dataset.decorated = '1';
    applyBlockSlotLayout(block);
    return block;
  }

  function refreshScheduleFromApi() {
    var calendar = document.getElementById('pub-reservations-calendar');
    if (!calendar) return Promise.resolve();
    var dateIso = formatScheduleDateIso(scheduleDate);
    return fetch('/api/schedule-reservations?date=' + encodeURIComponent(dateIso), {
      credentials: 'same-origin',
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (out) {
        calendar.querySelectorAll('.cal-block--db').forEach(function (el) {
          el.remove();
        });
        if (!out.ok || !out.data || !out.data.success || !out.data.reservations) return;
        out.data.reservations.forEach(function (row) {
          var cid = row.court_id;
          var col = calendar.querySelector('.cal-col[data-court="Court ' + cid + '"]');
          if (!col) return;
          var body = col.querySelector('.cal-col-body');
          if (!body) return;
          body.appendChild(buildScheduleBlock(row));
        });
      })
      .catch(function () {});
  }

  function buildTimeScale(el) {
    if (!el || el.dataset.built === '1') return;
    for (var minutes = 10 * 60; minutes <= 23 * 60 + 30; minutes += 30) {
      var h24 = Math.floor(minutes / 60);
      var m = minutes % 60;
      var suffix = h24 >= 12 ? 'PM' : 'AM';
      var h12 = ((h24 + 11) % 12) + 1;
      var label = h12 + ':' + String(m).padStart(2, '0') + ' ' + suffix;
      var row = document.createElement('div');
      row.className = 'time-slot';
      row.textContent = label;
      el.appendChild(row);
    }
    el.dataset.built = '1';
  }

  function updateDateDisplay() {
    var wk = document.getElementById('pub-res-date-weekday');
    var full = document.getElementById('pub-res-date-full');
    var toolbar = document.getElementById('pub-res-date-toolbar');
    var outer = document.getElementById('pub-res-schedule-outer');
    if (!wk || !full) return;
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    var today = new Date();
    today.setHours(12, 0, 0, 0);
    var isToday = isSameCalendarDay(scheduleDate, today);
    wk.textContent = days[scheduleDate.getDay()] + (isToday ? ' · Today' : '');
    full.textContent =
      months[scheduleDate.getMonth()] + ' ' + scheduleDate.getDate() + ', ' + scheduleDate.getFullYear();
    full.setAttribute('datetime', formatScheduleDateIso(scheduleDate));
    if (toolbar) {
      toolbar.classList.toggle('res-date-toolbar--other-day', !isToday);
      toolbar.classList.toggle('res-date-toolbar--today', isToday);
    }
    if (outer) {
      outer.setAttribute('data-selected-date', formatScheduleDateIso(scheduleDate));
      outer.classList.toggle('res-schedule-outer--other-day', !isToday);
    }
  }

  function courtNumFromName(name) {
    var m = String(name || '').match(/Court\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function courtRuleDetails(courtNum) {
    if (courtNum === null) return '';
    if (isTableTennisCourtNumber(courtNum)) {
      return (
        'Court 11 details: badminton or table tennis. ' +
        'Badminton coaching can be scheduled when the court is set for badminton. ' +
        'Walk-ins are usually directed to Courts 1, 3, and 5.'
      );
    }
    if (isPickleballCourtNumber(courtNum)) {
      return (
        'Court ' +
        courtNum +
        ' details: pickleball is allowed on weekdays from 10:00 AM to 5:00 PM. ' +
        'Outside that window, use this court for badminton. ' +
        'Badminton coaching can be scheduled when the court is set for badminton.'
      );
    }
    if (BADMINTON_ONLY_COURTS.indexOf(courtNum) !== -1) {
      return (
        'Court ' +
        courtNum +
        ' details: badminton only. ' +
        'Badminton coaching is allowed. Walk-ins are usually prioritized on Courts 1, 3, and 5.'
      );
    }
    return 'Court ' + courtNum + ' details: badminton rules apply.';
  }

  function fillTimeSelect(sel) {
    if (!sel) return;
    sel.innerHTML = '';
    for (var m = 10 * 60; m <= 23 * 60 + 45; m += 15) {
      var h = Math.floor(m / 60);
      var min = m % 60;
      var opt = document.createElement('option');
      opt.value = pad2(h) + ':' + pad2(min);
      opt.textContent = formatMinutesAsTime12(m);
      sel.appendChild(opt);
    }
  }

  function syncEndTimesAfterStart(startSel, endSel) {
    if (!startSel || !endSel) return;
    var startMin = hhmm24ToMinutes(startSel.value);
    var previousEnd = endSel.value;
    endSel.innerHTML = '';
    for (var m = 10 * 60; m <= 23 * 60 + 45; m += 15) {
      if (m <= startMin) continue;
      var h = Math.floor(m / 60);
      var min = m % 60;
      var opt = document.createElement('option');
      opt.value = pad2(h) + ':' + pad2(min);
      opt.textContent = formatMinutesAsTime12(m);
      endSel.appendChild(opt);
    }
    if (!endSel.options.length) return;
    var wanted = hhmm24ToMinutes(previousEnd);
    if (wanted > startMin) {
      endSel.value = previousEnd;
    } else if (startMin + 60 <= 23 * 60 + 45) {
      endSel.value = pad2(Math.floor((startMin + 60) / 60)) + ':' + pad2((startMin + 60) % 60);
    } else {
      endSel.selectedIndex = 0;
    }
  }

  function ensureModal() {
    var existing = document.getElementById('pub-res-modal-overlay');
    if (existing) return existing;
    var wrap = document.createElement('div');
    wrap.id = 'pub-res-modal-overlay';
    wrap.className = 'pub-res-modal-overlay is-hidden';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="pub-res-modal" role="dialog" aria-modal="true" aria-labelledby="pub-res-modal-title">' +
      '<button type="button" class="pub-res-modal-close" id="pub-res-modal-close" aria-label="Close">×</button>' +
      '<h3 id="pub-res-modal-title">Request a reservation</h3>' +
      '<p class="pub-res-modal-court" id="pub-res-modal-court-line"></p>' +
      '<p class="pub-res-modal-details is-hidden" id="pub-res-modal-court-details"></p>' +
      '<p class="pub-res-modal-date" id="pub-res-modal-date-line"></p>' +
      '<div class="pub-res-modal-fields">' +
      '<div class="pub-res-field">' +
      '<label class="pub-res-label" for="pub-res-start"><span class="pub-res-label-text">Start time</span></label>' +
      '<div class="pub-res-select-wrap"><select id="pub-res-start" aria-label="Start time"></select></div>' +
      '</div>' +
      '<div class="pub-res-field">' +
      '<label class="pub-res-label" for="pub-res-end"><span class="pub-res-label-text">End time</span></label>' +
      '<div class="pub-res-select-wrap"><select id="pub-res-end" aria-label="End time"></select></div>' +
      '</div>' +
      '</div>' +
      '<p class="pub-res-modal-msg" id="pub-res-modal-msg"></p>' +
      '<div class="pub-res-modal-actions">' +
      '<button type="button" class="btn btn-primary" id="pub-res-submit">Submit request</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    var startSel = document.getElementById('pub-res-start');
    var endSel = document.getElementById('pub-res-end');
    fillTimeSelect(startSel);
    fillTimeSelect(endSel);
    if (startSel && startSel.options[16]) startSel.selectedIndex = 16;
    if (startSel && endSel) {
      syncEndTimesAfterStart(startSel, endSel);
      startSel.addEventListener('change', function () {
        syncEndTimesAfterStart(startSel, endSel);
      });
    }
    document.getElementById('pub-res-modal-close').addEventListener('click', function () {
      wrap.classList.add('is-hidden');
      wrap.setAttribute('aria-hidden', 'true');
    });
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) {
        wrap.classList.add('is-hidden');
        wrap.setAttribute('aria-hidden', 'true');
      }
    });
    return wrap;
  }

  var pendingCourtName = '';
  var pendingStartHhmm = '';

  function openBookingModal(courtName, startHhmm) {
    pendingCourtName = String(courtName || '').trim();
    pendingStartHhmm = String(startHhmm || '').trim();
    var overlay = ensureModal();
    var courtLine = document.getElementById('pub-res-modal-court-line');
    var courtDetails = document.getElementById('pub-res-modal-court-details');
    var dateLine = document.getElementById('pub-res-modal-date-line');
    var msg = document.getElementById('pub-res-modal-msg');
    var startSel = document.getElementById('pub-res-start');
    var endSel = document.getElementById('pub-res-end');
    if (startSel && pendingStartHhmm && startSel.querySelector('option[value="' + pendingStartHhmm + '"]')) {
      startSel.value = pendingStartHhmm;
    }
    if (startSel && endSel) {
      syncEndTimesAfterStart(startSel, endSel);
    }
    var courtNum = courtNumFromName(pendingCourtName);
    var details = mode === 'client' ? courtRuleDetails(courtNum) : '';
    if (courtLine) courtLine.textContent = pendingCourtName || 'Court';
    if (courtDetails) {
      if (details) {
        courtDetails.textContent = details;
        courtDetails.classList.remove('is-hidden');
      } else {
        courtDetails.textContent = '';
        courtDetails.classList.add('is-hidden');
      }
    }
    if (dateLine) dateLine.textContent = 'Date: ' + formatScheduleDateIso(scheduleDate);
    if (msg) {
      msg.textContent = '';
      msg.className = 'pub-res-modal-msg';
    }
    overlay.classList.remove('is-hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function submitReservation() {
    var msg = document.getElementById('pub-res-modal-msg');
    var startSel = document.getElementById('pub-res-start');
    var endSel = document.getElementById('pub-res-end');
    var n = courtNumFromName(pendingCourtName);
    if (n == null) {
      if (msg) {
        msg.textContent = 'Invalid court.';
        msg.className = 'pub-res-modal-msg pub-res-modal-msg--err';
      }
      return;
    }
    var body = {
      court_id: n,
      reservation_date: formatScheduleDateIso(scheduleDate),
      reservation_start_time: startSel ? startSel.value : '10:00',
      reservation_end_time: endSel ? endSel.value : '11:00',
    };
    if (msg) msg.textContent = 'Sending…';
    fetch('/api/reservation', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.text().then(function (t) {
          return { ok: r.ok, status: r.status, text: t };
        });
      })
      .then(function (out) {
        if (msg) {
          if (out.ok && out.status === 201) {
            msg.textContent = (out.text || '').trim() || 'Reservation submitted.';
            msg.className = 'pub-res-modal-msg pub-res-modal-msg--ok';
            refreshScheduleFromApi();
            window.alert(RESERVATION_THANK_YOU_MSG);
          } else {
            msg.textContent = (out.text || '').trim() || 'Could not create reservation.';
            msg.className = 'pub-res-modal-msg pub-res-modal-msg--err';
          }
        }
      })
      .catch(function () {
        if (msg) {
          msg.textContent = 'Network error.';
          msg.className = 'pub-res-modal-msg pub-res-modal-msg--err';
        }
      });
  }

  function attachSubmitOnce() {
    var btn = document.getElementById('pub-res-submit');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', submitReservation);
  }

  function showWaiverMessage() {
    window.alert(WAIVER_MSG);
  }

  function showLoginToReserveMessage() {
    window.alert('Please log in with your customer account to reserve a court.');
  }

  function pickStartTimeFromClick(col, clickTarget, clientY) {
    if (!col) return '';
    var body = col.querySelector('.cal-col-body');
    if (!body) return '';
    // Existing reservation blocks should not drive new start-time selection.
    if (clickTarget && clickTarget.closest && clickTarget.closest('.cal-block--db')) return '';
    var rect = body.getBoundingClientRect();
    if (!rect || rect.height <= 0) return '';
    var y = clientY - rect.top;
    if (!Number.isFinite(y)) return '';
    var ratio = Math.max(0, Math.min(0.9999, y / rect.height));
    var slot = Math.floor(ratio * 28);
    return slotIndexToHhmm(slot);
  }

  function handleScheduleClick(e, canBook) {
    var block = e.target.closest && e.target.closest('.cal-block');
    if (block && block.classList.contains('cal-block--db')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var addBtn = e.target.closest && e.target.closest('.pub-cal-col-add');
    var col = e.target.closest && e.target.closest('.cal-col');
    if (!addBtn && !col && !block) return;
    if (!canBook) {
      e.preventDefault();
      if (mode === 'guest') showWaiverMessage();
      else showLoginToReserveMessage();
      return;
    }
    var courtName = '';
    if (addBtn) courtName = addBtn.getAttribute('data-court') || '';
    else if (col) courtName = col.getAttribute('data-court') || '';
    else if (block) {
      var c = block.closest('.cal-col');
      courtName = c ? c.getAttribute('data-court') || '' : '';
    }
    if (!courtName) return;
    e.preventDefault();
    var chosenStart = '';
    if (!addBtn) {
      chosenStart = pickStartTimeFromClick(col || (block && block.closest && block.closest('.cal-col')), e.target, e.clientY);
    }
    openBookingModal(courtName, chosenStart);
    attachSubmitOnce();
  }

  root.innerHTML =
    '<div class="public-res-embed reservations-page">' +
    '<p class="av-court-schedule-lead">Live schedule matches the staff calendar: pending requests and confirmed bookings refresh automatically. Orange blocks are awaiting approval. Use <strong>+</strong> or a column to request a time.</p>' +
    SCHEDULE_INNER +
    '</div>';

  var calendar = document.getElementById('pub-reservations-calendar');
  var timeScale = document.getElementById('pub-reservations-time-scale');
  buildTimeScale(timeScale);
  updateDateDisplay();
  refreshScheduleFromApi();
  window.setInterval(refreshScheduleFromApi, 20000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refreshScheduleFromApi();
  });

  var prev = document.getElementById('pub-res-date-prev');
  var next = document.getElementById('pub-res-date-next');
  if (prev)
    prev.addEventListener('click', function () {
      var d = new Date(scheduleDate.getTime());
      d.setDate(d.getDate() - 1);
      scheduleDate = d;
      updateDateDisplay();
      refreshScheduleFromApi();
    });
  if (next)
    next.addEventListener('click', function () {
      var d = new Date(scheduleDate.getTime());
      d.setDate(d.getDate() + 1);
      scheduleDate = d;
      updateDateDisplay();
      refreshScheduleFromApi();
    });

  var shell = document.querySelector('.public-res-embed .reservations-shell');
  if (shell) {
    fetch('/api/customer-me', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var loggedIn = data && data.loggedIn === true;
        var canBook = mode !== 'guest' && loggedIn;
        shell.addEventListener(
          'click',
          function (e) {
            handleScheduleClick(e, canBook);
          },
          true
        );
      })
      .catch(function () {
        shell.addEventListener(
          'click',
          function (e) {
            handleScheduleClick(e, mode !== 'guest' && false);
          },
          true
        );
      });
  }
})();
