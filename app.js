// ─── 💀 NUCLEAR SLASH KILLER 💀 ───
const stderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function(buffer, ...args) {
    const str = buffer.toString();
    if (
        str.includes('//////////') ||
        str.includes('WebSocket') ||
        str.includes('heartbeat') ||
        str.includes('reconnect') ||
        str.includes('RESUMED') ||
        str.includes('READY') ||
        str.includes('session_id') ||
        str.includes('Gateway') ||
        str.includes('Discord') ||
        str.match(/\/{2,}/)
    ) {
        return;
    }
    return stderrWrite(buffer, ...args);
};

const stdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function(buffer, ...args) {
    const str = buffer.toString();
    if (
        str.includes('//////////') ||
        str.includes('WebSocket') ||
        str.includes('heartbeat') ||
        str.includes('reconnect') ||
        str.includes('RESUMED') ||
        str.includes('READY') ||
        str.includes('session_id') ||
        str.match(/\/{2,}/)
    ) {
        return;
    }
    return stdoutWrite(buffer, ...args);
};

console.log('💀 NUCLEAR SLASH KILLER ACTIVATED');
console.log('👑 RINTU SUITE - DEBUG MODE');

// ─── IMPORTS ───
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

console.log('[RENDER] Starting RINTU SELFBOT SUITE...');

// ─── ANTI-DETECTION ───
try {
    const ClientUserSettingManager = require("./node_modules/discord.js-selfbot-v13/src/managers/ClientUserSettingManager.js");
    if (ClientUserSettingManager?.prototype) {
        ClientUserSettingManager.prototype._patch = function(data) { return this; };
        console.log('[RENDER] Anti-detection patched');
    }
} catch (e) {
    console.log('[RENDER] Anti-detection patch failed:', e.message);
}

// ─── USER AGENTS ───
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

function getRandomUserAgent() { return userAgents[Math.floor(Math.random() * userAgents.length)]; }
function randomDelay(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ─── ENCRYPTION ───
const ENCRYPTION_KEY = crypto.randomBytes(32);
const IV_LENGTH = 16;

function encryptToken(token) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptToken(encryptedData) {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ─── TOKEN STORAGE ───
const TOKEN_FILE = path.join(__dirname, 'tokens.enc');
let tokenStore = [];
let keysStore = [];

function loadTokensFromFile() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const data = fs.readFileSync(TOKEN_FILE, 'utf8');
            const parsed = JSON.parse(data);
            tokenStore = parsed.map(t => ({
                ...t,
                token: decryptToken(t.token)
            }));
            console.log('[RENDER] Loaded', tokenStore.length, 'user tokens');
            // Log first token preview
            if (tokenStore.length > 0) {
                console.log('[RENDER] First token preview:', tokenStore[0].token.substring(0, 20) + '...');
            }
            return tokenStore;
        } else {
            console.log('[RENDER] No token file found, creating new');
            fs.writeFileSync(TOKEN_FILE, JSON.stringify([]));
        }
    } catch (e) { console.log('[RENDER] Token load error:', e.message); }
    return [];
}

function saveTokensToFile() {
    try {
        const toSave = tokenStore.map(t => ({
            ...t,
            token: encryptToken(t.token)
        }));
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(toSave, null, 2));
        console.log('[RENDER] Tokens saved');
    } catch (e) { console.log('[RENDER] Token save error:', e.message); }
}

function addTokenToStore(token, owner = 'default', enabled = true) {
    // Validate token format
    if (!token || token.length < 10) {
        console.log('[RENDER] Invalid token - too short');
        return null;
    }
    
    const existing = tokenStore.find(t => t.token === token);
    if (existing) {
        existing.enabled = enabled;
        existing.owner = owner;
        saveTokensToFile();
        return existing;
    }
    const newToken = {
        id: Date.now() + Math.random() * 1000,
        token,
        owner,
        enabled,
        created: new Date().toISOString(),
        status: 'active'
    };
    tokenStore.push(newToken);
    saveTokensToFile();
    return newToken;
}

function removeTokenFromStore(id) {
    tokenStore = tokenStore.filter(t => t.id !== id);
    saveTokensToFile();
}

function toggleTokenInStore(id) {
    const token = tokenStore.find(t => t.id === id);
    if (token) {
        token.enabled = !token.enabled;
        saveTokensToFile();
        return token;
    }
    return null;
}

function getEnabledTokens() {
    return tokenStore.filter(t => t.enabled);
}

// ─── KEYS STORAGE ───
const KEYS_FILE = path.join(__dirname, 'keys.json');

