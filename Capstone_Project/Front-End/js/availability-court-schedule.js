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
  /** 'back' | 'forward' | null — blue vs green date chrome after prev/next */
  var scheduleNavDir = null;

  var PICKLEBALL_COURT_NUMBERS = [2, 4, 6, 8, 10];
  var TABLE_TENNIS_COURT_NUMBER = 11;
  var BADMINTON_ONLY_COURTS = [1, 3, 5, 7, 9, 12];

  function isPickleballCourtNumber(n) {
    return n !== null && PICKLEBALL_COURT_NUMBERS.indexOf(n) !== -1;
  }
  function isTableTennisCourtNumber(n) {
    return n === TABLE_TENNIS_COURT_NUMBER;
  }
  /**
   * UI only: pending stays orange. For this day's loaded rows, each confirmed reservation_id gets a
   * distinct hue (evenly spaced on the wheel) so no two confirmed bookings share the same color.
   */
  function buildUniqueConfirmedHueMap(reservations) {
    var ids = [];
    var seen = Object.create(null);
    (reservations || []).forEach(function (row) {
      if (Number(row.reservation_status) === 1) return;
      var raw = row.reservation_id;
      if (raw === undefined || raw === null || raw === '') return;
      var key = String(raw);
      if (seen[key]) return;
      seen[key] = true;
      var id = parseInt(raw, 10);
      if (!Number.isFinite(id)) id = 0;
      ids.push(id);
    });
    ids.sort(function (a, b) {
      return a - b;
    });
    var n = ids.length;
    var map = Object.create(null);
    if (n === 0) return map;
    ids.forEach(function (rid, index) {
      map[String(rid)] = (index * (360 / n)) % 360;
    });
    return map;
  }

  function applyReservationUniqueTone(block, hue) {
    if (!block || hue == null || !Number.isFinite(hue)) return;
    block.classList.add('cal-block--unique-tone');
    block.style.setProperty('--res-hue', String(hue));
  }

  function visualClassForDbBlock(courtNum, status, reservationId) {
    if (Number(status) === 1) return 'is-orange';
    return 'cal-block--unique-tone';
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

  /** Mon–Fri 11:30 PM; Sat 11:30 PM; Sun 10:30 PM (matches Flask / admin APIs). */
  function getDayCloseMinutes(d) {
    var wd = d.getDay();
    if (wd === 0) return 22 * 60 + 30;
    return 23 * 60 + 30;
  }

  function scheduleGridSlotCountForDate(d) {
    var base = getDayOpenMinutes(d);
    return Math.round((getDayCloseMinutes(d) - base) / 30) + 1;
  }

  /**
   * Position blocks by exact start/end (30-min slot = 1.0). Prevents back-to-back bookings
   * (e.g. 6:30–6:45 and 6:45–7:00) from sharing the same integer slot and hiding each other.
   */
  function reservationBlockSlotLayoutFromTimes(startHhmm, endHhmm) {
    var base = getDayOpenMinutes(scheduleDate);
    var startM = hhmm24ToMinutes(startHhmm);
    var endM = hhmm24ToMinutes(endHhmm);
    var startFrac = (startM - base) / 30;
    var spanFrac = (endM - startM) / 30;
    if (spanFrac <= 0) spanFrac = 0.5;
    spanFrac = Math.max(0.5, spanFrac);
    return { slotStart: startFrac, slotSpan: spanFrac };
  }

  function reservationEndedBeforeNow(row) {
    var ds = String(row && row.reservation_date ? row.reservation_date : '').trim();
    var ts = String(row && row.reservation_end_time ? row.reservation_end_time : '').trim();
    if (!ds || !ts) return false;
    var dp = ds.split('-');
    if (dp.length !== 3) return false;
    var y = parseInt(dp[0], 10);
    var mo = parseInt(dp[1], 10) - 1;
    var da = parseInt(dp[2], 10);
    var tp = ts.split(':');
    var h = parseInt(tp[0], 10);
    var mi = parseInt(tp[1] || '0', 10);
    var se = parseInt(tp[2] || '0', 10);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return false;
    if (!Number.isFinite(h) || !Number.isFinite(mi)) return false;
    var endDt = new Date(y, mo, da, h, mi, Number.isFinite(se) ? se : 0);
    return endDt.getTime() < Date.now();
  }

  function slotIndexToHhmm(slotIdx) {
    var base = getDayOpenMinutes(scheduleDate);
    var maxIdx = scheduleGridSlotCountForDate(scheduleDate) - 1;
    var idx = Number.isFinite(slotIdx) ? Math.max(0, Math.min(maxIdx, slotIdx)) : 0;
    var mins = base + idx * 30;
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
    var start = parseFloat(block.dataset.slotStart);
    var span = parseFloat(block.dataset.slotSpan);
    var s = Number.isFinite(start) ? start : 0;
    var n = Number.isFinite(span) ? span : 0.5;
    block.style.setProperty('--slot-start', String(s));
    block.style.setProperty('--slot-span', String(Math.max(0.5, n)));
  }

  function buildScheduleBlock(row, hueMap) {
    var courtNum = row.court_id != null ? parseInt(row.court_id, 10) : null;
    var block = document.createElement('div');
    block.className =
      'cal-block cal-block--db cal-block--public ' +
      visualClassForDbBlock(courtNum, row.reservation_status, row.reservation_id);
    if (Number(row.reservation_status) !== 1) {
      var hm = hueMap || {};
      var h = hm[String(row.reservation_id)];
      if (h == null || !Number.isFinite(h)) {
        h = ((parseInt(row.reservation_id, 10) || 0) * 137.508) % 360;
      }
      applyReservationUniqueTone(block, h);
    }
    if (reservationEndedBeforeNow(row)) {
      block.classList.add('cal-block--past');
      block.dataset.reservationPast = '1';
    }
    var layout = reservationBlockSlotLayoutFromTimes(row.reservation_start_time, row.reservation_end_time);
    block.dataset.slotStart = String(layout.slotStart);
    block.dataset.slotSpan = String(layout.slotSpan);
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
        var reservations =
          out.ok && out.data && out.data.success && out.data.reservations ? out.data.reservations : [];
        var hueMap = buildUniqueConfirmedHueMap(reservations);
        reservations.forEach(function (row) {
          var cid = row.court_id;
          var col = calendar.querySelector('.cal-col[data-court="Court ' + cid + '"]');
          if (!col) return;
          var body = col.querySelector('.cal-col-body');
          if (!body) return;
          body.appendChild(buildScheduleBlock(row, hueMap));
        });
        refillPubModalTimesIfVisible();
      })
      .catch(function () {});
  }

  /** If the booking modal is open, refresh start/end options (e.g. today’s “next slot” moved). */
  function refillPubModalTimesIfVisible() {
    var overlay = document.getElementById('pub-res-modal-overlay');
    if (!overlay || overlay.classList.contains('is-hidden')) return;
    var startSel = document.getElementById('pub-res-start');
    var endSel = document.getElementById('pub-res-end');
    if (!startSel || !endSel) return;
    var keep = startSel.value;
    fillStartSelectForScheduleDate(startSel);
    if (keep && startSel.querySelector('option[value="' + keep + '"]')) {
      startSel.value = keep;
    } else if (startSel.options.length && !startSel.options[0].disabled) {
      startSel.selectedIndex = 0;
    }
    syncEndTimesAfterStart(startSel, endSel);
  }

  function buildTimeScale(el) {
    if (!el) return;
    el.innerHTML = '';
    el.dataset.built = '';
    var openM = getDayOpenMinutes(scheduleDate);
    var closeM = getDayCloseMinutes(scheduleDate);
    for (var minutes = openM; minutes <= closeM; minutes += 30) {
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

  function applyPublicScheduleGridLayout() {
    var wrap = document.querySelector('.public-res-embed .reservations-schedule-wrap');
    if (wrap) {
      var wd = scheduleDate.getDay();
      wrap.classList.toggle('schedule-grid--weekend', wd === 0 || wd === 6);
      wrap.classList.toggle('schedule-grid--sunday', wd === 0);
    }
    buildTimeScale(timeScale);
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
      toolbar.classList.toggle('res-date-toolbar--today', isToday);
      toolbar.classList.toggle('res-date-toolbar--nav-back', scheduleNavDir === 'back');
      toolbar.classList.toggle('res-date-toolbar--nav-forward', scheduleNavDir === 'forward');
    }
    if (outer) {
      outer.setAttribute('data-selected-date', formatScheduleDateIso(scheduleDate));
      outer.classList.toggle('res-schedule-outer--nav-back', scheduleNavDir === 'back');
      outer.classList.toggle('res-schedule-outer--nav-forward', scheduleNavDir === 'forward');
    }
    applyPublicScheduleGridLayout();
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

  /** Match Flask: weekday 10:00; Sat/Sun 08:00. */
  function getDayOpenMinutes(d) {
    var wd = d.getDay();
    return wd === 0 || wd === 6 ? 8 * 60 : 10 * 60;
  }

  /**
   * Earliest bookable start (minutes from midnight, local): business open, or next 15-min
   * tick after now when the schedule day is today.
   */
  function earliestStartMinutesForScheduleDay(dayDate) {
    var openM = getDayOpenMinutes(dayDate);
    var todayMarker = new Date();
    todayMarker.setHours(12, 0, 0, 0);
    if (!isSameCalendarDay(dayDate, todayMarker)) {
      return openM;
    }
    var now = new Date();
    var nowM = now.getHours() * 60 + now.getMinutes();
    var nextFifteen = Math.ceil((nowM + 1) / 15) * 15;
    return Math.max(openM, nextFifteen);
  }

  function fillStartSelectForScheduleDate(startSel) {
    if (!startSel) return;
    var minM = earliestStartMinutesForScheduleDay(scheduleDate);
    var lastStartM = getDayCloseMinutes(scheduleDate) - 15;
    startSel.innerHTML = '';
    if (minM > lastStartM) {
      var dis = document.createElement('option');
      dis.value = '';
      dis.disabled = true;
      dis.textContent = 'No start times available for this day';
      startSel.appendChild(dis);
      return;
    }
    for (var m = minM; m <= lastStartM; m += 15) {
      var h = Math.floor(m / 60);
      var min = m % 60;
      var opt = document.createElement('option');
      opt.value = pad2(h) + ':' + pad2(min);
      opt.textContent = formatMinutesAsTime12(m);
      startSel.appendChild(opt);
    }
  }

  /** Closing matches day (Sun 22:30, else 23:30); max duration 4.5h (Flask). */
  function syncEndTimesAfterStart(startSel, endSel) {
    if (!startSel || !endSel) return;
    if (!startSel.value) {
      endSel.innerHTML = '';
      return;
    }
    var startMin = hhmm24ToMinutes(startSel.value);
    if (!Number.isFinite(startMin)) {
      endSel.innerHTML = '';
      return;
    }
    var previousEnd = endSel.value;
    var dayCloseMin = getDayCloseMinutes(scheduleDate);
    var maxEndMin = Math.min(dayCloseMin, startMin + 270);
    endSel.innerHTML = '';
    for (var m = startMin + 15; m <= maxEndMin; m += 15) {
      var h = Math.floor(m / 60);
      var min = m % 60;
      var opt = document.createElement('option');
      opt.value = pad2(h) + ':' + pad2(min);
      opt.textContent = formatMinutesAsTime12(m);
      endSel.appendChild(opt);
    }
    if (!endSel.options.length) return;
    var wanted = hhmm24ToMinutes(previousEnd);
    if (wanted > startMin && wanted <= maxEndMin) {
      endSel.value = previousEnd;
    } else if (startMin + 60 <= maxEndMin) {
      var def = startMin + 60;
      endSel.value = pad2(Math.floor(def / 60)) + ':' + pad2(def % 60);
    } else {
      endSel.selectedIndex = 0;
    }
  }

  function ensureModal() {
    var existing = document.getElementById('pub-res-modal-overlay');
    if (existing) {
      if (!document.getElementById('pub-res-modal-same-court-hint')) {
        var dateLineEl = document.getElementById('pub-res-modal-date-line');
        var hintEl = document.createElement('p');
        hintEl.id = 'pub-res-modal-same-court-hint';
        hintEl.className = 'pub-res-modal-same-court-hint is-hidden';
        hintEl.setAttribute('role', 'status');
        if (dateLineEl && dateLineEl.parentNode) {
          dateLineEl.parentNode.insertBefore(hintEl, dateLineEl.nextSibling);
        }
      }
      return existing;
    }
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
      '<p class="pub-res-modal-same-court-hint is-hidden" id="pub-res-modal-same-court-hint" role="status"></p>' +
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
    fillStartSelectForScheduleDate(startSel);
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

  function applySameCourtBookingGuard(courtNum) {
    var hint = document.getElementById('pub-res-modal-same-court-hint');
    var submitBtn = document.getElementById('pub-res-submit');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute('data-pub-res-blocked');
    }
    if (mode !== 'client' || courtNum == null) {
      if (hint) {
        hint.textContent = '';
        hint.classList.add('is-hidden');
      }
      return;
    }
    fetch('/api/customer-bookings', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (out) {
        if (!hint || !submitBtn) return;
        if (!out.ok || !out.data || !out.data.success || !out.data.reservations) {
          hint.classList.add('is-hidden');
          return;
        }
        var block = null;
        for (var i = 0; i < out.data.reservations.length; i++) {
          var row = out.data.reservations[i];
          if (Number(row.courtId) !== courtNum) continue;
          if (row.segment !== 'upcoming') continue;
          block = row;
          break;
        }
        if (block) {
          hint.textContent =
            'You already have an active reservation on this court until that booking ends (' +
            (block.detailLine || block.headline || 'see My Bookings') +
            '). You can request another time on this court after that, or ask staff for help.';
          hint.classList.remove('is-hidden');
          submitBtn.disabled = true;
          submitBtn.setAttribute('data-pub-res-blocked', '1');
        } else {
          hint.textContent = '';
          hint.classList.add('is-hidden');
        }
      })
      .catch(function () {
        if (hint) hint.classList.add('is-hidden');
      });
  }

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
    fillStartSelectForScheduleDate(startSel);
    var minStartM = earliestStartMinutesForScheduleDay(scheduleDate);
    if (startSel && pendingStartHhmm) {
      var wantM = hhmm24ToMinutes(pendingStartHhmm);
      if (wantM >= minStartM && startSel.querySelector('option[value="' + pendingStartHhmm + '"]')) {
        startSel.value = pendingStartHhmm;
      } else if (startSel.options.length && !startSel.options[0].disabled) {
        startSel.selectedIndex = 0;
      }
    } else if (startSel && startSel.options.length && !startSel.options[0].disabled) {
      startSel.selectedIndex = 0;
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
    applySameCourtBookingGuard(courtNum);
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
    if (
      !startSel ||
      !startSel.value ||
      (startSel.options[0] && startSel.options[0].disabled)
    ) {
      if (msg) {
        msg.textContent = 'No valid start times for this day. Pick another date or try later.';
        msg.className = 'pub-res-modal-msg pub-res-modal-msg--err';
      }
      return;
    }
    if (!endSel || !endSel.value) {
      if (msg) {
        msg.textContent = 'Choose an end time.';
        msg.className = 'pub-res-modal-msg pub-res-modal-msg--err';
      }
      return;
    }
    var body = {
      court_id: n,
      reservation_date: formatScheduleDateIso(scheduleDate),
      reservation_start_time: startSel.value,
      reservation_end_time: endSel.value,
    };
    var submitBtnGuard = document.getElementById('pub-res-submit');
    if (submitBtnGuard && submitBtnGuard.getAttribute('data-pub-res-blocked') === '1') {
      if (msg) {
        msg.textContent =
          'Wait until your current reservation on this court ends before requesting another slot, or ask staff.';
        msg.className = 'pub-res-modal-msg pub-res-modal-msg--err';
      }
      return;
    }
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
    var n = scheduleGridSlotCountForDate(scheduleDate);
    var slot = Math.floor(ratio * n);
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
      scheduleNavDir = 'back';
      var d = new Date(scheduleDate.getTime());
      d.setDate(d.getDate() - 1);
      scheduleDate = d;
      updateDateDisplay();
      refreshScheduleFromApi();
      refillPubModalTimesIfVisible();
    });
  if (next)
    next.addEventListener('click', function () {
      scheduleNavDir = 'forward';
      var d = new Date(scheduleDate.getTime());
      d.setDate(d.getDate() + 1);
      scheduleDate = d;
      updateDateDisplay();
      refreshScheduleFromApi();
      refillPubModalTimesIfVisible();
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
