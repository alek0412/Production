/**
 * Public upcoming-events JSON + admin upload/clear (uses lib/upcomingEvents).
 */
module.exports = async function handleUpcomingEventsRoutes(req, res, ctx) {
  const { pathname, readBodyWithLimit, hasAdminSessionCookie, upcomingEvents } = ctx;

  if (req.method === 'GET' && pathname === '/api/upcoming-events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(upcomingEvents.getPublicPayload()));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/upcoming-events') {
    if (!hasAdminSessionCookie(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not authenticated' }));
      return true;
    }
    let raw;
    try {
      const upcomingBodyLimit =
        Math.ceil((upcomingEvents.MAX_IMAGE_BYTES * 4) / 3) + 4 * 1024 * 1024;
      raw = await readBodyWithLimit(req, upcomingBodyLimit);
    } catch (e) {
      if (e && e.message === 'too_large') {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            message: 'Request body too large (over ~50 MB image after encoding). Use a smaller file.',
          })
        );
        return true;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
      return true;
    }
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
      return true;
    }
    const opNorm =
      typeof data.op === 'string' ? data.op.trim().toLowerCase().replace(/\s+/g, '') : '';
    const wantsClear = opNorm === 'clear' || data.clear === true;
    const wantsSetCount = opNorm === 'setcount' || opNorm === 'setslotcount';

    if (wantsSetCount) {
      const out = upcomingEvents.setSlotCount(data.count);
      if (!out.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: out.error || 'Could not update slot count.' }));
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return true;
    }

    if (
      !wantsClear &&
      data.count != null &&
      (data.dataUrl === undefined || data.dataUrl === null) &&
      (data.slot === undefined || data.slot === null || data.slot === '')
    ) {
      const out = upcomingEvents.setSlotCount(data.count);
      if (out.ok) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: out.error || 'Could not update slot count.' }));
      return true;
    }

    const slot = typeof data.slot === 'number' && Number.isInteger(data.slot) ? data.slot : parseInt(data.slot, 10);
    if (wantsClear) {
      const out = upcomingEvents.clearSlot(slot);
      if (!out.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: out.error || 'Could not clear slot.' }));
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return true;
    }

    if (!Number.isInteger(slot) || Number.isNaN(slot)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          message:
            'Invalid request. For changing how many images you use, pick a number in the dropdown and confirm. Restart the server if this keeps happening.',
        })
      );
      return true;
    }

    const out = upcomingEvents.setSlotImage(slot, data.dataUrl, data.alt);
    if (!out.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: out.error || 'Could not save image.' }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  return false;
};