function loadKeysFromFile() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            const data = fs.readFileSync(KEYS_FILE, 'utf8');
            keysStore = JSON.parse(data);
            console.log('[RENDER] Loaded', keysStore.length, 'keys');
            return keysStore;
        } else {
            console.log('[RENDER] No keys file found, creating new');
            fs.writeFileSync(KEYS_FILE, JSON.stringify([]));
        }
    } catch (e) { console.log('[RENDER] Keys load error:', e.message); }
    return [];
}

function saveKeysToFile() {
    try {
        fs.writeFileSync(KEYS_FILE, JSON.stringify(keysStore, null, 2));
        console.log('[RENDER] Keys saved');
    } catch (e) { console.log('[RENDER] Keys save error:', e.message); }
}

function generateKey(owner, days) {
    const key = crypto.randomBytes(16).toString('hex').toUpperCase();
    const created = new Date().toISOString();
    const expires = new Date(Date.now() + (parseInt(days) || 30) * 24 * 60 * 60 * 1000).toISOString();
    const keyData = { key, owner: owner || 'default', created, expires };
    keysStore.push(keyData);
    saveKeysToFile();
    return keyData;
}

function validateKey(key) {
    const found = keysStore.find(k => k.key === key);
    if (!found) return { valid: false, error: 'Invalid key' };
    const expired = new Date(found.expires) < new Date();
    if (expired) return { valid: false, error: 'Key expired' };
    return { valid: true, owner: found.owner, expires: found.expires };
}

loadTokensFromFile();
loadKeysFromFile();

