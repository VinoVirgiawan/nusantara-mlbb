// api/index.js — Nusantara MLBB Auth & Admin API
// Handles: auth, register, login, keys CRUD, logs, connections
// Storage: Vercel KV (Redis) with in-memory fallback

const crypto = require('crypto');

// ============================================================
// STORAGE — Vercel KV with fallback
// ============================================================
let kv = null;
try { kv = require('@vercel/kv'); } catch (e) { /* fallback to memory */ }

// In-memory fallback (resets on cold start)
const memStore = { users: {}, keys: {}, logs: [], connections: [] };

async function storeGet(key, fallback = null) {
  if (kv && kv.get) {
    try { const v = await kv.get(key); return v ?? fallback; } catch (e) { /* ignore */ }
  }
  return memStore[key] ?? fallback;
}
async function storeSet(key, value) {
  if (kv && kv.set) {
    try { await kv.set(key, value); return; } catch (e) { /* ignore */ }
  }
  memStore[key] = value;
}
async function storeDel(key) {
  if (kv && kv.del) {
    try { await kv.del(key); return; } catch (e) { /* ignore */ }
  }
  delete memStore[key];
}

// ============================================================
// CONFIG
// ============================================================
const API_KEY = process.env.API_KEY || 'NCZ_7fK9xP2mQ8vL4sR6nT1zW5cB';
const SEAL = crypto.createHash('md5').update(API_KEY).digest('hex');
const MONTHS_ID = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

// ============================================================
// HELPERS
// ============================================================
function md5(str) { return crypto.createHash('md5').update(String(str)).digest('hex'); }
function randToken() { return crypto.randomBytes(16).toString('hex'); }

