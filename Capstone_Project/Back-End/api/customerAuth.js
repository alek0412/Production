/**
 * Customer auth, waiver registration (proxied to Flask), password reset, /api/customer-me
 */
const { proxyToFlask, writeFlaskResponse } = require('../lib/flaskHttp');

/** Match Flask `permanent_session_lifetime` (7d) so Node login cookies do not expire first. */
const CUSTOMER_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function flaskBase(config) {
  return (config && (config.flaskApiBaseUrl || config.flaskWaiverBaseUrl)) || '';
}

module.exports = async function handleCustomerAuth(req, res, ctx) {
  const {
    pathname,
    parseBody,
    db,
    customerPassword,
    sendPasswordResetEmail,
    CUSTOMER_EMAIL,
    CUSTOMER_PASSWORD,
    CUSTOMER_PREVIEW_LOGIN,
    CUSTOMER_SESSION_VALUE,
    config,
  } = ctx;

  const base = flaskBase(config);
  const cookieHeader = req.headers.cookie || '';

  function customerEmailCookieHeader(email) {
    const safe = encodeURIComponent(String(email || '').trim().toLowerCase());
    return (
      'hbc_customer_email=' +
      safe +
      '; Path=/; HttpOnly; Max-Age=' +
      CUSTOMER_COOKIE_MAX_AGE_SEC +
      '; SameSite=Lax'
    );
  }

  function sanitizeInput(inputStr) {
    return inputStr.trim();
}

  function clearCustomerEmailCookieHeader() {
    return 'hbc_customer_email=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax';
  }

  async function lookupCustomerFirstName(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !db || typeof db.query !== 'function') return '';
    try {
      const { rows } = await db.query(
        'SELECT customer_first_name FROM customer WHERE LOWER(TRIM(email)) = ? LIMIT 1',
        [normalized]
      );
      const first = rows && rows[0] ? rows[0].customer_first_name : '';
      return String(first || '').trim();
    } catch (err) {
      console.error('[customer-login] first-name lookup:', err.message);
      return '';
    }
  }

  async function lookupCustomerProfile(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !db || typeof db.query !== 'function') return null;
    try {
      const { rows } = await db.query(
        `SELECT customer_id, customer_first_name, customer_last_name, email, phone,
                street_address, city, state, zip_code, membership_status, birthdate
         FROM customer WHERE LOWER(TRIM(email)) = ? LIMIT 1`,
        [normalized]
      );
      const r = rows && rows[0];
      if (!r) return null;
      let birth = '';
      if (r.birthdate != null) {
        birth =
          typeof r.birthdate.toISOString === 'function'
            ? r.birthdate.toISOString().slice(0, 10)
            : String(r.birthdate);
      }
      const profile = {
        customerId: r.customer_id,
        firstName: String(r.customer_first_name || '').trim(),
        lastName: String(r.customer_last_name || '').trim(),
        email: String(r.email || '').trim(),
        phone: String(r.phone || '').trim(),
        streetAddress: String(r.street_address || '').trim(),
        city: String(r.city || '').trim(),
        state: String(r.state || '').trim(),
        zipCode: String(r.zip_code || '').trim(),
        membershipStatus: r.membership_status,
        birthdate: birth,
      };
      try {
        const ecRes = await db.query(
          'SELECT emergency_first, emergency_last, relationship, emergency_phone, emergency_email FROM emergency_contact WHERE customer_id = ? LIMIT 1',
          [r.customer_id]
        );
        const ec = ecRes.rows && ecRes.rows[0];
        if (ec) {
          profile.emergencyContact = {
            firstName: String(ec.emergency_first || '').trim(),
            lastName: String(ec.emergency_last || '').trim(),
            relationship: String(ec.relationship || '').trim(),
            phone: String(ec.emergency_phone || '').trim(),
            email: String(ec.emergency_email || '').trim(),
          };
        }
      } catch (e) {
        console.error('[customer-me] emergency lookup:', e.message);
      }
      return profile;
    } catch (err) {
      console.error('[customer-me] profile lookup:', err.message);
      return null;
    }
  }

  if (req.method === 'POST' && pathname === '/api/customer-login') {
    let data = {};
    try {
      data = await parseBody(req);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
      return true;
    }
    if (base) {
      try {
        const upstream = await proxyToFlask(base, 'POST', '/api/customer-login', {
          body: JSON.stringify(data),
          cookie: cookieHeader,
          contentType: 'application/json',
        });
        if (upstream.statusCode === 200) {
          const firstName = await lookupCustomerFirstName(data.email);
          const nodeCustomerCookie =
            'customer_session=' +
            encodeURIComponent(CUSTOMER_SESSION_VALUE) +
            '; Path=/; HttpOnly; Max-Age=' +
            CUSTOMER_COOKIE_MAX_AGE_SEC +
            '; SameSite=Lax';
          const emailCookie = customerEmailCookieHeader(data.email);
          const cookies = [...upstream.setCookies, nodeCustomerCookie, emailCookie];
          res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': cookies });
          res.end(
            JSON.stringify({
              success: true,
              message: (upstream.body || '').trim() || 'Login successful!',
              firstName,
            })
          );
          return true;
        }
        const msg = (upstream.body || '').trim() || 'Invalid email or password';
        const code =
          upstream.statusCode >= 400 && upstream.statusCode < 600 ? upstream.statusCode : 401;
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: msg }));
        return true;
      } catch (err) {
        console.error('[customer-login] Flask:', err.message);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            message:
              'Could not reach customer login (Flask). Start flask_server.py on port 3001.',
          })
        );
        return true;
      }
    }
    const email = (data.email || '').trim().toLowerCase();
    const password = data.password || '';
    const valid = await customerPassword.validateCustomerLogin(
      email,
      password,
      CUSTOMER_EMAIL,
      CUSTOMER_PASSWORD,
      CUSTOMER_PREVIEW_LOGIN
    );
    if (valid) {
      const firstName = await lookupCustomerFirstName(email);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': [
          'customer_session=' +
            encodeURIComponent(CUSTOMER_SESSION_VALUE) +
            '; Path=/; HttpOnly; Max-Age=' +
            CUSTOMER_COOKIE_MAX_AGE_SEC +
            '; SameSite=Lax',
          customerEmailCookieHeader(email),
        ],
      });
      res.end(JSON.stringify({ success: true, firstName }));
      return true;
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/customer-logout') {
    if (base) {
      try {
        const upstream = await proxyToFlask(base, 'POST', '/api/customer-logout', {
          body: null,
          cookie: cookieHeader,
        });
        const clearNode = 'customer_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax';
        const cookies = [...upstream.setCookies, clearNode, clearCustomerEmailCookieHeader()];
        res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': cookies });
        res.end(JSON.stringify({ success: true }));
        return true;
      } catch (err) {
        console.error('[customer-logout] Flask:', err.message);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Could not reach Flask.' }));
        return true;
      }
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': [
        'customer_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax',
        clearCustomerEmailCookieHeader(),
      ],
    });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/waiver-register') {
    const sendJson = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    try {
      let data = {};
      try {
        data = await parseBody(req);
      } catch (e) {
        sendJson(400, { success: false, message: 'Invalid request' });
        return true;
      }
      if (!data.agree) {
        sendJson(400, { success: false, message: 'You must agree to the waiver terms.' });
        return true;
      }
      const pw = data.password || '';
      const pw2 = data.password_confirm != null ? data.password_confirm : data.passwordConfirm;
      if (pw !== pw2) {
        sendJson(400, { success: false, message: 'Passwords do not match.' });
        return true;
      }
      if (!base) {
        sendJson(503, {
          success: false,
          message: 'Waiver registration is not configured (set FLASK_API_URL or FLASK_WAIVER_URL).',
        });
        return true;
      }
      let upstream;
      try {
        upstream = await proxyToFlask(base, 'POST', '/api/waiver-register', {
          body: JSON.stringify(data),
          cookie: cookieHeader,
          contentType: 'application/json',
        });
      } catch (err) {
        console.error('[waiver-register] proxy:', err.message);
        sendJson(503, {
          success: false,
          message:
            'Could not reach the registration service. Start the Flask app (e.g. python flask_server.py on port 3001).',
        });
        return true;
      }
      const msg = (upstream.body || '').trim();
      if (upstream.statusCode === 201) {
        const regEmail = (data.email || '').trim().toLowerCase();
        const cookies = [
          ...upstream.setCookies,
          'customer_session=' +
            encodeURIComponent(CUSTOMER_SESSION_VALUE) +
            '; Path=/; HttpOnly; Max-Age=' +
            CUSTOMER_COOKIE_MAX_AGE_SEC +
            '; SameSite=Lax',
          customerEmailCookieHeader(regEmail),
        ];
        res.writeHead(201, { 'Content-Type': 'application/json', 'Set-Cookie': cookies });
        res.end(JSON.stringify({ success: true, message: msg || 'Customer created successfully!' }));
        return true;
      }
      const status =
        upstream.statusCode >= 400 && upstream.statusCode < 600 ? upstream.statusCode : 502;
      sendJson(status, { success: false, message: msg || 'Registration failed.' });
    } catch (err) {
      console.error('[waiver-register]', err);
      sendJson(500, {
        success: false,
        message: 'Server error during registration. Check EC2 logs and database connection.',
      });
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/forgot-password') {
    let data = {};
    try {
      data = await parseBody(req);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
      return true;
    }
    const result = await customerPassword.startPasswordReset(data.email);
    if (!result.ok && result.error === 'database') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          message: 'Password reset is temporarily unavailable. Confirm the database migration is applied.',
        })
      );
      return true;
    }
    if (result.ok && result.token && result.email) {
      try {
        await sendPasswordResetEmail({ to: result.email, token: result.token });
      } catch (e) {
        console.error('[forgot-password] send:', e);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Could not send the reset email. Try again later.' }));
        return true;
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        message: 'If that email is registered, you will receive a link to reset your password.',
      })
    );
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/reset-password') {
    let data = {};
    try {
      data = await parseBody(req);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
      return true;
    }
    const token = data.token || '';
    const password = data.password || '';
    const out = await customerPassword.completePasswordReset(token, password);
    if (!out.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: out.message || 'Could not reset password.' }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/customer-me') {
    const cookie = req.headers.cookie || '';
    let sessionValue = '';
    try {
      const match = cookie.match(/customer_session=([^;]*)/);
      sessionValue = match ? decodeURIComponent(match[1].trim()) : '';
    } catch (_) {}
    const nodeLoggedIn = sessionValue === CUSTOMER_SESSION_VALUE;

    let emailHint = '';
    try {
      const em = cookie.match(/hbc_customer_email=([^;]*)/);
      emailHint = em ? decodeURIComponent(em[1].trim()) : '';
    } catch (_) {}

    // Fast path: valid Node login cookies — profile from RDS only (skip Flask round-trip).
    if (nodeLoggedIn && emailHint) {
      const profileFast = await lookupCustomerProfile(emailHint);
      if (profileFast) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ loggedIn: true, profile: profileFast }));
        return true;
      }
    }

    if (base) {
      try {
        const upstream = await proxyToFlask(base, 'GET', '/api/customer-me', { cookie });
        if (upstream.statusCode === 200 && upstream.body) {
          let outBody = upstream.body;
          try {
            const parsed = JSON.parse(upstream.body);
            // Flask session cookie can be missing after idle/SSL/tunnel issues while Node login
            // cookies (customer_session + hbc_customer_email) are still valid — hydrate from DB.
            if (parsed && parsed.loggedIn === false && nodeLoggedIn) {
              const merged = emailHint ? await lookupCustomerProfile(emailHint) : null;
              if (merged) {
                parsed.loggedIn = true;
                parsed.profile = merged;
                outBody = JSON.stringify(parsed);
              }
            }
            const p = parsed && parsed.profile;
            const firstEmpty = p && !String(p.firstName || '').trim();
            if (firstEmpty && emailHint) {
              const merged = await lookupCustomerProfile(emailHint);
              if (merged) {
                if (String(merged.firstName || '').trim()) {
                  p.firstName = String(merged.firstName).trim();
                }
                if (String(merged.lastName || '').trim() && !String(p.lastName || '').trim()) {
                  p.lastName = String(merged.lastName).trim();
                }
                outBody = JSON.stringify(parsed);
              }
            }
            // Flask reads emergency_contact via tunnel; if that query fails or returns nothing, the
            // profile can omit emergency data while Node's DB pool still has the row — fill it in.
            if (p && emailHint && parsed.loggedIn) {
              const ec = p.emergencyContact;
              const ecEmpty =
                !ec ||
                (!String(ec.firstName || '').trim() &&
                  !String(ec.lastName || '').trim() &&
                  !String(ec.phone || '').trim() &&
                  !String(ec.email || '').trim());
              if (ecEmpty) {
                const merged = await lookupCustomerProfile(emailHint);
                if (merged && merged.emergencyContact) {
                  p.emergencyContact = merged.emergencyContact;
                  outBody = JSON.stringify(parsed);
                }
              }
            }
          } catch (_) {
            /* keep upstream body */
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(outBody);
          return true;
        }
      } catch (err) {
        console.error('[customer-me] Flask:', err.message);
      }
    }

    if (!nodeLoggedIn) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ loggedIn: false }));
      return true;
    }

    const profile = emailHint ? await lookupCustomerProfile(emailHint) : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ loggedIn: true, profile }));
    return true;
  }

  if ((req.method === 'PATCH' || req.method === 'DELETE') && pathname === '/api/customer') {
    if (!base) {
      return false;
    }
    try {
      let bodyOpt = null;
      let contentType;
      if (req.method === 'PATCH') {
        const data = await parseBody(req);
        bodyOpt = JSON.stringify(data);
        contentType = 'application/json';
      } else if (req.method === 'DELETE') {
        bodyOpt = '{}';
        contentType = 'application/json';
      }
      const upstream = await proxyToFlask(base, req.method, '/api/customer', {
        body: bodyOpt,
        cookie: cookieHeader,
        contentType,
      });
      writeFlaskResponse(res, upstream);
      return true;
    } catch (err) {
      console.error('[api/customer]', err.message);
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unable to reach Flask.');
      return true;
    }
  }

  return false;
};
