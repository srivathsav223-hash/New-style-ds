console.log('👑 RINTU DASHBOARD v8.0 STARTING...');
console.log('[BOOT] Node version:', process.version);

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

console.log('[BOOT] Dependencies loaded');

// ─── STORAGE ───
const TOKEN_FILE = path.join(__dirname, 'tokens.json');
const KEYS_FILE = path.join(__dirname, 'keys.json');

let tokens = [];
let keys = [];

function loadTokens() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            console.log('[TOKENS] Loaded', tokens.length);
        } else {
            tokens = [];
            fs.writeFileSync(TOKEN_FILE, JSON.stringify([]));
        }
    } catch (e) { tokens = []; }
    return tokens;
}

function saveTokens() {
    try { fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2)); } catch (e) {}
}

function addToken(token, owner = 'default') {
    if (!token || token.length < 10) return null;
    const existing = tokens.find(t => t.token === token);
    if (existing) {
        existing.enabled = true;
        existing.owner = owner;
        saveTokens();
        return existing;
    }
    const newToken = {
        id: Date.now() + Math.random() * 1000,
        token: token.trim(),
        owner: owner || 'default',
        enabled: true,
        created: new Date().toISOString()
    };
    tokens.push(newToken);
    saveTokens();
    return newToken;
}

function deleteToken(id) {
    tokens = tokens.filter(t => t.id !== id);
    saveTokens();
}

function toggleToken(id) {
    const t = tokens.find(t => t.id === id);
    if (t) { t.enabled = !t.enabled; saveTokens(); return t; }
    return null;
}

function getEnabledTokens() {
    return tokens.filter(t => t.enabled === true);
}

function loadKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
            console.log('[KEYS] Loaded', keys.length);
        } else {
            keys = [];
            fs.writeFileSync(KEYS_FILE, JSON.stringify([]));
        }
    } catch (e) { keys = []; }
    return keys;
}

function saveKeys() {
    try { fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2)); } catch (e) {}
}

function generateKey(owner, days) {
    const key = crypto.randomBytes(16).toString('hex').toUpperCase();
    const expires = new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString();
    const keyData = { key, owner: owner || 'default', created: new Date().toISOString(), expires };
    keys.push(keyData);
    saveKeys();
    return keyData;
}

function validateKey(key) {
    const found = keys.find(k => k.key === key);
    if (!found) return { valid: false, message: 'Invalid key' };
    if (new Date(found.expires) < new Date()) return { valid: false, message: 'Key expired' };
    return { valid: true, owner: found.owner, expires: found.expires };
}

loadTokens();
loadKeys();

// ─── EXPRESS ───
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const viewsPath = path.join(__dirname, 'views');
if (!fs.existsSync(viewsPath)) {
    fs.mkdirSync(viewsPath, { recursive: true });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let admin = false;

// ─── ROUTES ───
app.get('/', (req, res) => {
    try {
        res.render('dashboard', {
            tokenCount: tokens.length,
            enabledCount: getEnabledTokens().length,
            keyCount: keys.length,
            admin: admin
        });
    } catch (err) {
        res.send(`
            <html><body style="background:#0a0a0a;color:#00ff41;font-family:monospace;padding:40px;">
                <h1 style="color:#ff0040;">👑 RINTU DASHBOARD</h1>
                <p>✅ Server running!</p>
                <p><a href="/test" style="color:#00ff41;">Test Route</a></p>
            </body></html>
        `);
    }
});

app.get('/test', (req, res) => {
    res.json({
        status: 'alive',
        time: new Date().toISOString(),
        tokens: tokens.length,
        keys: keys.length,
        enabled: getEnabledTokens().length,
        nodeVersion: process.version
    });
});

app.post('/api/login', (req, res) => {
    if (req.body.password === process.env.ADMIN_PASS) {
        admin = true;
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/logout', (req, res) => {
    admin = false;
    res.json({ success: true });
});

// ─── TOKEN API ───
app.get('/api/tokens', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    res.json(tokens);
});

app.post('/api/tokens/add', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const { token, owner } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const result = addToken(token, owner);
    if (result) {
        res.json({ success: true, token: result });
    } else {
        res.status(400).json({ error: 'Invalid token' });
    }
});

app.post('/api/tokens/delete', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    deleteToken(req.body.id);
    res.json({ success: true });
});

app.post('/api/tokens/toggle', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const result = toggleToken(req.body.id);
    res.json({ success: true, token: result });
});

app.post('/api/tokens/bulk', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const { tokens: tokenList, owner } = req.body;
    if (!tokenList || !Array.isArray(tokenList)) {
        return res.status(400).json({ error: 'Tokens array required' });
    }
    let added = 0;
    tokenList.forEach(t => {
        if (t && t.length > 10) { addToken(t, owner || 'bulk'); added++; }
    });
    res.json({ success: true, added, total: tokenList.length });
});

// ─── KEYAUTH API ───
app.post('/api/keys/create', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const { owner, days } = req.body;
    const result = generateKey(owner, days);
    res.json({ success: true, key: result.key, owner: result.owner, expires: result.expires });
});

app.get('/api/keys/list', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ keys });
});

app.post('/api/keys/validate', (req, res) => {
    const { key } = req.body;
    if (!key) return res.json({ valid: false, message: 'Key required' });
    const result = validateKey(key);
    res.json(result);
});

app.post('/api/keys/delete', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    keys = keys.filter(k => k.key !== req.body.key);
    saveKeys();
    res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    res.json({
        tokens: tokens.length,
        enabled: getEnabledTokens().length,
        keys: keys.length
    });
});

// ─── SOCKET ───
io.on('connection', (socket) => {
    console.log('[SOCKET] Connected');
    socket.emit('stats', {
        tokens: tokens.length,
        enabled: getEnabledTokens().length,
        keys: keys.length
    });
});

// ─── START ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           👑 RINTU DASHBOARD 👑                            ║
║           🔥 WORKING - NO CRASHES                          ║
╠══════════════════════════════════════════════════════════════╣
║  📦 Tokens: ${tokens.length}                                ║
║  ✅ Enabled: ${getEnabledTokens().length}                  ║
║  🔑 Keys: ${keys.length}                                   ║
║  🌐 Dashboard: http://localhost:${PORT}                     ║
║  🔑 Admin: ${process.env.ADMIN_PASS || 'RINTU_2026'}       ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

process.on('SIGINT', () => {
    console.log('[SHUTDOWN] Cleaning up...');
    process.exit();
});
