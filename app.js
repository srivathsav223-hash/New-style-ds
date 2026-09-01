console.log('🚂 RINTU SELFBOT - RAILWAY DEPLOYMENT');
console.log('👑 EVIL MODE ACTIVATED');
console.log('🔥 NODE VERSION:', process.version);

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ─── ANTI-DETECTION ───
try {
    const ClientUserSettingManager = require("./node_modules/discord.js-selfbot-v13/src/managers/ClientUserSettingManager.js");
    if (ClientUserSettingManager?.prototype) {
        ClientUserSettingManager.prototype._patch = function(data) { return this; };
        console.log('[🛡️] Anti-detection patched');
    }
} catch (e) {
    console.log('[🛡️] Anti-detection skipped');
}

// ─── IMPORTS ───
const { Client } = require("discord.js-selfbot-v13");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require("@discordjs/voice");
const { spawn } = require("child_process");
const youtubedl = require("youtube-dl-exec");
const axios = require("axios");

console.log('[✅] All modules loaded');

// ─── STORAGE ───
const TOKEN_FILE = path.join(__dirname, 'tokens.json');
const KEYS_FILE = path.join(__dirname, 'keys.json');

let tokens = [];
let keys = [];
let logs = [];

function loadTokens() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            console.log('[📦] Loaded', tokens.length, 'tokens');
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
            console.log('[🔑] Loaded', keys.length, 'keys');
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

// ─── SELFBOT FUNCTIONS ───
async function stealthLogin(token, index) {
    try {
        console.log(`[🤖] Logging in bot ${index + 1}...`);
        
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
            console.log(`[✅] ${client.user?.tag || 'Unknown'} online`);
            io.emit('stats', { online: clients.filter(c => c?.user).length });
            addLog(`✅ ${client.user?.tag || 'Unknown'} online`);
        });

        client.on('error', (e) => {
            console.log(`[❌] Error: ${e.message}`);
        });

        await client.login(token);
        clients.push(client);
        return client;
    } catch (err) {
        console.log(`[❌] Login failed: ${err.message}`);
        return null;
    }
}

async function startBots() {
    if (isBotStarting) return;
    isBotStarting = true;

    const enabled = getEnabledTokens();
    console.log('[🚀] Starting', enabled.length, 'bots');

    if (enabled.length === 0) {
        addLog('❌ No enabled tokens!');
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
        const client = await stealthLogin(t.token, i);
        if (client) success++;
        await sleep(2000);
    }

    isBotStarting = false;
    console.log('[🚀] ✅', success, '/', enabled.length, 'online');
    addLog(`✅ ${success}/${enabled.length} bots online`);
    io.emit('stats', { online: clients.filter(c => c?.user).length });
}

async function stopBots() {
    console.log('[🛑] Stopping all bots...');
    for (const c of clients) {
        try { await c.destroy(); } catch(e) {}
    }
    clients.length = 0;
    connections.clear();
    players.clear();
    activeResources.clear();
    addLog('🛑 All bots stopped');
    io.emit('stats', { online: 0 });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── VC FUNCTIONS ───
async function joinVoiceChannel(channelId) {
    const online = clients.filter(c => c?.user);
    if (online.length === 0) {
        addLog('❌ No bots online!');
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
    addLog(`✅ ${connected}/${online.length} joined VC`);
    io.emit('stats', { connected: connections.size });
}

async function joinServer(inviteInput) {
    const online = clients.filter(c => c?.user);
    if (online.length === 0) {
        addLog('❌ No bots online!');
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
    addLog(`✅ ${joined}/${online.length} joined server`);
}

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
    addLog(`✅ ${left}/${clients.length} left server`);
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
    addLog(`✅ Left ${total} servers`);
}

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
    addLog(`✅ ${changed}/${clients.length} changed to ${name}`);
}

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
    addLog(`✅ ${sent}/${clients.length} sent`);
}

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

    addLog(`💬 Spamming ${msgList.length} messages`);
}

function stopSpam() {
    if (spamInterval) clearInterval(spamInterval);
    spamActive = false;
    addLog('⛔ Spam stopped');
}

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

    addLog('👑 Domination started');
}

function stopDomination() {
    dominationMode = false;
    if (dominationInterval) clearInterval(dominationInterval);
    connections.forEach(c => { try { c.destroy(); } catch(e) {} });
    connections.clear();
    addLog('⛔ Domination stopped');
}

async function playAudio(url) {
    if (connections.size === 0) {
        addLog('❌ Join VC first!');
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
        addLog(`▶️ Playing: ${currentTitle}`);
    } catch (e) {
        addLog(`❌ Play error: ${e.message}`);
    }
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

function controlAudio(action) {
    if (action === 'pause') players.forEach(p => p.pause());
    if (action === 'resume') players.forEach(p => p.unpause());
    if (action === 'stop') { stopFFmpeg(); players.forEach(p => p.stop()); activeResources.clear(); }
    if (action === 'loop') loopMode = !loopMode;
    if (action === 'bassboost') { bassBoost = !bassBoost; if (currentUrl) playAudio(currentUrl); }
    if (action === 'blast') { blastMode = !blastMode; if (currentUrl) playAudio(currentUrl); }
    if (action === 'leave') { stopFFmpeg(); players.clear(); connections.forEach(c => { try { c.destroy(); } catch(e){} }); connections.clear(); activeResources.clear(); currentUrl = null; }
    addLog(`🎵 ${action}`);
}

function setVolume(val) {
    volume = parseInt(val) / 100;
    activeResources.forEach(r => { if (r?.volume) r.volume.setVolume(volume); });
    addLog(`🔊 Volume ${val}%`);
}

function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    logs.unshift({ time, message: msg });
    if (logs.length > 100) logs.pop();
    io.emit('log', { time, message: msg });
    console.log(`[LOG] ${msg}`);
}

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
            onlineCount: clients.filter(c => c?.user).length,
            connectedCount: connections.size,
            admin: admin,
            logs: logs.slice(0, 20)
        });
    } catch (err) {
        res.send(`<h1 style="color:#ff0040;">👑 RINTU</h1><p>✅ Running! Error: ${err.message}</p>`);
    }
});

