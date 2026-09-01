console.log('👑 RINTU SUITE v7.0 STARTING...');

// ─── CRITICAL: Load dotenv FIRST ───
require('dotenv').config();

// ─── IMPORTS ───
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

console.log('[BOOT] Dependencies loaded');

// ─── SIMPLE TOKEN STORAGE ───
const TOKEN_FILE = path.join(__dirname, 'tokens.json');
const KEYS_FILE = path.join(__dirname, 'keys.json');

let tokens = [];
let keys = [];

// Load tokens
function loadTokens() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const data = fs.readFileSync(TOKEN_FILE, 'utf8');
            tokens = JSON.parse(data);
            console.log('[TOKENS] Loaded', tokens.length);
        } else {
            tokens = [];
            fs.writeFileSync(TOKEN_FILE, JSON.stringify([]));
        }
    } catch (e) {
        console.log('[TOKENS] Error:', e.message);
        tokens = [];
    }
    return tokens;
}

function saveTokens() {
    try {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    } catch (e) {
        console.log('[TOKENS] Save error:', e.message);
    }
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
    if (t) {
        t.enabled = !t.enabled;
        saveTokens();
        return t;
    }
    return null;
}

function getEnabledTokens() {
    return tokens.filter(t => t.enabled === true);
}

// Load keys
function loadKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            const data = fs.readFileSync(KEYS_FILE, 'utf8');
            keys = JSON.parse(data);
            console.log('[KEYS] Loaded', keys.length);
        } else {
            keys = [];
            fs.writeFileSync(KEYS_FILE, JSON.stringify([]));
        }
    } catch (e) {
        keys = [];
    }
    return keys;
}

function saveKeys() {
    try {
        fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
    } catch (e) {}
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

// ─── EXPRESS SETUP ───
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

console.log('[BOOT] Express setup');

// ─── VIEW ENGINE ───
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Create views folder if missing
const viewsPath = path.join(__dirname, 'views');
if (!fs.existsSync(viewsPath)) {
    console.log('[BOOT] Creating views folder...');
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
            onlineCount: clients.filter(c => c?.user).length || 0,
            keyCount: keys.length,
            domination: dominationMode || false,
            spam: spamActive || false,
            volume: Math.round(volume * 100) || 100,
            connected: connections.size || 0,
            admin: admin
        });
    } catch (err) {
        console.log('[ROUTE] Error:', err.message);
        res.send(`
            <html>
                <body style="background:#0a0a0a;color:#00ff41;font-family:monospace;padding:40px;">
                    <h1 style="color:#ff0040;">👑 RINTU SUITE</h1>
                    <p>✅ Server is running!</p>
                    <p>Error: ${err.message}</p>
                    <p>Make sure views/dashboard.ejs exists!</p>
                </body>
            </html>
        `);
    }
});

app.get('/test', (req, res) => {
    res.json({ 
        status: 'alive', 
        time: new Date().toISOString(),
        tokens: tokens.length,
        keys: keys.length
    });
});

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASS) {
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

app.post('/api/tokens/start', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await startBots();
    res.json({ success: true });
});

app.post('/api/tokens/stop', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await stopBots();
    res.json({ success: true });
});

app.post('/api/tokens/bulk', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const { tokens: tokenList, owner } = req.body;
    if (!tokenList || !Array.isArray(tokenList)) {
        return res.status(400).json({ error: 'Tokens array required' });
    }
    let added = 0;
    tokenList.forEach(t => {
        if (t && t.length > 10) {
            addToken(t, owner || 'bulk');
            added++;
        }
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

// ─── COMMAND API ───
app.post('/api/joinvc', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await joinVoiceChannel(req.body.channelId);
    res.json({ success: true });
});

app.post('/api/sjoin', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await joinServer(req.body.invite);
    res.json({ success: true });
});

app.post('/api/sleave', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await leaveServer(req.body.serverId);
    res.json({ success: true });
});

app.post('/api/sleaveall', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await leaveAllServers();
    res.json({ success: true });
});

app.post('/api/name', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await changeNames(req.body.name);
    res.json({ success: true });
});

