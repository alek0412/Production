/**
 * Admin schedule: list / cancel / create reservation for a customer (MySQL).
 * Active calendar: reservation_status 1 (pending) and 2 (approved).
 * Cancel sets reservation_status = 4 (canceled) — rows are kept for history.
 *
 * Waiver: 1 = Available to book, 2 = Pending/hold (active reservation). When the last active
 * reservation is canceled, set waiver back to 1.
 *
 * POST /api/admin/reservation-create — same booking rules as Flask customer POST, but inserts
 * reservation_status = 2 (confirmed). Customer self-service POST uses status 1 (pending).
 */
const db = require('../db/connection');

const BUSINESS = {
  weekday: { startMin: 10 * 60, closeMin: 23 * 60 + 30 },
  saturday: { startMin: 8 * 60, closeMin: 23 * 60 + 30 },
  sunday: { startMin: 8 * 60, closeMin: 22 * 60 + 30 },
};

/** pyDow: Monday=0 … Sunday=6 (matches Python weekday()). */
function businessHoursForPythonDow(pyDow) {
  if (pyDow < 5) return BUSINESS.weekday;
  if (pyDow === 5) return BUSINESS.saturday;
  return BUSINESS.sunday;
}
const VALID_MINUTE_SUFFIXES = ['00', '15', '30', '45'];


/** Monday=0 … Sunday=6 (matches Python weekday()). */
function pythonWeekdayFromYMD(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return 0;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

/** Calendar date string YYYY-MM-DD for "today" in US/Central (matches Flask `central_time`). */
function centralYMDToday() {
  const d = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Whole calendar days from Central "today" to `ymd` (both YYYY-MM-DD). */
function calendarDaysFromCentralToday(ymd) {
  const today = centralYMDToday();
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m1 || !m2) return null;
  const t0 = Date.UTC(+m1[1], +m1[2] - 1, +m1[3]);
  const t1 = Date.UTC(+m2[1], +m2[2] - 1, +m2[3]);
  return Math.round((t1 - t0) / 864e5);
}

/** Lexicographic compare with `comparisonNowCentral()` — reservation start as Central wall time. */
function comparisonStartCentral(reservationDate, startHHMM) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(startHHMM || '').trim());
  if (!m) return '';
  const hh = String(parseInt(m[1], 10)).padStart(2, '0');
  return `${reservationDate} ${hh}:${m[2]}:00`;
}

function parseHHMM(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function timeOverlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

/** After canceling a row, clear waiver hold only if customer has no other not-yet-ended (1,2) reservation. */
async function restoreBookingEligibilityIfNoActiveReservations(conn, customerId) {
  if (customerId == null) return;
  const [rows] = await conn.execute(
    'SELECT reservation_date, reservation_end_time, reservation_status FROM reservation WHERE customer_id = ? AND reservation_status IN (1, 2)',
    [customerId]
  );
  if (!customerHasBlockingReservation(rows || [])) {
    await conn.execute('UPDATE waiver SET waiver_status = 1 WHERE customer_id = ?', [customerId]);
  }
}

function getCookie(req, name) {
  const c = req.headers.cookie || '';
  const parts = c.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.startsWith(name + '=')) return decodeURIComponent(p.slice(name.length + 1).trim());
  }
  return null;
}