// ─── EXPRESS SETUP ───
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
    console.log('[RENDER] Creating views folder...');
    fs.mkdirSync(viewsPath, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let adminSession = false;

function requireAuth(req, res, next) {
    if (adminSession) return next();
    if (req.path === '/' || req.path === '/login' || req.path === '/api/login') return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// ─── ROUTES ───
app.get('/', (req, res) => {
    console.log('[RENDER] Serving dashboard');
    try {
        res.render('dashboard', { 
            botCount: clients.length || 0,
            onlineCount: clients.filter(c => c?.user).length || 0,
            domination: dominationMode || false,
            spam: spamActive || false,
            volume: Math.round(currentVolumeMultiplier * 100) || 100,
            connected: connections.size || 0,
            tokenCount: tokenStore.length || 0,
            enabledCount: getEnabledTokens().length || 0,
            loggedIn: adminSession || false
        });
    } catch (err) {
        console.log('[RENDER] Render error:', err.message);
        res.send(`
            <html>
                <body style="background:#0a0a0a;color:#00ff41;font-family:monospace;padding:40px;">
                    <h1 style="color:#ff0040;">👑 RINTU SUITE</h1>
                    <p>✅ Server is running!</p>
                    <p>Error: ${err.message}</p>
                    <p><a href="/test" style="color:#00ff41;">Test Route →</a></p>
                </body>
            </html>
        `);
    }
});

app.get('/test', (req, res) => {
    res.send(`
        <html>
            <body style="background:#0a0a0a;color:#00ff41;font-family:monospace;padding:40px;">
                <h1 style="color:#ff0040;">👑 RINTU SUITE IS ALIVE!</h1>
                <p>✅ Server running on port ${process.env.PORT || 3000}</p>
                <p>📦 Tokens in DB: ${tokenStore.length}</p>
                <p>✅ Enabled: ${getEnabledTokens().length}</p>
                <p>🤖 Bots Online: ${clients.filter(c => c?.user).length}</p>
                <p>🔑 Keys: ${keysStore.length}</p>
                <p><a href="/" style="color:#00ff41;">Go to Dashboard →</a></p>
            </body>
        </html>
    `);
});

app.get('/ping', (req, res) => {
    res.json({ 
        status: 'alive', 
        time: new Date().toISOString(),
        tokens: tokenStore.length,
        enabled: getEnabledTokens().length,
        bots: clients.filter(c => c?.user).length,
        keys: keysStore.length
    });
});

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASS) {
        adminSession = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.post('/api/logout', (req, res) => {
    adminSession = false;
    res.json({ success: true });
});

// ─── TOKEN MANAGEMENT ───
app.get('/api/tokens', requireAuth, (req, res) => {
    res.json(tokenStore);
});

app.post('/api/tokens/add', requireAuth, (req, res) => {
    const { token, owner } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    
    // Debug: Log token preview
    console.log('[DEBUG] Adding token:', token.substring(0, 20) + '...');
    console.log('[DEBUG] Token length:', token.length);
    console.log('[DEBUG] Token starts with:', token.substring(0, 5));
    
    // Check if it's a valid Discord token format
    // Discord tokens are usually ~59 characters and start with MT or ND
    if (token.length < 50) {
        console.log('[WARNING] Token seems too short! Discord tokens are usually ~59 characters.');
    }
    
    const added = addTokenToStore(token, owner || 'default');
    if (!added) {
        return res.status(400).json({ error: 'Invalid token format' });
    }
    res.json({ success: true, token: added });
});

app.post('/api/tokens/delete', requireAuth, (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    removeTokenFromStore(id);
    res.json({ success: true });
});

app.post('/api/tokens/toggle', requireAuth, (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const updated = toggleTokenInStore(id);
    res.json({ success: true, token: updated });
});

app.post('/api/tokens/start', requireAuth, async (req, res) => {
    console.log('[API] START ALL TOKENS triggered');
    await startAllTokens();
    res.json({ success: true });
});

app.post('/api/tokens/stop', requireAuth, async (req, res) => {
    console.log('[API] STOP ALL TOKENS triggered');
    await stopAllTokens();
    res.json({ success: true });
});

app.post('/api/tokens/refresh', requireAuth, async (req, res) => {
    console.log('[API] REFRESH TOKENS triggered');
    await stopAllTokens();
    await sleep(2000);
    await startAllTokens();
    res.json({ success: true });
});

app.post('/api/tokens/bulk', requireAuth, (req, res) => {
    const { tokens, owner } = req.body;
    if (!tokens || !Array.isArray(tokens)) {
        return res.status(400).json({ error: 'Tokens array required' });
    }
    let added = 0;
    let failed = 0;
    tokens.forEach(token => {
        if (token && token.length > 10) {
            try {
                addTokenToStore(token, owner || 'bulk');
                added++;
            } catch (e) {
                failed++;
            }
        } else {
            failed++;
        }
    });
    res.json({ success: true, added, failed, total: tokens.length });
});

// ─── KEYAUTH ENDPOINTS ───
app.post('/api/keys/create', requireAuth, (req, res) => {
    const { owner, days } = req.body;
    const keyData = generateKey(owner, days);
    res.json({ success: true, key: keyData.key, owner: keyData.owner, days: days || 30 });
});

app.get('/api/keys/list', requireAuth, (req, res) => {
    res.json({ keys: keysStore });
});

app.post('/api/keys/validate', (req, res) => {
    const { key } = req.body;
    if (!key) return res.json({ valid: false, error: 'Key required' });
    const result = validateKey(key);
    res.json(result);
});

// ─── COMMANDS ───
app.post('/api/domination/start', requireAuth, async (req, res) => {
    const { channelId } = req.body;
    if (!channelId) return res.status(400).json({ error: 'Channel ID required' });
    console.log('[API] Domination start on:', channelId);
    await dominationTakeover(channelId);
    res.json({ success: true });
});

app.post('/api/domination/stop', requireAuth, (req, res) => {
    console.log('[API] Domination stop');
    stopDomination();
    res.json({ success: true });
});

app.post('/api/sjoin', requireAuth, async (req, res) => {
    const { invite } = req.body;
    if (!invite) return res.status(400).json({ error: 'Invite required' });
    console.log('[API] SJOIN:', invite);
    await stealthSjoin(invite);
    res.json({ success: true });
});

app.post('/api/sleave', requireAuth, async (req, res) => {
    const { serverId } = req.body;
    if (!serverId) return res.status(400).json({ error: 'Server ID required' });
    console.log('[API] SLEAVE:', serverId);
    await stealthSleave(serverId);
    res.json({ success: true });
});

app.post('/api/sleaveall', requireAuth, async (req, res) => {
    console.log('[API] SLEAVE ALL');
    await stealthSleaveAll();
    res.json({ success: true });
});

app.post('/api/name', requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    console.log('[API] NAME CHANGE:', name);
    await stealthNameChange(name);
    res.json({ success: true });
});

app.post('/api/spam/start', requireAuth, async (req, res) => {
    const { channelId, messages, delay } = req.body;
    if (!channelId || !messages) return res.status(400).json({ error: 'Channel ID and messages required' });
    const msgArray = messages.split('|').map(m => m.trim());
    console.log('[API] SPAM start:', channelId);
    await spamCommand(channelId, msgArray, parseInt(delay) || 3000);
    res.json({ success: true });
});

app.post('/api/spam/stop', requireAuth, (req, res) => {
    console.log('[API] SPAM stop');
    stopSpamCommand();
    res.json({ success: true });
});

app.post('/api/ssend', requireAuth, async (req, res) => {
    const { channelId, message } = req.body;
    if (!channelId || !message) return res.status(400).json({ error: 'Channel ID and message required' });
    console.log('[API] SSEND:', channelId);
    await stealthSend(channelId, message);
    res.json({ success: true });
});

app.post('/api/password', requireAuth, async (req, res) => {
    const { channelId, target, password } = req.body;
    if (!channelId || !target) return res.status(400).json({ error: 'Channel ID and target required' });
    console.log('[API] PASSWORD:', target);
    await stealthPasswordBypass(channelId, target, password || 'BYPASSED');
    res.json({ success: true });
});

app.post('/api/joinvc', requireAuth, async (req, res) => {
    const { channelId } = req.body;
    if (!channelId) return res.status(400).json({ error: 'Channel ID required' });
    console.log('[API] JOIN VC:', channelId);
    await stealthJoinVC(channelId);
    res.json({ success: true });
});

app.post('/api/play', requireAuth, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    console.log('[API] PLAY:', url);
    await stealthPlay(url);
    res.json({ success: true });
});

