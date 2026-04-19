/**
 * Houston Badminton Center — Backend server
 * Serves the Front-End; HTTP APIs live under ./api/ (see api/index.js).
 * Run from this folder: node server.js
 * Then open http://localhost:3000
 *
 * Admin login credentials (change in production):
 *   Email:    admin@example.com
 *   Password: Admin123!
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const http = require('http');
const fs = require('fs');
const db = require('./db/connection');
const config = require('./config');
const customerPassword = require('./lib/customerPassword');
const { sendPasswordResetEmail } = require('./lib/resetMail');
const upcomingEvents = require('./lib/upcomingEvents');
const popularTimesPdf = require('./lib/popularTimesPdf');
const membershipPricing = require('./lib/membershipPricing');
const membershipSpecials = require('./lib/membershipSpecials');
const aboutGallery = require('./lib/aboutGallery');
const { parseBody, readBodyWithLimit } = require('./lib/httpBody');
const { handleApi } = require('./api');

const PORT = process.env.PORT || 3000;

// Admin credentials (use env vars or a real DB in production)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

// Customer login — preview mode: env-only, no DB (set CUSTOMER_PREVIEW_LOGIN=0 to use DB bcrypt)
const _pv = process.env.CUSTOMER_PREVIEW_LOGIN;
const CUSTOMER_PREVIEW_LOGIN =
  _pv === undefined || _pv === ''
    ? true
    : !['0', 'false', 'no'].includes(String(_pv).toLowerCase().trim());
const CUSTOMER_EMAIL = (process.env.CUSTOMER_EMAIL || 'alekespi0412@gmail.com').trim().toLowerCase();
const CUSTOMER_PASSWORD = process.env.CUSTOMER_PASSWORD || 'Espi22735@';

// Customer cookie value must stay stable across PM2 restarts, or browsers keep an old cookie and
// /api/customer-me treats the user as logged out. Set CUSTOMER_SESSION_SECRET in .env in production.
const CUSTOMER_SESSION_SECRET =
  process.env.CUSTOMER_SESSION_SECRET || 'hbc-dev-customer-session-not-for-production';
if (!process.env.CUSTOMER_SESSION_SECRET) {
  console.warn(
    '[server.js] CUSTOMER_SESSION_SECRET is unset; using a built-in default. Set CUSTOMER_SESSION_SECRET in .env so customer cookies stay valid across deploys and restarts.'
  );
}
const CUSTOMER_SESSION_VALUE = 'loggedin:' + CUSTOMER_SESSION_SECRET;

// Front-End folder is one level up from Back-End
const FRONT_END = path.join(__dirname, '..', 'Front-End');

/** Match admin_session=loggedin as its own cookie (avoids substring false positives). */
function hasAdminSessionCookie(req) {
  const c = req.headers.cookie || '';
  return /(?:^|;\s*)admin_session=loggedin(?:\s|;|$)/.test(c);
}

/** Manager-only areas (e.g. Employees) — separate cookie from general admin. */
function hasManagerSessionCookie(req) {
  const c = req.headers.cookie || '';
  return /(?:^|;\s*)admin_manager_session=loggedin(?:\s|;|$)/.test(c);
}

/** Same as /api/customer-me fast path: Node `customer_session` + `hbc_customer_email`. */
function hasCustomerSessionCookie(req) {
  const c = req.headers.cookie || '';
  let sessionValue = '';
  try {
    const m = c.match(/customer_session=([^;]*)/);
    sessionValue = m ? decodeURIComponent(m[1].trim()) : '';
  } catch (_) {}
  if (sessionValue !== CUSTOMER_SESSION_VALUE) return false;
  try {
    const em = c.match(/hbc_customer_email=([^;]*)/);
    return !!(em && decodeURIComponent(em[1].trim()));
  } catch (_) {
    return false;
  }
}

/**
 * Isolate site zones: General_* HTML is public; Client_* (except Client_Login and
 * Client_OpenPlay — public “how to play” PDF viewer) needs customer session;
 * /admin/*.html needs admin session. Prevents direct URL access without login.
 */
