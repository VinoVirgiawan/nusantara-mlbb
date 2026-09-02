# 🎮 Nusantara MLBB Auth & Admin API — Vercel

Serverless API yang mem-mimic response JSON dari **migoreng.my.id** + **Admin Panel** lengkap.

## 🚀 Deploy

```bash
cd vercelnusantara
npm i -g vercel
vercel login
vercel deploy
```

Atau drag & drop folder `vercelnusantara/` ke [vercel.com/new](https://vercel.com/new).

> **Vercel KV** (opsional): Untuk persistent storage, jalankan `vercel kv` lalu redeploy.

## 📡 API Endpoints

### MLBB Auth (untuk binary)
```
POST /api/auth
Body: game=MLBB&user_key=KEY&serial=DEVICE_ID
```

### Admin API
```
POST   /api/register     — Register (username, password, displayName)
POST   /api/login        — Login
POST   /api/logout       — Logout
GET    /api/me            — Current user info
GET    /api/stats         — Dashboard stats
GET    /api/keys          — List keys
POST   /api/keys          — Create key (name, title, days)
PUT    /api/keys?id=X     — Edit key
DELETE /api/keys?id=X     — Delete key
GET    /api/logs           — Connection logs
DELETE /api/logs           — Clear logs
GET    /api/users          — List users (admin only)
```

## 🔑 Key System

| Key Pattern | Expiry | Example |
|---|---|---|
| `ML_E65AE86467` | Custom (days) | Unlimited key |
| `NUSANTARA-{N}DAY` | N days | NUSANTARA-7DAY → 7 days |
| `EXPIRE-{N}` | N days | EXPIRE-30 → 30 days |
| Any name | Custom | Buat via admin panel |

## 🖥️ Admin Panel

Buka `/` di browser untuk akses admin panel:

- **Register** → Buat akun baru (pertama auto jadi admin)
- **Login** → Masuk ke dashboard
- **🔑 Keys** → Buat/Edit/Hapus key, atur expiry, lihat usage
- **📊 Connections** → Lihat siapa yang connect, kapan, dari mana
- **👥 Users** → Lihat semua user terdaftar

## 📊 JSON Response (sama seperti migoreng.my.id)

### Success
```json
{
  "status": true,
  "reason": "success",
  "rng": 1788326679,
  "tittle": "MLBB Nusantara Unlimited",
  "token": "cbd60e49e1b60829...",
  "expired": "2 - Sep - 2027 05:24:39",
  "seal": "af186a602cb6683c..."
}
```

### Error
```json
{ "status": false, "reason": "Key kosong" }
{ "status": false, "reason": "Device ID kosong" }
{ "status": false, "reason": "Login ditolak server" }
{ "status": false, "reason": "License expired: 1 - Jan - 2026 00:00:00" }
```

## 🧪 Test

```bash
# Auth test
curl -s -X POST -d "game=MLBB&user_key=ML_E65AE86467&serial=DEVICE001" \
  https://YOUR-APP.vercel.app/api/auth | python3 -m json.tool

# Register
curl -s -X POST -d "username=admin&password=1234&displayName=Admin" \
  https://YOUR-APP.vercel.app/api/register

# Create key (with session cookie)
curl -s -X POST -b "session=TOKEN" -d "name=ML_E65AE86467&days=365" \
  https://YOUR-APP.vercel.app/api/keys
```

## 📁 File Structure
```
vercelnusantara/
├── api/
│   └── index.js       ← All API handlers
├── public/
│   └── index.html     ← Admin panel (SPA)
├── vercel.json        ← Routing config
├── package.json
├── replace_url.py     ← Binary URL patcher
└── README.md
```

---
*Powered by Nusantara.ID 🇲🇨*
