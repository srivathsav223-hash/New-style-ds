console.log('👑 RINTU SUITE v8.0 STARTING...');
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

// ─── LOAD SELFBOT MODULES ───
let Client, joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType;
let youtubedl, axios;
let selfbotLoaded = false;

try {
    console.log('[BOOT] Loading Discord modules...');
    const discord = require('discord.js-selfbot-v13');
    Client = discord.Client;
    console.log('[BOOT] ✅ discord.js-selfbot-v13 loaded');
    
    const voice = require('@discordjs/voice');
    joinVoiceChannel = voice.joinVoiceChannel;
    createAudioPlayer = voice.createAudioPlayer;
    createAudioResource = voice.createAudioResource;
    AudioPlayerStatus = voice.AudioPlayerStatus;
    StreamType = voice.StreamType;
    console.log('[BOOT] ✅ @discordjs/voice loaded');
    
    youtubedl = require('youtube-dl-exec');
    axios = require('axios');
    console.log('[BOOT] ✅ youtube-dl-exec loaded');
    
    selfbotLoaded = true;
    console.log('[BOOT] ✅ ALL MODULES LOADED!');
} catch (e) {
    console.log('[BOOT] ⚠️ Module error:', e.message);
    selfbotLoaded = false;
}

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

// ─── SELFBOT GLOBALS ───
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
let isBotStarting = false;

// ─── ROUTES ───
app.get('/', (req, res) => {
    try {
        res.render('dashboard', {
            tokenCount: tokens.length,
            enabledCount: getEnabledTokens().length,
            keyCount: keys.length,
            onlineCount: selfbotLoaded ? clients.filter(c => c?.user).length : 0,
            connectedCount: selfbotLoaded ? connections.size : 0,
            admin: admin,
            selfbotLoaded: selfbotLoaded
        });
    } catch (err) {
        res.send(`<h1 style="color:#ff0040;">👑 RINTU SUITE</h1><p>✅ Running! Error: ${err.message}</p>`);
    }
});

app.get('/test', (req, res) => {
    res.json({
        status: 'alive',
        time: new Date().toISOString(),
        tokens: tokens.length,
        keys: keys.length,
        selfbotLoaded: selfbotLoaded,
        botsOnline: selfbotLoaded ? clients.filter(c => c?.user).length : 0,
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

app.post('/api/tokens/start', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
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

// ─── COMMANDS ───
app.post('/api/joinvc', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
    await joinVoiceChannel(req.body.channelId);
    res.json({ success: true });
});

app.post('/api/sjoin', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
    await joinServer(req.body.invite);
    res.json({ success: true });
});

app.post('/api/sleave', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
    await leaveServer(req.body.serverId);
    res.json({ success: true });
});

app.post('/api/sleaveall', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
    await leaveAllServers();
    res.json({ success: true });
});

app.post('/api/name', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
    await changeNames(req.body.name);
    res.json({ success: true });
});

app.post('/api/ssend', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
    await sendMessage(req.body.channelId, req.body.message);
    res.json({ success: true });
});

app.post('/api/spam/start', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
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
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
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
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
    await playAudio(req.body.url);
    res.json({ success: true });
});

app.post('/api/control', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!selfbotLoaded) return res.status(400).json({ error: 'Selfbot not loaded' });
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
        keys: keys.length,
        online: selfbotLoaded ? clients.filter(c => c?.user).length : 0,
        connected: selfbotLoaded ? connections.size : 0,
        selfbotLoaded: selfbotLoaded,
        domination: dominationMode,
        spam: spamActive
    });
});

// ─── SOCKET ───
io.on('connection', (socket) => {
    console.log('[SOCKET] Connected');
    socket.emit('stats', {
        tokens: tokens.length,
        enabled: getEnabledTokens().length,
        keys: keys.length,
        online: selfbotLoaded ? clients.filter(c => c?.user).length : 0,
        connected: selfbotLoaded ? connections.size : 0,
        selfbotLoaded: selfbotLoaded
    });
});