app.post('/api/control', requireAuth, (req, res) => {
    const { action } = req.body;
    console.log('[API] CONTROL:', action);
    switch(action) {
        case 'pause': players.forEach(p => p.pause()); isPaused = true; break;
        case 'resume': players.forEach(p => p.unpause()); isPaused = false; break;
        case 'stop': stopFFmpeg(); players.forEach(p => p.stop()); activeResources.clear(); break;
        case 'loop': loopMode = !loopMode; break;
        case 'bassboost': isBassboosted = !isBassboosted; if (currentUrl) startFFmpegStream(currentUrl); break;
        case 'blast': blastMode = !blastMode; pungiMode = false; if (currentUrl) startFFmpegStream(currentUrl); break;
        case 'pungi': pungiMode = !pungiMode; blastMode = false; if (currentUrl) startFFmpegStream(currentUrl); break;
        case 'leave': stopFFmpeg(); players.forEach(p => p.stop()); players.clear(); connections.forEach(c => { try { c.destroy(); } catch(e){} }); connections.clear(); activeResources.clear(); currentUrl = null; break;
    }
    res.json({ success: true });
});

app.post('/api/volume', requireAuth, (req, res) => {
    const { volume } = req.body;
    const vol = parseInt(volume);
    if (isNaN(vol) || vol < 1 || vol > 20000) return res.status(400).json({ error: 'Volume 1-20000' });
    currentVolumeMultiplier = vol / 100;
    activeResources.forEach(r => { if (r?.volume) r.volume.setVolume(currentVolumeMultiplier); });
    res.json({ success: true });
});

app.get('/api/stats', requireAuth, (req, res) => {
    const online = clients.filter(c => c?.user).length;
    console.log('[API] Stats - Bots:', clients.length, 'Online:', online);
    res.json({
        bots: clients.length || 0,
        online: online || 0,
        connected: connections.size || 0,
        domination: dominationMode || false,
        spam: spamActive || false,
        volume: Math.round(currentVolumeMultiplier * 100) || 100,
        loop: loopMode || false,
        paused: isPaused || false,
        bassboost: isBassboosted || false,
        blast: blastMode || false,
        pungi: pungiMode || false,
        currentTrack: currentTitle || 'None',
        tokenCount: tokenStore.length || 0,
        enabledCount: getEnabledTokens().length || 0,
        keyCount: keysStore.length || 0
    });
});

// ─── SOCKET.IO ───
io.on('connection', (socket) => {
    console.log('[SOCKET] Client connected');
    socket.emit('stats', {
        bots: clients.length || 0,
        online: clients.filter(c => c?.user).length || 0,
        connected: connections.size || 0,
        domination: dominationMode || false,
        spam: spamActive || false,
        volume: Math.round(currentVolumeMultiplier * 100) || 100,
        currentTrack: currentTitle || 'None',
        tokenCount: tokenStore.length || 0,
        keyCount: keysStore.length || 0
    });
});

// ─── DISCORD SELFBOT IMPORTS ───
const { Client } = require("discord.js-selfbot-v13");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require("@discordjs/voice");
const { spawn } = require("child_process");
const youtubedl = require("youtube-dl-exec");
const axios = require("axios");

// ─── GLOBALS ───
const clients = [];
const connections = new Map();
const players = new Map();
const activeResources = new Map();
const clientMap = new Map();
let currentFFmpegProcess = null;
let currentUrl = null;
let currentTitle = "Unknown";
let currentChannelId = null;
let loopMode = false, isPaused = false, isBassboosted = false;
let currentVolumeMultiplier = 1.0;
let blastMode = false, blastVolume = 50.0;
let pungiMode = false, pungiIntensity = 50.0;
let superLoudMode = false, forceLoudMode = false;
let dominationMode = false, dominationTarget = null, dominationInterval = null;
let spamActive = false, spamInterval = null, spamMessages = [], spamChannelId = null, spamDelay = 5000;
let isLoggedIn = false;
let isBotStarting = false;

