/**
 * SamForm 100% Free Unified WhatsApp & Telegram Gateway Microservice
 * 
 * 1. WhatsApp Web Gateway: Multi-device Baileys protocol (Scan QR once to link)
 * 2. Telegram MTProto Userbot Gateway: Send messages directly from your personal Telegram account to ANY phone number or username without /start requirement!
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCodeImage = require('qrcode');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || '';

// --- 1. WHATSAPP GATEWAY CLIENT ---
let sock;
let isWhatsAppConnected = false;
let currentQR = '';
let currentQRDataUrl = '';

async function startWhatsAppBot() {
  const authFolder = path.join(__dirname, 'auth_info_baileys');
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      try {
        currentQRDataUrl = await QRCodeImage.toDataURL(qr, { margin: 2, scale: 8 });
      } catch (err) {}

      console.log('\n⚡ SCAN WHATSAPP QR CODE at http://localhost:' + PORT + '/pair');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      isWhatsAppConnected = false;
      currentQR = '';
      currentQRDataUrl = '';

      if (isLoggedOut) {
        try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (e) {}
      }

      setTimeout(() => startWhatsAppBot(), 3000);
    } else if (connection === 'open') {
      console.log('\n✅ WhatsApp Gateway is ONLINE & CONNECTED!');
      isWhatsAppConnected = true;
      currentQR = '';
      currentQRDataUrl = '';
    }
  });
}

// --- 2. TELEGRAM USERBOT CLIENT (MTProto Direct Account) ---
let tgClient = null;
let isTelegramUserConnected = false;
let tgPhoneCodeHash = null;
let tgPendingPhone = null;

const tgSessionFile = path.join(__dirname, 'tg_session.txt');
let tgSavedSession = '';
try {
  if (fs.existsSync(tgSessionFile)) {
    tgSavedSession = fs.readFileSync(tgSessionFile, 'utf8').trim();
  }
} catch (e) {}

async function initTelegramUserbot(apiId, apiHash) {
  if (!apiId || !apiHash) return;
  try {
    const stringSession = new StringSession(tgSavedSession);
    tgClient = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
      connectionRetries: 5
    });

    await tgClient.connect();
    if (await tgClient.checkAuthorization()) {
      isTelegramUserConnected = true;
      console.log('✅ Telegram Personal Account Gateway is ONLINE & CONNECTED!');
    }
  } catch (err) {
    console.error('Error initializing Telegram Userbot:', err.message);
  }
}

// 🌐 1. PAIRING & LINKING WEB UI
app.get('/', (req, res) => res.redirect('/pair'));

app.get('/pair', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Link Gateways — SamForm</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
        .card { background: #1e293b; border: 1.5px solid #334155; border-radius: 16px; padding: 2rem; max-width: 500px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        h1 { margin-top: 0; font-size: 1.4rem; color: #38bdf8; text-align: center; }
        .service-box { background: #090d16; border: 1px solid #334155; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; }
        .qr-box { background: #ffffff; padding: 0.75rem; border-radius: 8px; display: inline-block; margin: 0.75rem 0; }
        .qr-box img { display: block; max-width: 220px; height: auto; margin: 0 auto; }
        .status-badge { display: inline-block; padding: 0.3rem 0.75rem; border-radius: 9999px; font-weight: 700; font-size: 0.8rem; margin-bottom: 0.5rem; }
        .status-online { background: #065f46; color: #34d399; }
        .status-waiting { background: #854d0e; color: #fde047; }
        input { width: 100%; padding: 0.6rem; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #fff; margin-bottom: 0.5rem; box-sizing: border-box; }
        button { width: 100%; background: #3b82f6; color: #fff; border: none; padding: 0.65rem; border-radius: 6px; font-weight: 700; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⚡ SamForm Unified Gateways</h1>
        
        <!-- WhatsApp Section -->
        <div class="service-box" style="text-align: center;">
          <h3 style="margin: 0 0 0.5rem 0; color: #25D366;">WhatsApp Gateway</h3>
          ${isWhatsAppConnected ? `
            <div class="status-badge status-online">✓ WHATSAPP ONLINE & CONNECTED</div>
            <p style="font-size: 0.82rem; color: #94a3b8;">Linked and actively sending results.</p>
          ` : `
            <div class="status-badge status-waiting">⏳ WAITING FOR QR SCAN</div>
            ${currentQRDataUrl ? `
              <div class="qr-box">
                <img src="${currentQRDataUrl}" alt="WhatsApp QR Code" />
              </div>
            ` : `<p style="font-size: 0.82rem; color: #94a3b8;">Generating fresh QR code...</p>`}
            <p style="font-size: 0.8rem; color: #cbd5e1; margin: 0;">Scan with WhatsApp → Linked Devices</p>
          `}
        </div>

        <!-- Telegram Userbot Section -->
        <div class="service-box">
          <h3 style="margin: 0 0 0.5rem 0; color: #229ED9; text-align: center;">Telegram Personal Account</h3>
          ${isTelegramUserConnected ? `
            <div style="text-align: center;">
              <div class="status-badge status-online">✓ TELEGRAM ACCOUNT CONNECTED</div>
              <p style="font-size: 0.82rem; color: #94a3b8; margin: 0;">Can message ANY phone number directly without /start!</p>
            </div>
          ` : `
            <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.75rem;">Login with your phone number to authorize direct DM sending to candidates.</p>
            <form action="/auth/telegram-send-code" method="POST">
              <input type="text" name="phone" placeholder="Phone Number (e.g. +234...)" required />
              <button type="submit">Send Login Code to Telegram</button>
            </form>
          `}
        </div>
      </div>
    </body>
    </html>
  `);
});

// 2. HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    whatsappConnected: isWhatsAppConnected,
    telegramUserConnected: isTelegramUserConnected,
    hasQRWaiting: !!currentQR,
    timestamp: new Date().toISOString()
  });
});

// 3. WHATSAPP DISPATCH ENDPOINT
app.post('/send-message', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'Missing phone or message' });

  if (!isWhatsAppConnected) {
    return res.status(503).json({ error: 'WhatsApp bot is not connected yet. Visit /pair to scan QR code.' });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;

  try {
    const sent = await sock.sendMessage(jid, { text: message });
    console.log(`✓ Result sent to WhatsApp: +${cleanPhone}`);
    return res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    console.error('Error sending WhatsApp message:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. TELEGRAM USERBOT DIRECT DISPATCH ENDPOINT (NO /start NEEDED)
app.post('/send-telegram-user', async (req, res) => {
  const { phoneOrUsername, message, apiId, apiHash } = req.body;
  if (!phoneOrUsername || !message) return res.status(400).json({ error: 'Missing recipient or message' });

  if (!tgClient && apiId && apiHash) {
    await initTelegramUserbot(apiId, apiHash);
  }

  if (!tgClient || !isTelegramUserConnected) {
    return res.status(503).json({ error: 'Telegram Userbot not connected. Visit /pair to login.' });
  }

  try {
    const target = phoneOrUsername.trim().replace(/^@/, '');
    await tgClient.sendMessage(target, { message });
    console.log(`✓ Result sent via Telegram Userbot directly to: ${target}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error sending Telegram user message:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 SamForm Gateway running on port ${PORT}`);
  startWhatsAppBot();
});