function formatDate(ts) {
  const d = new Date(ts * 1000);
  return `${d.getDate()} - ${MONTHS_ID[d.getMonth()+1]} - ${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      const params = {};
      body.split('&').forEach(p => {
        const [k, ...v] = p.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v.join('='));
      });
      resolve({ raw: body, params });
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session',
  });
  res.end(JSON.stringify(data));
}

function sendHTML(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(html);
}

function badReq(res, msg) { return json(res, 200, { ok: false, status: false, reason: msg, error: msg }); }

// ============================================================
// AUTH — Session from cookie/header
// ============================================================
function getSession(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/session=([^;]+)/);
  const hdr = req.headers['x-session'];
  return (m && m[1]) || hdr || null;
}

async function getUser(sessionId) {
  if (!sessionId) return null;
  const sessions = await storeGet('sessions', {});
  const userId = sessions[sessionId];
  if (!userId) return null;
  const users = await storeGet('users', {});
  return users[userId] || null;
}

// ============================================================
// ROUTES
// ============================================================
module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session',
    });
    return res.end();
  }

  // ========================================================
  // GET / → Serve admin panel
  // ========================================================
  if (path === '/' || path === '') {
    try {
      const fs = require('fs');
      const html = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf-8');
      return sendHTML(res, html);
    } catch (e) {
      return sendHTML(res, '<h1>Nusantara MLBB API</h1><p>Admin panel not found. Deploy public/index.html</p>');
    }
  }

  // ========================================================
  // POST /auth — MLBB Binary Auth Endpoint
  // ========================================================
  if (path === '/auth') {
    const { params } = await parseBody(req);
    const game     = params.game || '';
    const userKey  = params.user_key || params.key || params.login_key || '';
    const serial   = params.serial || params.device_id || params.java_json_device_id || '';
    const package  = params.package_name || '';

    console.log(`[AUTH] key=${userKey} serial=${serial}`);

    if (!game && !userKey) return json(res, 200, { ok: false, status: false, reason: 'INVALID PARAMETER', error: 'Missing game or user_key' });
    if (!userKey)           return json(res, 200, { ok: false, status: false, reason: 'Key kosong', error: 'Key kosong' });
    if (!serial)            return json(res, 200, { ok: false, status: false, reason: 'Device ID kosong', error: 'Device ID kosong' });

    // Load keys
    const keys = await storeGet('keys', {});

    // HARDCODED FALLBACK KEYS (always work, no persistence needed)
    const HARDCODED_KEYS = {
      'ML_E65AE86467':    { days: 365, title: 'MLBB Nusantara Unlimited' },
      'NUSANTARA':        { days: 30,  title: 'MLBB Nusantara' },
      'NUSANTARA-1DAY':   { days: 1,   title: 'MLBB Nusantara 1 Day' },
      'NUSANTARA-7DAY':   { days: 7,   title: 'MLBB Nusantara 7 Day' },
      'NUSANTARA-30DAY':  { days: 30,  title: 'MLBB Nusantara 30 Day' },
      'PREMIUM':          { days: 90,  title: 'MLBB Premium' },
      'TEST':             { days: 365, title: 'MLBB Test' },
      'ADMIN':            { days: 999, title: 'MLBB Admin' },
      'devd3v':           { days: 999, title: 'MLBB Developer' },
    };

    // Search key by name (DB first, then hardcoded fallback)
    let keyData = null;
    let keyName = null;
    for (const [name, data] of Object.entries(keys)) {
      if (name === userKey || data.name === userKey) {
        keyData = data; keyName = name; break;
      }
    }
    // Fallback to hardcoded keys
    if (!keyData && HARDCODED_KEYS[userKey]) {
      const hk = HARDCODED_KEYS[userKey];
      keyData = {
        name: userKey,
        title: hk.title,
        days: hk.days,
        active: true,
        expiresAt: Date.now() + hk.days * 86400000,
      };
      keyName = userKey;
    }

    if (!keyData) return json(res, 200, { ok: false, status: false, reason: 'Login ditolak server', error: 'MEMBER KEY NOT REGISTERED' });
    if (!keyData.active) return json(res, 200, { ok: false, status: false, reason: 'Login ditolak server', error: 'Key disabled' });
    if (keyData.expiresAt && Date.now() > keyData.expiresAt) {
      return json(res, 200, { ok: false, status: false, reason: `License expired: ${formatDate(Math.floor(keyData.expiresAt/1000))}`, error: 'expired' });
    }

    // Log connection
    const conn = {
      id: randToken(),
      key: keyName,
      serial,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      ua: req.headers['user-agent'] || '',
      time: Date.now(),
      game,
      package,
    };
    const logs = await storeGet('logs', []);
    logs.unshift(conn);
    if (logs.length > 5000) logs.length = 5000;
    await storeSet('logs', logs);

    // Update key usage
    keyData.lastUsed = Date.now();
    keyData.usedBy = serial;
    keyData.useCount = (keyData.useCount || 0) + 1;
    keys[keyName] = keyData;
    await storeSet('keys', keys);

    // Generate response (migoreng.my.id format)
    const rng = Math.floor(Date.now() / 1000);
    const token = md5(`${rng}${userKey}${randToken()}`);
    const expiredTs = keyData.expiresAt
      ? Math.floor(keyData.expiresAt / 1000)
      : rng + (keyData.days || 30) * 86400;

    const response = {
      ok: true,
      status: true,
      reason: 'success',
      rng,
      tittle: keyData.title || 'MLBB Nusantara',
      token,
      session: token,
      expired: formatDate(expiredTs),
      seal: md5(`${SEAL}${rng}${token}`),
    };

    return json(res, 200, response);
  }

  // ========================================================
  // All routes below require session
  // ========================================================
  const sessionId = getSession(req);
  const user = await getUser(sessionId);

  // ========================================================
  // POST /register
  // ========================================================
  if (path === '/register' && method === 'POST') {
    const { params } = await parseBody(req);
    const username = (params.username || '').trim();
    const password = (params.password || '').trim();
    const displayName = (params.displayName || params.display_name || '').trim() || username;

    if (!username || username.length < 3) return badReq(res, 'Username minimal 3 karakter');
    if (!password || password.length < 4) return badReq(res, 'Password minimal 4 karakter');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return badReq(res, 'Username hanya boleh huruf, angka, underscore');

    const users = await storeGet('users', {});
    if (users[username]) return badReq(res, 'Username sudah terdaftar');

    users[username] = {
      username,
      displayName,
      password: md5(password),
      role: Object.keys(users).length === 0 ? 'admin' : 'user',
      createdAt: Date.now(),
    };
    await storeSet('users', users);

    // Auto-login
    const sid = randToken();
    const sessions = await storeGet('sessions', {});
    sessions[sid] = username;
    await storeSet('sessions', sessions);

    res.setHeader('Set-Cookie', `session=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    return json(res, 200, { ok: true, user: { username, displayName, role: users[username].role } });
  }

  // ========================================================
  // POST /login
  // ========================================================
  if (path === '/login' && method === 'POST') {
    const { params } = await parseBody(req);
    const username = (params.username || '').trim();
    const password = (params.password || '').trim();

    const users = await storeGet('users', {});
    const u = users[username];
    if (!u || u.password !== md5(password)) return badReq(res, 'Username atau password salah');

    const sid = randToken();
    const sessions = await storeGet('sessions', {});
    sessions[sid] = username;
    await storeSet('sessions', sessions);

    res.setHeader('Set-Cookie', `session=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    return json(res, 200, { ok: true, user: { username: u.username, displayName: u.displayName, role: u.role } });
  }

  // ========================================================
  // POST /logout
  // ========================================================
  if (path === '/logout' && method === 'POST') {
    if (sessionId) {
      const sessions = await storeGet('sessions', {});
      delete sessions[sessionId];
      await storeSet('sessions', sessions);
    }
    res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  // ========================================================
  // GET /me — Current user info
  // ========================================================
  if (path === '/me' && method === 'GET') {
    if (!user) return badReq(res, 'Not logged in');
    return json(res, 200, { ok: true, user: { username: user.username, displayName: user.displayName, role: user.role } });
  }

  // ========================================================
  // Below require login
  // ========================================================
  if (!user) return badReq(res, 'Unauthorized — login dulu');

  // ========================================================
  // GET /keys — List all keys
  // ========================================================
  if (path === '/keys' && method === 'GET') {
    const keys = await storeGet('keys', {});
    const list = Object.entries(keys).map(([id, k]) => ({
      id,
      name: k.name,
      title: k.title,
      days: k.days,
      active: k.active,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      lastUsed: k.lastUsed || null,
      useCount: k.useCount || 0,
      usedBy: k.usedBy || null,
      createdBy: k.createdBy,
    }));
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return json(res, 200, { ok: true, keys: list });
  }

  // ========================================================
  // POST /keys — Create key
  // ========================================================
  if (path === '/keys' && method === 'POST') {
    const { params } = await parseBody(req);
    const name = (params.name || '').trim();
    const title = (params.title || '').trim() || `MLBB ${name}`;
    const days = parseInt(params.days) || 30;

    if (!name) return badReq(res, 'Key name wajib diisi');

    const keys = await storeGet('keys', {});
    const id = name.replace(/[^a-zA-Z0-9_-]/g, '');

    if (keys[id]) return badReq(res, 'Key sudah ada');

    keys[id] = {
      name: id,
      title,
      days,
      active: true,
      createdAt: Date.now(),
      expiresAt: Date.now() + days * 86400000,
      createdBy: user.username,
      lastUsed: null,
      useCount: 0,
      usedBy: null,
    };
    await storeSet('keys', keys);

    return json(res, 200, { ok: true, key: keys[id] });
  }

  // ========================================================
  // PUT /keys?id=X — Edit key
  // ========================================================
  if (path === '/keys' && method === 'PUT') {
    const id = url.searchParams.get('id');
    if (!id) return badReq(res, 'Key ID required');

    const keys = await storeGet('keys', {});
    if (!keys[id]) return badReq(res, 'Key not found');

    const { params } = await parseBody(req);
    const k = keys[id];

    if (params.title !== undefined) k.title = params.title.trim() || k.title;
    if (params.days !== undefined) {
      k.days = parseInt(params.days) || k.days;
      k.expiresAt = Date.now() + k.days * 86400000;
    }
    if (params.active !== undefined) k.active = params.active === 'true' || params.active === true;

    keys[id] = k;
    await storeSet('keys', keys);

    return json(res, 200, { ok: true, key: k });
  }

  // ========================================================
  // DELETE /keys?id=X — Delete key
  // ========================================================
  if (path === '/keys' && method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return badReq(res, 'Key ID required');

    const keys = await storeGet('keys', {});
    if (!keys[id]) return badReq(res, 'Key not found');

    delete keys[id];
    await storeSet('keys', keys);

    return json(res, 200, { ok: true, deleted: id });
  }

  // ========================================================
  // GET /logs — Connection logs
  // ========================================================
  if (path === '/logs' && method === 'GET') {
    const logs = await storeGet('logs', []);
    const limit = parseInt(url.searchParams.get('limit')) || 100;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    return json(res, 200, { ok: true, total: logs.length, logs: logs.slice(offset, offset + limit) });
  }

  // ========================================================
  // DELETE /logs — Clear logs
  // ========================================================
  if (path === '/logs' && method === 'DELETE') {
    await storeSet('logs', []);
    return json(res, 200, { ok: true, message: 'Logs cleared' });
  }

  // ========================================================
  // GET /stats — Dashboard stats
  // ========================================================
  if (path === '/stats' && method === 'GET') {
    const keys = await storeGet('keys', {});
    const logs = await storeGet('logs', []);
    const users = await storeGet('users', {});

    const activeKeys = Object.values(keys).filter(k => k.active).length;
    const totalKeys = Object.keys(keys).length;
    const totalLogs = logs.length;
    const todayLogs = logs.filter(l => Date.now() - l.time < 86400000).length;

    return json(res, 200, {
      ok: true,
      stats: {
        totalKeys,
        activeKeys,
        totalUsers: Object.keys(users).length,
        totalConnections: totalLogs,
        todayConnections: todayLogs,
      }
    });
  }

  // ========================================================
  // GET /users — List users (admin only)
  // ========================================================
  if (path === '/users' && method === 'GET') {
    if (user.role !== 'admin') return badReq(res, 'Admin only');
    const users = await storeGet('users', {});
    const list = Object.values(users).map(u => ({
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      createdAt: u.createdAt,
    }));
    return json(res, 200, { ok: true, users: list });
  }

  // ========================================================
  // Default — 404
  // ========================================================
  return json(res, 404, { ok: false, error: 'Not found', path });
};