// ─── SELFBOT LOGIN WITH DEBUG ───
async function stealthLogin(token, index) {
    try {
        console.log(`[🤖 SELFBOT DEBUG] Attempting login for token ${index + 1}...`);
        console.log(`[🤖 SELFBOT DEBUG] Token preview: ${token.substring(0, 20)}...`);
        console.log(`[🤖 SELFBOT DEBUG] Token length: ${token.length}`);
        console.log(`[🤖 SELFBOT DEBUG] Token starts with: ${token.substring(0, 5)}`);
        
        // Validate token format
        if (token.length < 50) {
            console.log(`[🤖 SELFBOT ERROR] Token ${index + 1} is too short! Discord tokens are ~59 characters.`);
            console.log(`[🤖 SELFBOT ERROR] This is NOT a valid Discord user token.`);
            return null;
        }
        
        const profile = {
            index,
            userAgent: getRandomUserAgent(),
            device: ['Windows', 'Macintosh', 'X11'][Math.floor(Math.random() * 3)],
            browser: ['Chrome', 'Firefox', 'Safari'][Math.floor(Math.random() * 3)],
            fingerprint: crypto.randomBytes(16).toString('hex'),
            sessionId: crypto.randomBytes(8).toString('hex')
        };

        const client = new Client({
            checkUpdate: false,
            ws: {
                properties: {
                    $browser: profile.browser === 'Chrome' ? 'Discord Chrome' :
                              profile.browser === 'Firefox' ? 'Discord Firefox' : 'Discord Safari',
                    $device: profile.device,
                    $os: profile.device === 'Windows' ? 'Windows' :
                         profile.device === 'Macintosh' ? 'Mac OS X' : 'Linux'
                }
            }
        });

        client.on("ready", () => {
            console.log(`[🤖 SELFBOT ✅] ${client.user?.tag || 'Unknown'} online (${index + 1}/${clients.length})`);
            clientMap.set(token, client);
            isLoggedIn = true;
            io.emit('stats', { 
                bots: clients.length, 
                online: clients.filter(c => c?.user).length 
            });
        });

        client.on("error", (err) => {
            console.log(`[🤖 SELFBOT ❌] Bot ${index + 1} error: ${err.message}`);
        });

        client.on("rateLimit", (data) => {
            console.log(`[⏳ RATE] Bot ${index + 1} rate limited`);
        });

        console.log(`[🤖 SELFBOT DEBUG] Attempting to login with token ${index + 1}...`);
        await client.login(token);
        clients.push(client);
        console.log(`[🤖 SELFBOT ✅] Bot ${index + 1} login successful!`);
        return client;

    } catch (err) {
        console.log(`[🤖 SELFBOT ❌] Bot ${index + 1} login failed: ${err.message}`);
        console.log(`[🤖 SELFBOT DEBUG] Error stack:`, err.stack);
        return null;
    }
}

// ─── START ALL TOKENS WITH DEBUG ───
async function startAllTokens() {
    if (isBotStarting) {
        console.log('[🚀 START] Already starting...');
        return;
    }
    isBotStarting = true;
    
    const tokens = getEnabledTokens();
    console.log(`[🚀 START] Found ${tokens.length} enabled tokens in database`);
    
    if (tokens.length === 0) {
        console.log('[🚀 START] ❌ No enabled tokens found!');
        console.log('[🚀 START] 💡 Add tokens and enable them from the dashboard.');
        isBotStarting = false;
        io.emit('command_result', { command: 'start', result: '❌ No enabled tokens found!' });
        return;
    }
    
    // Log all token previews
    tokens.forEach((t, i) => {
        console.log(`[🚀 START] Token ${i+1} preview: ${t.token.substring(0, 20)}... (${t.token.length} chars)`);
    });
    
    // Clear existing clients
    for (const client of clients) {
        try { if (client) await client.destroy(); } catch (e) {}
    }
    clients.length = 0;
    clientMap.clear();
    connections.clear();
    players.clear();
    activeResources.clear();
    
    let successCount = 0;
    for (let i = 0; i < tokens.length; i++) {
        const tokenData = tokens[i];
        console.log(`[🚀 START] Logging in token ${i + 1}/${tokens.length}...`);
        const client = await stealthLogin(tokenData.token, i);
        if (client) {
            successCount++;
            console.log(`[🚀 START] ✅ Token ${i + 1} logged in successfully`);
        } else {
            console.log(`[🚀 START] ❌ Token ${i + 1} failed to login`);
        }
        await sleep(randomDelay(1000, 3000));
    }
    
    isBotStarting = false;
    console.log(`[🚀 START] ✅ ${successCount}/${tokens.length} user bots online`);
    console.log(`[🚀 START] 💡 Total clients in array: ${clients.length}`);
    console.log(`[🚀 START] 💡 Online clients: ${clients.filter(c => c?.user).length}`);
    
    io.emit('stats', { 
        bots: clients.length, 
        online: clients.filter(c => c?.user).length 
    });
    io.emit('command_result', { command: 'start', result: `✅ ${successCount}/${tokens.length} bots online` });
}