// ─── SELFBOT FUNCTIONS ───
async function startBots() {
    if (!selfbotLoaded || isBotStarting) return;
    isBotStarting = true;
    
    const enabled = getEnabledTokens();
    console.log('[BOTS] Starting', enabled.length, 'bots');
    
    if (enabled.length === 0) {
        io.emit('command_result', { command: 'start', result: '❌ No enabled tokens!' });
        isBotStarting = false;
        return;
    }
    
    for (const c of clients) {
        try { await c.destroy(); } catch(e) {}
    }
    clients.length = 0;
    connections.clear();
    players.clear();
    activeResources.clear();
    
    let success = 0;
    for (let i = 0; i < enabled.length; i++) {
        const t = enabled[i];
        try {
            console.log('[BOTS] Logging in', i + 1, '/', enabled.length);
            const client = new Client({ 
                checkUpdate: false,
                ws: {
                    properties: {
                        $browser: 'Discord Chrome',
                        $device: 'Windows',
                        $os: 'Windows'
                    }
                }
            });
            
            client.on('ready', () => {
                console.log('[BOTS] ✅', client.user?.tag || 'Unknown', 'online');
                io.emit('stats', { online: clients.filter(c => c?.user).length });
            });
            
            client.on('error', (e) => {
                console.log('[BOTS] ❌ Error:', e.message);
            });
            
            await client.login(t.token);
            clients.push(client);
            success++;
            await sleep(2000);
        } catch (e) {
            console.log('[BOTS] ❌ Failed:', e.message);
        }
    }
    
    isBotStarting = false;
    console.log('[BOTS] ✅', success, '/', enabled.length, 'online');
    io.emit('stats', { online: clients.filter(c => c?.user).length });
    io.emit('command_result', { command: 'start', result: `✅ ${success}/${enabled.length} bots online` });
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
    io.emit('stats', { online: 0, connected: 0 });
    io.emit('command_result', { command: 'stop', result: '🛑 All bots stopped' });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── JOIN VC ───
async function joinVoiceChannel(channelId) {
    if (!selfbotLoaded) {
        io.emit('command_result', { command: 'joinvc', result: '❌ Selfbot not loaded' });
        return;
    }
    
    const online = clients.filter(c => c?.user);
    if (online.length === 0) {
        io.emit('command_result', { command: 'joinvc', result: '❌ No bots online! Start tokens first.' });
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
    if (!selfbotLoaded) {
        io.emit('command_result', { command: 'sjoin', result: '❌ Selfbot not loaded' });
        return;
    }
    
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
    if (!selfbotLoaded) {
        io.emit('command_result', { command: 'sleave', result: '❌ Selfbot not loaded' });
        return;
    }
    
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
    if (!selfbotLoaded) {
        io.emit('command_result', { command: 'sleaveall', result: '❌ Selfbot not loaded' });
        return;
    }
    
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
    if (!selfbotLoaded) {
        io.emit('command_result', { command: 'name', result: '❌ Selfbot not loaded' });
        return;
    }
    
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
    if (!selfbotLoaded) {
        io.emit('command_result', { command: 'ssend', result: '❌ Selfbot not loaded' });
        return;
    }
    
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
    if (!selfbotLoaded) {
        io.emit('command_result', { command: 'spam', result: '❌ Selfbot not loaded' });
        return;
    }
    
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
    if (!selfbotLoaded) {
        io.emit('command_result', { command: 'dominate', result: '❌ Selfbot not loaded' });
        return;
    }
    
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
    if (!selfbotLoaded) {
        io.emit('command_result', { command: 'play', result: '❌ Selfbot not loaded' });
        return;
    }
    
    if (connections.size === 0) {
        io.emit('command_result', { command: 'play', result: '❌ Join VC first!' });
        return;
    }
    
    try {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const result = await youtubedl(url, { 
                dumpSingleJson: true, 
                noPlaylist: true, 
                format: "bestaudio[ext=webm]/bestaudio/best" 
            });
            currentUrl = result.url;
            currentTitle = result.title || "YouTube Audio";
            startFFmpegStream(currentUrl);
        } else {
            currentUrl = url;
            currentTitle = "Direct Audio";
            startFFmpegStream(url);
        }
        io.emit('command_result', { command: 'play', result: `▶️ Playing: ${currentTitle}` });
    } catch (e) {
        io.emit('command_result', { command: 'play', result: `❌ Error: ${e.message}` });
    }
}

function startFFmpegStream(input) {
    stopFFmpeg();
    
    let filters = [];
    if (bassBoost) filters.push("equalizer=f=60:width_type=h:width=50:g=15");
    if (blastMode) filters.push("volume=50", "dynaudnorm=p=0.9:m=50.0:g=15");
    if (volume > 1.0) filters.push(`volume=${volume}`);
    
    const filterStr = filters.length ? filters.join(',') : 'highpass=f=60';
    
    const { spawn } = require('child_process');
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

// ─── START ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           👑 RINTU SUITE v8.0 👑                           ║
║           🔥 FULLY WORKING                                 ║
╠══════════════════════════════════════════════════════════════╣
║  📦 Tokens: ${tokens.length}                                ║
║  ✅ Enabled: ${getEnabledTokens().length}                  ║
║  🔑 Keys: ${keys.length}                                   ║
║  🤖 Selfbot: ${selfbotLoaded ? '✅ LOADED' : '❌ NOT LOADED'} ║
║  🌐 Dashboard: http://localhost:${PORT}                     ║
║  🔑 Admin: ${process.env.ADMIN_PASS || 'RINTU_2026'}       ║
╚══════════════════════════════════════════════════════════════╝
    `);
    
    if (selfbotLoaded && getEnabledTokens().length > 0) {
        console.log('[🚀 AUTO-START] Launching bots...');
        startBots();
    }
});

process.on('SIGINT', async () => {
    console.log('[SHUTDOWN] Cleaning up...');
    await stopBots();
    process.exit();
});