app.get('/ping', (req, res) => {
    res.json({ status: 'alive', time: new Date().toISOString() });
});

app.get('/test', (req, res) => {
    res.json({
        status: 'alive',
        tokens: tokens.length,
        keys: keys.length,
        online: clients.filter(c => c?.user).length,
        connected: connections.size,
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
        addLog(`📁 Token added: ${owner || 'default'}`);
        res.json({ success: true, token: result });
    } else {
        res.status(400).json({ error: 'Invalid token' });
    }
});

app.post('/api/tokens/delete', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    deleteToken(req.body.id);
    addLog('🗑️ Token deleted');
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
        if (t && t.length > 10) { addToken(t, owner || 'bulk'); added++; }
    });
    addLog(`📦 Bulk added ${added} tokens`);
    res.json({ success: true, added, total: tokenList.length });
});

// ─── KEYAUTH API ───
app.post('/api/keys/create', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const { owner, days } = req.body;
    const result = generateKey(owner, days);
    addLog(`🔑 Key generated for ${owner}`);
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

// ─── COMMAND API ───
app.post('/api/command', async (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const { type, params } = req.body;
    addLog(`⚡ Executing: ${type}`);

    try {
        switch(type) {
            case 'joinvc': await joinVoiceChannel(params.channelId); break;
            case 'sjoin': await joinServer(params.invite); break;
            case 'sleave': await leaveServer(params.serverId); break;
            case 'sleaveall': await leaveAllServers(); break;
            case 'name': await changeNames(params.name); break;
            case 'ssend': await sendMessage(params.channelId, params.message); break;
            case 'spam': await startSpam(params.channelId, params.messages, params.delay); break;
            case 'stopspam': stopSpam(); break;
            case 'dominate': await startDomination(params.channelId); break;
            case 'stopdom': stopDomination(); break;
            case 'play': await playAudio(params.url); break;
            case 'pause': controlAudio('pause'); break;
            case 'resume': controlAudio('resume'); break;
            case 'stop': controlAudio('stop'); break;
            case 'loop': controlAudio('loop'); break;
            case 'bassboost': controlAudio('bassboost'); break;
            case 'blast': controlAudio('blast'); break;
            case 'leave': controlAudio('leave'); break;
            case 'volume': setVolume(params.volume); break;
            default: addLog(`❌ Unknown command: ${type}`);
        }
        res.json({ success: true });
    } catch (e) {
        addLog(`❌ Command failed: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats', (req, res) => {
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    res.json({
        tokens: tokens.length,
        enabled: getEnabledTokens().length,
        keys: keys.length,
        online: clients.filter(c => c?.user).length,
        connected: connections.size,
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
        online: clients.filter(c => c?.user).length,
        connected: connections.size
    });
    socket.emit('logs', logs.slice(0, 20));
});

// ─── START SERVER ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║        🚂 RINTU SELFBOT - RAILWAY 🚂                       ║
║           👑 EVIL MODE ACTIVATED                           ║
║           🔥 FULLY WORKING                                 ║
╠══════════════════════════════════════════════════════════════╣
║  📦 Tokens: ${tokens.length}                                ║
║  ✅ Enabled: ${getEnabledTokens().length}                  ║
║  🔑 Keys: ${keys.length}                                   ║
║  🤖 Online: ${clients.filter(c => c?.user).length}         ║
║  🔊 VC Connected: ${connections.size}                      ║
║  🌐 Dashboard: https://your-app.railway.app                ║
║  🔑 Admin: ${process.env.ADMIN_PASS || 'RINTU_2026'}       ║
║  📌 RAILWAY IS BETTER THAN RENDER                          ║
╚══════════════════════════════════════════════════════════════╝
    `);

    console.log('\n📋 ALL COMMANDS AVAILABLE:');
    console.log('  📁 Token Management: Add, Delete, Toggle, Bulk Add');
    console.log('  🔑 KeyAuth: Generate Keys, List Keys, Validate Keys');
    console.log('  🔊 VC: JOIN VC, PLAY Audio, Control Audio');
    console.log('  🔗 SJOIN: Join servers with all bots');
    console.log('  🚪 SLEAVE: Leave servers with all bots');
    console.log('  📛 NAME: Change all bot names');
    console.log('  📨 SSEND: Send messages from all bots');
    console.log('  💬 SPAM: Spam messages from all bots');
    console.log('  👑 DOMINATION: Dominate voice channels');
    console.log('\n🔥 RAILWAY DEPLOYMENT: WORKING');

    if (getEnabledTokens().length > 0) {
        console.log('[🚀 AUTO-START] Launching bots...');
        startBots();
    }
});

process.on('SIGINT', async () => {
    console.log('[SHUTDOWN] Cleaning up...');
    await stopBots();
    process.exit();
});