// ─── STOP ALL TOKENS ───
async function stopAllTokens() {
    console.log('[🛑 STOP] Shutting down all user bots...');
    for (const client of clients) {
        try {
            if (client) await client.destroy();
        } catch (e) {}
    }
    clients.length = 0;
    clientMap.clear();
    connections.clear();
    players.clear();
    activeResources.clear();
    isLoggedIn = false;
    io.emit('stats', { bots: 0, online: 0 });
    console.log('[🛑 STOP] All user bots offline');
    io.emit('command_result', { command: 'stop', result: '🛑 All bots stopped' });
}

// ─── STEALTH JOIN VC ───
async function stealthJoinVC(channelId) {
    currentChannelId = channelId;
    
    const onlineBots = clients.filter(c => c?.user);
    console.log(`[🔊 SELFBOT VC] Connecting ${onlineBots.length} user bots to VC: ${channelId}`);
    
    if (onlineBots.length === 0) {
        console.log('[🔊 SELFBOT VC] ❌ No bots online! Start tokens first.');
        io.emit('command_result', { command: 'joinvc', result: '❌ No bots online! Start tokens first.' });
        return;
    }
    
    let connected = 0;
    let notInServer = 0;
    
    for (const [index, client] of clients.entries()) {
        if (!client || !client.user) {
            console.log(`[Bot ${index + 1}] Skipping - not online`);
            continue;
        }
        try {
            console.log(`[Bot ${index + 1}] Attempting to join VC...`);
            const channel = await client.channels.fetch(channelId);
            
            if (!channel) {
                console.log(`[Bot ${index + 1}] ❌ Channel not found`);
                notInServer++;
                continue;
            }
            
            console.log(`[Bot ${index + 1}] Found channel: ${channel.name || channel.id}`);
            
            const guild = await client.guilds.fetch(channel.guild.id).catch(() => null);
            if (!guild) {
                console.log(`[Bot ${index + 1}] ❌ Not in this guild! Use SJOIN first.`);
                notInServer++;
                continue;
            }
            
            const conn = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfMute: false,
                selfDeaf: false,
                group: client.user.id
            });
            
            const player = createAudioPlayer();
            conn.subscribe(player);
            player.on(AudioPlayerStatus.Idle, () => {
                if (loopMode && currentUrl && !isPaused && index === 0) {
                    console.log("[LOOP] 🔄 Replaying...");
                    setTimeout(() => startFFmpegStream(currentUrl), 500);
                }
            });
            
            connections.set(index, conn);
            players.set(index, player);
            connected++;
            console.log(`[Bot ${index + 1}] ✅ Connected to VC`);
            
        } catch (err) {
            console.log(`[Bot ${index + 1}] ❌ VC Error: ${err.message}`);
            if (err.message.includes('Not Found')) {
                notInServer++;
            }
        }
        await sleep(randomDelay(300, 800));
    }
    
    console.log(`[🔊 SELFBOT VC] ✅ ${connected}/${clients.length} bots connected`);
    io.emit('stats', { connected: connections.size });
    io.emit('command_result', { command: 'joinvc', result: `✅ ${connected}/${clients.length} bots joined VC` });
}

// ─── OTHER STEALTH COMMANDS (short versions) ───
async function stealthSjoin(inviteInput) {
    const onlineBots = clients.filter(c => c?.user);
    console.log(`[🔗 SJOIN] Joining with ${onlineBots.length} bots...`);
    if (onlineBots.length === 0) {
        io.emit('command_result', { command: 'sjoin', result: '❌ No bots online!' });
        return;
    }
    let inviteCode = inviteInput;
    if (inviteInput.includes('discord.gg/')) inviteCode = inviteInput.split('discord.gg/')[1].split('/')[0].split('?')[0];
    if (inviteInput.includes('discord.com/invite/')) inviteCode = inviteInput.split('discord.com/invite/')[1].split('/')[0].split('?')[0];
    let success = 0;
    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        if (!client || !client.user) continue;
        try {
            await sleep(randomDelay(500, 2000));
            await client.acceptInvite(inviteCode);
            success++;
        } catch (e) {
            try {
                await axios.post(`https://discord.com/api/v9/invites/${inviteCode}`, {}, {
                    headers: { 'Authorization': client.token, 'User-Agent': getRandomUserAgent() }
                });
                success++;
            } catch (e2) {}
        }
        await sleep(randomDelay(1000, 3000));
    }
    io.emit('command_result', { command: 'sjoin', result: `✅ ${success}/${clients.length} joined` });
}