app.post('/api/ssend', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await sendMessage(req.body.channelId, req.body.message);
    res.json({ success: true });
});

app.post('/api/spam/start', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await startSpam(req.body.channelId, req.body.messages, req.body.delay);
    res.json({ success: true });
});

app.post('/api/spam/stop', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    stopSpam();
    res.json({ success: true });
});

app.post('/api/domination/start', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await startDomination(req.body.channelId);
    res.json({ success: true });
});

app.post('/api/domination/stop', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    stopDomination();
    res.json({ success: true });
});

app.post('/api/play', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    await playAudio(req.body.url);
    res.json({ success: true });
});

app.post('/api/control', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const { action } = req.body;
    if (action === 'pause') players.forEach(p => p.pause());
    if (action === 'resume') players.forEach(p => p.unpause());
    if (action === 'stop') { stopFFmpeg(); players.forEach(p => p.stop()); activeResources.clear(); }
    if (action === 'loop') loopMode = !loopMode;
    if (action === 'bassboost') { bassBoost = !bassBoost; if (currentUrl) playAudio(currentUrl); }
    if (action === 'blast') { blastMode = !blastMode; if (currentUrl) playAudio(currentUrl); }
    if (action === 'leave') { stopFFmpeg(); players.clear(); connections.forEach(c => { try { c.destroy(); } catch(e){} }); connections.clear(); activeResources.clear(); currentUrl = null; }
    res.json({ success: true });
});

app.post('/api/volume', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    volume = parseInt(req.body.volume) / 100;
    activeResources.forEach(r => { if (r?.volume) r.volume.setVolume(volume); });
    res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    res.json({
        tokens: tokens.length,
        enabled: getEnabledTokens().length,
        online: clients.filter(c => c?.user).length,
        keys: keys.length,
        domination: dominationMode,
        spam: spamActive,
        volume: Math.round(volume * 100),
        connected: connections.size
    });
});

// ─── SOCKET ───
io.on('connection', (socket) => {
    console.log('[SOCKET] Connected');
    socket.emit('stats', {
        tokens: tokens.length,
        enabled: getEnabledTokens().length,
        online: clients.filter(c => c?.user).length,
        keys: keys.length
    });
});

// ─── DISCORD SELFBOT ───
console.log('[BOOT] Loading Discord modules...');

const { Client } = require("discord.js-selfbot-v13");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require("@discordjs/voice");
const { spawn } = require("child_process");
const youtubedl = require("youtube-dl-exec");
const axios = require("axios");

console.log('[BOOT] Discord modules loaded');

const clients = [];
const connections = new Map();
const players = new Map();
const activeResources = new Map();
let currentFFmpegProcess = null;
let currentUrl = null;
let currentTitle = "Unknown";
let volume = 1.0;
let loopMode = false;
let bassBoost = false;
let blastMode = false;
let dominationMode = false;
let dominationInterval = null;
let spamActive = false;
let spamInterval = null;

// ─── START BOTS ───
async function startBots() {
    const enabled = getEnabledTokens();
    console.log('[BOTS] Starting', enabled.length, 'bots');
    
    for (const c of clients) {
        try { await c.destroy(); } catch(e) {}
    }
    clients.length = 0;
    
    for (let i = 0; i < enabled.length; i++) {
        const t = enabled[i];
        try {
            console.log('[BOTS] Logging in', i + 1, '/', enabled.length);
            const client = new Client({ checkUpdate: false });
            
            client.on('ready', () => {
                console.log('[BOTS] ✅', client.user?.tag || 'Unknown', 'online');
                io.emit('stats', { online: clients.filter(c => c?.user).length });
            });
            
            client.on('error', (e) => {
                console.log('[BOTS] ❌ Error:', e.message);
            });
            
            await client.login(t.token);
            clients.push(client);
            await sleep(2000);
        } catch (e) {
            console.log('[BOTS] ❌ Failed:', e.message);
        }
    }
    console.log('[BOTS] ✅', clients.filter(c => c?.user).length, 'online');
    io.emit('stats', { online: clients.filter(c => c?.user).length });
}