function getHtmlZoneRedirect(urlPath, req) {
  const lower = urlPath.toLowerCase();
  if (!lower.endsWith('.html')) return null;
  const norm = String(urlPath).replace(/\\/g, '/');
  if (!norm.startsWith('/admin/') && !norm.startsWith('/client/')) return null;

  if (norm.startsWith('/admin/')) {
    if (!hasAdminSessionCookie(req)) {
      return '/client/Client_Login.html?tab=admin';
    }
    return null;
  }

  const base = path.basename(norm);
  const baseLower = base.toLowerCase();
  if (baseLower.startsWith('general_')) return null;
  if (baseLower === 'client_login.html') return null;
  if (baseLower === 'client_openplay.html') return null;
  if (baseLower.startsWith('client_')) {
    if (!hasCustomerSessionCookie(req)) {
      return '/client/Client_Login.html?next=' + encodeURIComponent(norm);
    }
  }
  return null;
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

function serveFile(filePath, res) {
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const headers = { 'Content-Type': contentType };
    if (ext === '.pdf') {
      headers['Content-Disposition'] = 'inline';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = (req.url || '').split('?')[0];

  const apiCtx = {
    pathname,
    parseBody,
    readBodyWithLimit,
    hasAdminSessionCookie,
    hasManagerSessionCookie,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    CUSTOMER_EMAIL,
    CUSTOMER_PASSWORD,
    CUSTOMER_PREVIEW_LOGIN,
    CUSTOMER_SESSION_VALUE,
    customerPassword,
    sendPasswordResetEmail,
    upcomingEvents,
    popularTimesPdf,
    membershipPricing,
    membershipSpecials,
    aboutGallery,
    db,
    config,
  };
  if (await handleApi(req, res, apiCtx)) {
    return;
  }

  // Redirect root to general (public) client dashboard
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(302, { Location: '/client/General_Dashboard.html' });
    res.end();
    return;
  }

  let urlPath = pathname;

  // About page scroll-reveal (lives under Front-End/js, not Back-End/static)
  if (urlPath === '/about-page.js') {
    const aboutJs = path.join(FRONT_END, 'js', 'about-page.js');
    fs.stat(aboutJs, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      serveFile(aboutJs, res);
    });
    return;
  }

  // Serve JS from Back-End/static (admin and client scripts live with backend)
  if (
    urlPath === '/admin-theme.js' ||
    urlPath === '/client-nav.js' ||
    urlPath === '/Client_Alternative.js' ||
    urlPath === '/membership-page-pricing.js' ||
    urlPath === '/admin-membership-pricing.js' ||
    urlPath === '/admin-about-gallery.js' ||
    urlPath === '/admin-file-dropzones.js' ||
    urlPath === '/upcoming-events-home.js' ||
    urlPath === '/gallery-about.js' ||
    urlPath === '/admin-marketing.js' ||
    urlPath === '/admin-popular-times.js' ||
    urlPath === '/availability-popular-times.js' ||
    urlPath === '/admin-membership-specials.js' ||
    urlPath === '/membership-specials-display.js' ||
    urlPath === '/membership-pricing-lightbox.js' ||
    urlPath === '/membership-page.js'
  ) {
    const baseName = path.basename(urlPath);
    const staticPath =
      baseName === 'client-nav.js' || baseName === 'upcoming-events-home.js'
        ? path.join(FRONT_END, 'js', baseName)
        : path.join(__dirname, 'static', baseName);
    fs.stat(staticPath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      serveFile(staticPath, res);
    });
    return;
  }

  const filePath = path.join(FRONT_END, path.normalize(urlPath));

  // Don't allow path traversal outside Front-End
  const realPath = path.resolve(filePath);
  const frontEndRoot = path.resolve(FRONT_END);
  if (!realPath.startsWith(frontEndRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const zoneRedirect = getHtmlZoneRedirect(urlPath, req);
    if (zoneRedirect) {
      res.writeHead(302, { Location: zoneRedirect });
      res.end();
      return;
    }
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    serveFile(filePath, res);
  });
});

server.listen(PORT, () => {
  console.log('Server initialized.' + '/');
  console.log('Server running at http://localhost:' + PORT + '/');
  console.log('  Front-End: ' + FRONT_END);
});