async function stealthSleave(serverId) {
    let success = 0;
    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        if (!client || !client.user) continue;
        try {
            await sleep(randomDelay(300, 1500));
            const guild = await client.guilds.fetch(serverId);
            if (guild) { await guild.leave(); success++; }
        } catch (e) {
            try {
                await axios.delete(`https://discord.com/api/v9/users/@me/guilds/${serverId}`, {
                    headers: { 'Authorization': client.token }
                });
                success++;
            } catch (e2) {}
        }
        await sleep(randomDelay(200, 800));
    }
    io.emit('command_result', { command: 'sleave', result: `✅ ${success}/${clients.length} left` });
}

async function stealthSleaveAll() {
    let total = 0;
    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        if (!client || !client.user) continue;
        const guilds = client.guilds.cache.map(g => g.id);
        for (const gid of guilds) {
            try {
                await client.guilds.fetch(gid).then(g => g?.leave());
                total++;
            } catch (e) { total++; }
            await sleep(randomDelay(100, 400));
        }
    }
    io.emit('command_result', { command: 'sleaveall', result: `✅ Left ${total} servers` });
}

async function stealthNameChange(newName) {
    let success = 0;
    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        if (!client || !client.user) continue;
        try {
            await sleep(randomDelay(500, 2000));
            await client.user.setUsername(newName);
            success++;
        } catch (e) {
            try {
                await axios.patch(`https://discord.com/api/v9/users/@me`, { username: newName }, {
                    headers: { 'Authorization': client.token }
                });
                success++;
            } catch (e2) {}
        }
        await sleep(randomDelay(300, 1000));
    }
    io.emit('command_result', { command: 'name', result: `✅ ${success}/${clients.length} changed to ${newName}` });
}

async function stealthSend(channelId, message) {
    let success = 0;
    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        if (!client || !client.user) continue;
        try {
            await sleep(randomDelay(200, 800));
            const channel = await client.channels.fetch(channelId);
            if (channel) { await channel.send(message); success++; }
        } catch (e) { success++; }
    }
    io.emit('command_result', { command: 'ssend', result: `✅ ${success}/${clients.length} sent` });
}

async function stealthPasswordBypass(channelId, targetUser, password) {
    let success = 0;
    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        if (!client || !client.user) continue;
        try {
            await sleep(randomDelay(300, 1200));
            const channel = await client.channels.fetch(channelId);
            if (channel) {
                await channel.send(`🔓 **PASSWORD BYPASS**\n👤 ${targetUser}\n🔑 ${password}\n🛡️ VERIFIED`);
                success++;
            }
        } catch (e) { success++; }
    }
    io.emit('command_result', { command: 'pass', result: `✅ ${success}/${clients.length} sent` });
}

async function stealthPlay(url) {
    if (connections.size === 0) {
        io.emit('command_result', { command: 'play', result: '❌ Join VC first!' });
        return;
    }
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        try {
            const result = await youtubedl(url, { dumpSingleJson: true, noPlaylist: true, format: "bestaudio[ext=webm]/bestaudio/best", noWarnings: true });
            currentUrl = result.url;
            currentTitle = result.title || "YouTube Audio";
            startFFmpegStream(currentUrl);
        } catch (err) { console.log(`[yt-dlp error]: ${err.message}`); }
    } else {
        currentUrl = url;
        currentTitle = "Direct Audio";
        startFFmpegStream(url);
    }
    io.emit('stats', { currentTrack: currentTitle });
    io.emit('command_result', { command: 'play', result: `▶️ Playing: ${currentTitle}` });
}

async function dominationTakeover(channelId) {
    if (dominationMode) return;
    dominationMode = true;
    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        if (!client || !client.user) continue;
        try {
            await sleep(randomDelay(300, 1200));
            const channel = await client.channels.fetch(channelId);
            if (channel) {
                const conn = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: channel.guild.id,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfMute: false,
                    selfDeaf: false,
                    group: client.user.id
                });
                connections.set(i, conn);
            }
        } catch (err) {}
    }
    dominationInterval = setInterval(async () => {
        try {
            const primary = clients[0];
            if (!primary || !primary.user || !channelId) return;
            const channel = primary.channels.cache.get(channelId);
            if (!channel) return;
            const botIds = clients.map(c => c.user?.id).filter(Boolean);
            const speakers = channel.members.filter(m => !botIds.includes(m.id) && m.voice?.speaking);
            if (speakers.size > 0) {
                const names = speakers.map(m => m.user?.tag || 'Unknown');
                console.log(`[DOMINATION] 🎯 Speakers: ${names.join(', ')}`);
                blastMode = true;
                currentVolumeMultiplier = 100.0;
                io.emit('domination', { speakers: names, blast: true });
            }
        } catch (err) {}
    }, 5000);
    io.emit('stats', { domination: true });
    io.emit('command_result', { command: 'dominate', result: `👑 ${clients.length} bots dominating` });
}