function formatDate(val) {
  if (val == null) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function formatTime(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val.length > 5 ? val.slice(0, 5) : val;
  if (val instanceof Date) {
    const h = val.getHours();
    const m = val.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return String(val);
}

/** Wall-clock "now" in America/Chicago as `YYYY-MM-DD HH:MM:SS` for lexicographic compare with reservation end. */
function comparisonNowCentral() {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : '00';
  };
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function reservationEndComparable(dateVal, endTimeVal) {
  const ymd = formatDate(dateVal);
  const t = formatTime(endTimeVal);
  const hm = t.length >= 5 ? t.slice(0, 5) : '00:00';
  return `${ymd} ${hm}:00`;
}

/** Pending (1) or confirmed (2) rows that have not reached end time in US/Central yet. */
function customerHasBlockingReservation(rows) {
  const nowStr = comparisonNowCentral();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const st = Number(r.reservation_status);
    if (st !== 1 && st !== 2) continue;
    const endStr = reservationEndComparable(r.reservation_date, r.reservation_end_time);
    if (nowStr < endStr) return true;
  }
  return false;
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function getUrlQuery(req) {
  try {
    const u = new URL(req.url || '/', 'http://localhost');
    return u.searchParams;
  } catch (e) {
    return new URLSearchParams();
  }
}

module.exports = async function handleAdminScheduleReservations(req, res, ctx) {
  const { pathname, parseBody, hasAdminSessionCookie } = ctx;

  const isGet =
    req.method === 'GET' &&
    (pathname === '/api/admin/schedule-reservations' || pathname === '/api/admin/schedule-reservations/');
  const isDelete =
    req.method === 'DELETE' &&
    (pathname === '/api/admin/schedule-reservations' || pathname === '/api/admin/schedule-reservations/');
  const isCreate =
    req.method === 'POST' &&
    (pathname === '/api/admin/reservation-create' || pathname === '/api/admin/reservation-create/');

  if (!isGet && !isDelete && !isCreate) {
    return false;
  }

  if (!hasAdminSessionCookie(req)) {
    sendJson(res, 401, { success: false, message: 'Unauthorized' });
    return true;
  }

  if (isGet) {
    const dateStr = (getUrlQuery(req).get('date') || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      sendJson(res, 400, { success: false, message: 'Query "date" must be YYYY-MM-DD' });
      return true;
    }
    try {
      const { rows } = await db.query(
        `SELECT r.reservation_id, r.court_id, r.customer_id, r.waiver_id, r.reservation_date,
                r.reservation_start_time, r.reservation_end_time, r.reservation_status, r.employee_id,
                c.customer_first_name, c.customer_last_name, c.phone AS customer_phone
         FROM reservation r
         LEFT JOIN customer c ON c.customer_id = r.customer_id
         WHERE r.reservation_date = ?
           AND r.reservation_status IN (1, 2)
         ORDER BY r.court_id ASC, r.reservation_start_time ASC`,
        [dateStr]
      );
      const reservations = (rows || []).map((row) => ({
        reservation_id: row.reservation_id,
        court_id: row.court_id,
        customer_id: row.customer_id,
        waiver_id: row.waiver_id,
        reservation_date: formatDate(row.reservation_date),
        reservation_start_time: formatTime(row.reservation_start_time),
        reservation_end_time: formatTime(row.reservation_end_time),
        reservation_status: row.reservation_status,
        customer_first_name: row.customer_first_name,
        customer_last_name: row.customer_last_name,
        phone: row.customer_phone != null ? String(row.customer_phone).trim() : '',
        // Admin-created reservations are inserted as confirmed (2) without employee_id.
        // Customer-created reservations (approved later) have employee_id set by approval flow.
        can_edit: Number(row.reservation_status) === 2 && row.employee_id == null,
      }));
      sendJson(res, 200, { success: true, reservations });
    } catch (e) {
      console.error('[admin schedule-reservations GET]', e.message);
      sendJson(res, 503, { success: false, message: 'Unable to load schedule' });
    }
    return true;
  }

  if (isDelete) {
    let body = {};
    try {
      body = await parseBody(req);
    } catch (e) {
      sendJson(res, 400, { success: false, message: 'Invalid request body' });
      return true;
    }
    const rid = parseInt(String(body.reservation_id || ''), 10);
    if (!Number.isFinite(rid)) {
      sendJson(res, 400, { success: false, message: 'Missing or invalid reservation_id' });
      return true;
    }
    const employeeIdRaw = getCookie(req, 'admin_employee_id');
    const employeeId = employeeIdRaw != null && employeeIdRaw !== '' ? parseInt(employeeIdRaw, 10) : NaN;
    if (!Number.isFinite(employeeId)) {
      sendJson(res, 401, {
        success: false,
        message: 'Sign out and sign in again to cancel reservations.',
      });
      return true;
    }
    const conn = await db.getClient();
    try {
      await conn.beginTransaction();
      const [sel] = await conn.execute(
        'SELECT reservation_id, reservation_status, waiver_id, customer_id FROM reservation WHERE reservation_id = ? AND reservation_status IN (1, 2)',
        [rid]
      );
      if (!sel.length) {
        await conn.rollback();
        sendJson(res, 404, { success: false, message: 'Reservation not found or not active' });
        return true;
      }
      const customerId = sel[0].customer_id;
      const [upd] = await conn.execute(
        'UPDATE reservation SET reservation_status = 4, employee_id = ? WHERE reservation_id = ? AND reservation_status IN (1, 2)',
        [employeeId, rid]
      );
      if (!upd.affectedRows) {
        await conn.rollback();
        sendJson(res, 409, { success: false, message: 'Could not update reservation' });
        return true;
      }
      await restoreBookingEligibilityIfNoActiveReservations(conn, customerId);
      await conn.commit();
      sendJson(res, 200, { success: true, reservation_id: rid, reservation_status: 4 });
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {}
      console.error('[admin schedule-reservations DELETE]', e.message);
      sendJson(res, 503, { success: false, message: 'Unable to cancel reservation' });
    } finally {
      conn.release();
    }
    return true;
  }

  if (isCreate) {
    let body = {};
    try {
      body = await parseBody(req);
    } catch (e) {
      sendJson(res, 400, { success: false, message: 'Invalid request body' });
      return true;
    }

    const court = parseInt(String(body.court_id ?? ''), 10);
    const customer = parseInt(String(body.customer_id ?? ''), 10);
    const reservationDate = String(body.reservation_date || '').trim();
    const startTime = String(body.reservation_start_time || '').trim();
    const endTime = String(body.reservation_end_time || '').trim();

    if (!Number.isFinite(court) || court < 1 || court > 12) {
      sendJson(res, 400, { success: false, message: 'Invalid court_id' });
      return true;
    }
    if (!Number.isFinite(customer) || customer < 1) {
      sendJson(res, 400, { success: false, message: 'Invalid customer_id' });
      return true;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate)) {
      sendJson(res, 400, { success: false, message: 'reservation_date must be YYYY-MM-DD' });
      return true;
    }

    const startMin = parseHHMM(startTime);
    const endMin = parseHHMM(endTime);
    if (startMin == null || endMin == null) {
      sendJson(res, 400, { success: false, message: 'Invalid date format' });
      return true;
    }

    const adv = calendarDaysFromCentralToday(reservationDate);
    /** Staff can book farther ahead than customer self-service (14 days in Flask). */
    const ADMIN_MAX_ADVANCE_DAYS = 730;
    if (adv == null || adv < 0) {
      sendJson(res, 400, {
        success: false,
        message: 'Cannot reserve on a past calendar date.',
      });
      return true;
    }
    if (adv > ADMIN_MAX_ADVANCE_DAYS) {
      sendJson(res, 400, {
        success: false,
        message: 'Reservation date is too far in the future.',
      });
      return true;
    }

    const nowCentral = comparisonNowCentral();
    const startCentral = comparisonStartCentral(reservationDate, startTime);
    if (startCentral && nowCentral >= startCentral) {
      sendJson(res, 400, {
        success: false,
        message: 'Start time is in the past (US/Central).',
      });
      return true;
    }

    const pyDow = pythonWeekdayFromYMD(reservationDate);
    const { startMin: openMin, closeMin } = businessHoursForPythonDow(pyDow);

    if (startMin < openMin || endMin > closeMin) {
      sendJson(res, 400, { success: false, message: 'Cannot reserve outside of business hours' });
      return true;
    }
    if (endMin - startMin > 270) {
      sendJson(res, 400, { success: false, message: 'Cannot reserve for more than 4.5 hours' });
      return true;
    }
    if (endMin - startMin < 15) {
      sendJson(res, 400, { success: false, message: 'Cannot reserve for less than 15 minutes' });
      return true;
    }
    const ss = startTime.slice(-2);
    const es = endTime.slice(-2);
    if (!VALID_MINUTE_SUFFIXES.includes(ss) || !VALID_MINUTE_SUFFIXES.includes(es)) {
      sendJson(res, 400, {
        success: false,
        message: 'All times must end with a multiple of 15 minutes',
      });
      return true;
    }

    const conn = await db.getClient();
    try {
      await conn.beginTransaction();

      const [courtRows] = await conn.execute(
        `SELECT reservation_start_time, reservation_end_time FROM reservation
         WHERE court_id = ? AND reservation_date = ? AND reservation_status IN (1, 2)`,
        [court, reservationDate]
      );
      for (let i = 0; i < courtRows.length; i++) {
        const row = courtRows[i];
        const rs = parseHHMM(formatTime(row.reservation_start_time));
        const re = parseHHMM(formatTime(row.reservation_end_time));
        if (rs == null || re == null) continue;
        if (timeOverlaps(startMin, endMin, rs, re)) {
          await conn.rollback();
          sendJson(res, 400, { success: false, message: 'Court is already booked' });
          return true;
        }
      }

      const [activeRows] = await conn.execute(
        'SELECT reservation_date, reservation_end_time, reservation_status FROM reservation WHERE customer_id = ? AND reservation_status IN (1, 2)',
        [customer]
      );
      if (customerHasBlockingReservation(activeRows || [])) {
        await conn.rollback();
        sendJson(res, 400, {
          success: false,
          message:
            'This customer already has a pending or confirmed reservation. Cancel it first or wait until it completes.',
        });
        return true;
      }

      await conn.execute('UPDATE waiver SET waiver_status = 1 WHERE customer_id = ?', [customer]);

      const [wRows] = await conn.execute(
        'SELECT waiver_id FROM waiver WHERE customer_id = ? ORDER BY waiver_id ASC LIMIT 1',
        [customer]
      );
      if (!wRows.length) {
        await conn.rollback();
        sendJson(res, 400, {
          success: false,
          message: 'Customer has no waiver on file. They must complete waiver registration first.',
        });
        return true;
      }
      const waiverId = wRows[0].waiver_id;

      await conn.execute('UPDATE waiver SET waiver_status = 1 WHERE waiver_id = ? AND customer_id = ?', [
        waiverId,
        customer,
      ]);

      const [verify] = await conn.execute(
        'SELECT waiver_id FROM waiver WHERE waiver_id = ? AND customer_id = ?',
        [waiverId, customer]
      );
      if (!verify.length) {
        await conn.rollback();
        sendJson(res, 400, { success: false, message: 'Could not verify waiver for this customer.' });
        return true;
      }

      const [ins] = await conn.execute(
        `INSERT INTO reservation (court_id, customer_id, waiver_id, reservation_date,
          reservation_start_time, reservation_end_time, reservation_status)
         VALUES (?, ?, ?, ?, ?, ?, 2)`,
        [court, customer, waiverId, reservationDate, startTime, endTime]
      );

      const newId = ins.insertId;
      if (!newId) {
        await conn.rollback();
        sendJson(res, 503, { success: false, message: 'Server is unable to create reservation' });
        return true;
      }

      const [updW] = await conn.execute('UPDATE waiver SET waiver_status = 2 WHERE waiver_id = ?', [waiverId]);
      if (!updW.affectedRows) {
        await conn.rollback();
        sendJson(res, 503, { success: false, message: 'Server is unable to update waiver' });
        return true;
      }

      await conn.commit();
      sendJson(res, 201, {
        success: true,
        reservation_id: newId,
        reservation_status: 2,
        message: 'Reservation confirmed.',
      });
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {}
      console.error('[admin reservation-create]', e.message);
      sendJson(res, 503, { success: false, message: 'Unable to create reservation' });
    } finally {
      conn.release();
    }
    return true;
  }

  return false;
};