async function stopBots() {
    console.log('[BOTS] Stopping all...');
    for (const c of clients) {
        try { await c.destroy(); } catch(e) {}
    }
    clients.length = 0;
    connections.clear();
    players.clear();
    activeResources.clear();
    io.emit('stats', { online: 0 });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── JOIN VC ───
async function joinVoiceChannel(channelId) {
    const online = clients.filter(c => c?.user);
    if (online.length === 0) {
        io.emit('command_result', { command: 'joinvc', result: '❌ No bots online!' });
        return;
    }
    
    let connected = 0;
    for (let i = 0; i < online.length; i++) {
        const client = online[i];
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) continue;
            
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
            connections.set(i, conn);
            players.set(i, player);
            connected++;
        } catch (e) {
            console.log('[VC] Error:', e.message);
        }
        await sleep(1000);
    }
    io.emit('stats', { connected: connections.size });
    io.emit('command_result', { command: 'joinvc', result: `✅ ${connected}/${online.length} joined VC` });
}

// ─── SJOIN ───
async function joinServer(inviteInput) {
    const online = clients.filter(c => c?.user);
    if (online.length === 0) {
        io.emit('command_result', { command: 'sjoin', result: '❌ No bots online!' });
        return;
    }
    
    let code = inviteInput;
    if (inviteInput.includes('discord.gg/')) code = inviteInput.split('discord.gg/')[1].split('/')[0];
    if (inviteInput.includes('discord.com/invite/')) code = inviteInput.split('discord.com/invite/')[1].split('/')[0];
    
    let joined = 0;
    for (const client of online) {
        try {
            await client.acceptInvite(code);
            joined++;
        } catch (e) {
            try {
                await axios.post(`https://discord.com/api/v9/invites/${code}`, {}, {
                    headers: { 'Authorization': client.token }
                });
                joined++;
            } catch(e2) {}
        }
        await sleep(2000);
    }
    io.emit('command_result', { command: 'sjoin', result: `✅ ${joined}/${online.length} joined` });
}

// ─── SLEAVE ───
async function leaveServer(serverId) {
    let left = 0;
    for (const client of clients) {
        if (!client?.user) continue;
        try {
            const guild = await client.guilds.fetch(serverId);
            if (guild) { await guild.leave(); left++; }
        } catch(e) { left++; }
        await sleep(1000);
    }
    io.emit('command_result', { command: 'sleave', result: `✅ ${left}/${clients.length} left` });
}

async function leaveAllServers() {
    let total = 0;
    for (const client of clients) {
        if (!client?.user) continue;
        for (const gid of client.guilds.cache.map(g => g.id)) {
            try {
                await client.guilds.fetch(gid).then(g => g?.leave());
                total++;
            } catch(e) { total++; }
            await sleep(500);
        }
    }
    io.emit('command_result', { command: 'sleaveall', result: `✅ Left ${total} servers` });
}

// ─── NAME CHANGE ───
async function changeNames(name) {
    let changed = 0;
    for (const client of clients) {
        if (!client?.user) continue;
        try {
            await client.user.setUsername(name);
            changed++;
        } catch(e) {}
        await sleep(2000);
    }
    io.emit('command_result', { command: 'name', result: `✅ ${changed}/${clients.length} changed` });
}

// ─── SEND MESSAGE ───
async function sendMessage(channelId, message) {
    let sent = 0;
    for (const client of clients) {
        if (!client?.user) continue;
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel) { await channel.send(message); sent++; }
        } catch(e) { sent++; }
        await sleep(500);
    }
    io.emit('command_result', { command: 'ssend', result: `✅ ${sent}/${clients.length} sent` });
}