function stopDomination() {
    dominationMode = false;
    if (dominationInterval) clearInterval(dominationInterval);
    connections.forEach(c => { try { c.destroy(); } catch (e) {} });
    connections.clear();
    players.clear();
    activeResources.clear();
    io.emit('stats', { domination: false });
    io.emit('command_result', { command: 'stopdom', result: '⛔ Domination stopped' });
}

async function spamCommand(channelId, messages, delay) {
    if (spamActive) return;
    spamChannelId = channelId;
    spamMessages = messages;
    spamDelay = delay || 3000;
    spamActive = true;
    let idx = 0, total = 0;
    spamInterval = setInterval(async () => {
        if (!spamActive) { clearInterval(spamInterval); return; }
        const msg = spamMessages[idx % spamMessages.length];
        idx++;
        let sent = 0;
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            if (!client || !client.user) continue;
            try {
                await sleep(randomDelay(100, 400));
                const channel = await client.channels.fetch(spamChannelId);
                if (channel) { await channel.send(msg); sent++; total++; }
            } catch (e) { sent++; }
        }
        console.log(`[SPAM] 📨 Sent ${sent}/${clients.length} | Total: ${total}`);
        io.emit('spam', { total, sent });
    }, spamDelay + randomDelay(0, 2000));
    io.emit('stats', { spam: true });
    io.emit('command_result', { command: 'spam', result: `💬 Spamming ${messages.length} messages` });
}

function stopSpamCommand() {
    if (spamInterval) clearInterval(spamInterval);
    spamActive = false;
    io.emit('stats', { spam: false });
    io.emit('command_result', { command: 'stopspam', result: '⛔ Spam stopped' });
}

// ─── AUDIO ENGINE ───
function stopFFmpeg() {
    if (currentFFmpegProcess) { try { currentFFmpegProcess.kill("SIGKILL"); } catch (e) {} currentFFmpegProcess = null; }
}

function startFFmpegStream(inputSource) {
    stopFFmpeg();
    let filters = ["highpass=f=60"];
    if (isBassboosted) filters.push("equalizer=f=60:width_type=h:width=50:g=15");
    if (pungiMode) filters.push("acrusher=bits=4:mode=log:aa=1", `volume=${pungiIntensity}`);
    else if (blastMode) filters.push(`volume=${blastVolume}`, "dynaudnorm=p=0.9:m=50.0:g=15");
    else if (currentVolumeMultiplier > 1.0) filters.push(`volume=${currentVolumeMultiplier}`);

    currentFFmpegProcess = spawn("ffmpeg", [
        "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
        "-i", inputSource,
        "-filter:a", filters.join(","),
        "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1"
    ]);

    clients.forEach((client, index) => {
        const player = players.get(index);
        if (player && currentFFmpegProcess) {
            try {
                const resource = createAudioResource(currentFFmpegProcess.stdout, {
                    inputType: StreamType.Raw,
                    inlineVolume: true
                });
                let vol = currentVolumeMultiplier;
                if (pungiMode) vol = Math.min(pungiIntensity, 200);
                else if (blastMode) vol = Math.min(blastVolume, 500);
                else vol = Math.min(currentVolumeMultiplier * 2, 200);
                resource.volume.setVolume(vol);
                activeResources.set(index, resource);
                player.play(resource);
            } catch (err) {}
        }
    });
    isPaused = false;
}

// ─── START SERVER ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║        👑 RINTU SELFBOT SUITE - DEBUG MODE 👑             ║
║              🛡️ STEALTH MODE: MAXIMUM                      ║
║              🔍 DEBUG LOGGING: ENABLED                     ║
║              💀 SLASH KILLER: ACTIVE                       ║
╠══════════════════════════════════════════════════════════════╣
║  📦 User Tokens in DB: ${tokenStore.length}                ║
║  ✅ Enabled Tokens: ${getEnabledTokens().length}           ║
║  🤖 Bots Online: ${clients.filter(c => c?.user).length}   ║
║  🔑 Keys Generated: ${keysStore.length}                    ║
║  🌐 Dashboard: http://localhost:${PORT}                     ║
║  🔑 Admin Pass: ${process.env.ADMIN_PASS || 'SET_IN_ENV'}  ║
║  📋 CHECK RENDER LOGS FOR DEBUG INFO                       ║
╚══════════════════════════════════════════════════════════════╝
    `);
    
    if (getEnabledTokens().length > 0) {
        console.log('[🚀 AUTO-START] Launching user tokens...');
        await startAllTokens();
    } else {
        console.log('[⚠️ WARNING] No enabled tokens found!');
        console.log('[💡 TIP] Add tokens from the dashboard and enable them.');
    }
});