// ─── SPAM ───
async function startSpam(channelId, messages, delay) {
    if (spamActive) return;
    spamActive = true;
    const msgList = messages.split('|').map(m => m.trim());
    let idx = 0;
    
    spamInterval = setInterval(async () => {
        if (!spamActive) { clearInterval(spamInterval); return; }
        const msg = msgList[idx % msgList.length];
        idx++;
        let sent = 0;
        for (const client of clients) {
            if (!client?.user) continue;
            try {
                const channel = await client.channels.fetch(channelId);
                if (channel) { await channel.send(msg); sent++; }
            } catch(e) { sent++; }
            await sleep(300);
        }
        io.emit('spam', { total: idx, sent });
    }, parseInt(delay) || 3000);
    
    io.emit('command_result', { command: 'spam', result: `💬 Spamming ${msgList.length} messages` });
}

function stopSpam() {
    if (spamInterval) clearInterval(spamInterval);
    spamActive = false;
    io.emit('command_result', { command: 'stopspam', result: '⛔ Spam stopped' });
}

// ─── DOMINATION ───
async function startDomination(channelId) {
    if (dominationMode) return;
    dominationMode = true;
    
    for (const client of clients) {
        if (!client?.user) continue;
        try {
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
                connections.set(Date.now(), conn);
            }
        } catch(e) {}
        await sleep(1000);
    }
    
    dominationInterval = setInterval(() => {
        io.emit('domination', { active: true });
    }, 5000);
    
    io.emit('command_result', { command: 'dominate', result: `👑 Domination started` });
}

function stopDomination() {
    dominationMode = false;
    if (dominationInterval) clearInterval(dominationInterval);
    connections.forEach(c => { try { c.destroy(); } catch(e) {} });
    connections.clear();
    io.emit('command_result', { command: 'stopdom', result: '⛔ Domination stopped' });
}

// ─── PLAY AUDIO ───
async function playAudio(url) {
    if (connections.size === 0) {
        io.emit('command_result', { command: 'play', result: '❌ Join VC first!' });
        return;
    }
    
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        try {
            const result = await youtubedl(url, { 
                dumpSingleJson: true, 
                noPlaylist: true, 
                format: "bestaudio[ext=webm]/bestaudio/best" 
            });
            currentUrl = result.url;
            currentTitle = result.title || "YouTube Audio";
            startFFmpegStream(currentUrl);
        } catch(e) {
            console.log('[PLAY] Error:', e.message);
        }
    } else {
        currentUrl = url;
        currentTitle = "Direct Audio";
        startFFmpegStream(url);
    }
    io.emit('command_result', { command: 'play', result: `▶️ Playing: ${currentTitle}` });
}

function startFFmpegStream(input) {
    stopFFmpeg();
    
    let filters = [];
    if (bassBoost) filters.push("equalizer=f=60:width_type=h:width=50:g=15");
    if (blastMode) filters.push("volume=50", "dynaudnorm=p=0.9:m=50.0:g=15");
    if (volume > 1.0) filters.push(`volume=${volume}`);
    
    const filterStr = filters.length ? filters.join(',') : 'highpass=f=60';
    
    currentFFmpegProcess = spawn("ffmpeg", [
        "-reconnect", "1", "-reconnect_streamed", "1",
        "-i", input,
        "-filter:a", filterStr,
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
                resource.volume.setVolume(volume || 1.0);
                activeResources.set(index, resource);
                player.play(resource);
            } catch(e) {}
        }
    });
}

function stopFFmpeg() {
    if (currentFFmpegProcess) {
        try { currentFFmpegProcess.kill("SIGKILL"); } catch(e) {}
        currentFFmpegProcess = null;
    }
}

// ─── START SERVER ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║              👑 RINTU SUITE v7.0 👑                        ║
║           🔥 DEPLOYED SUCCESSFULLY                         ║
╠══════════════════════════════════════════════════════════════╣
║  📦 Tokens: ${tokens.length}                                ║
║  ✅ Enabled: ${getEnabledTokens().length}                  ║
║  🔑 Keys: ${keys.length}                                   ║
║  🌐 http://localhost:${PORT}                                ║
║  🔑 Admin: ${process.env.ADMIN_PASS || 'RINTU_2026'}       ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

// ─── CLEANUP ───
process.on('SIGINT', async () => {
    console.log('[SHUTDOWN] Cleaning up...');
    await stopBots();
    process.exit();
});
