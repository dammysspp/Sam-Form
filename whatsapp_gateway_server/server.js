/**
 * SamForm 100% Free Unified WhatsApp, Telegram & Email Gateway Microservice
 * 
 * 1. WhatsApp Web Gateway: Multi-device Baileys protocol with Supabase Cloud Session Persistence (Permanent 1-time scan!)
 * 2. Telegram MTProto Userbot Gateway: Send messages directly from your personal Telegram account to ANY phone number or username
 * 3. Server-side Email Proxy: Dispatches emails via EmailJS without client browser adblock/CORS network blocks
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
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
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// --- SUPABASE CLOUD SESSION PERSISTENCE ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aakrjnpprxhmaxeqhnsk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3JqbnBwcnhobWF4ZXFobnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjg2NTAsImV4cCI6MjEwMjY0NDY1MH0.rdxVDv1luq2MLfymGMPtPXBSRyWK5ZxAelkPjEctEAU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authFolder = path.join(__dirname, 'auth_info_baileys');

// Restore session from Supabase on startup
async function restoreWhatsAppSessionFromCloud() {
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'wa_gateway_auth_session').single();
    if (data && data.value && typeof data.value === 'object') {
      if (!fs.existsSync(authFolder)) fs.mkdirSync(authFolder, { recursive: true });
      for (const [filename, content] of Object.entries(data.value)) {
        fs.writeFileSync(path.join(authFolder, filename), content);
      }
      console.log('⚡ Restored permanent WhatsApp session from Supabase cloud!');
    }
  } catch (e) {
    console.warn('Session cloud restore notice:', e.message);
  }
}

// Backup session to Supabase
async function backupWhatsAppSessionToCloud() {
  try {
    if (!fs.existsSync(authFolder)) return;
    const files = fs.readdirSync(authFolder);
    const sessionDump = {};
    for (const file of files) {
      sessionDump[file] = fs.readFileSync(path.join(authFolder, file), 'utf8');
    }
    await supabase.from('app_settings').upsert({
      key: 'wa_gateway_auth_session',
      value: sessionDump,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
    console.log('✓ WhatsApp credentials successfully backed up to Supabase Cloud!');
  } catch (e) {
    console.warn('Session cloud backup notice:', e.message);
  }
}

const ADMIN_TELEGRAM_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID || '8321199114'; // @justscp
const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8621386918:AAGxfUc5JVFlyivo_iBmJeC7ZLoxWD-m9V0';

async function sendAdminTelegramAlert(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'HTML'
      })
    });
  } catch (e) {
    console.warn('Admin Telegram notification error:', e.message);
  }
}

let hasAlertedDisconnect = false;

// --- 1. WHATSAPP GATEWAY CLIENT ---
let sock;
let isWhatsAppConnected = false;
let currentQR = '';
let currentQRDataUrl = '';

async function startWhatsAppBot() {
  await restoreWhatsAppSessionFromCloud();

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

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await backupWhatsAppSessionToCloud();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      try {
        currentQRDataUrl = await QRCodeImage.toDataURL(qr, { margin: 2, scale: 8 });
      } catch (err) {}

      console.log('\n⚡ SCAN WHATSAPP QR CODE at http://localhost:' + PORT + '/pair');

      if (!hasAlertedDisconnect) {
        hasAlertedDisconnect = true;
        sendAdminTelegramAlert(
          `⚠️ <b>SamForm WhatsApp Alert</b>\n\n` +
          `Your WhatsApp Gateway on Render requires linking.\n` +
          `👉 Link now: https://sam-form.onrender.com/pair`
        );
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`[WhatsApp] Connection closed. Status code: ${statusCode}, isLoggedOut: ${isLoggedOut}, shouldReconnect: ${shouldReconnect}`);

      isWhatsAppConnected = false;
      currentQR = '';
      currentQRDataUrl = '';

      if (!hasAlertedDisconnect) {
        hasAlertedDisconnect = true;
        sendAdminTelegramAlert(
          `🚨 <b>SamForm WhatsApp Disconnected</b>\n\n` +
          `Status: Disconnected (Code ${statusCode || 'Unknown'})\n` +
          `${isLoggedOut ? '⚠️ Session was logged out. Please scan fresh QR.' : '🔄 Reconnecting automatically...'}\n` +
          `👉 Check status: https://sam-form.onrender.com/pair`
        );
      }

      if (isLoggedOut) {
        try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (e) {}
        await supabase.from('app_settings').delete().eq('key', 'wa_gateway_auth_session');
      }

      setTimeout(() => startWhatsAppBot(), 3000);
    } else if (connection === 'open') {
      console.log('\n✅ WhatsApp Gateway is ONLINE & PERMANENTLY CONNECTED!');
      isWhatsAppConnected = true;
      currentQR = '';
      currentQRDataUrl = '';
      hasAlertedDisconnect = false;
      await backupWhatsAppSessionToCloud();

      sendAdminTelegramAlert(
        `✅ <b>SamForm WhatsApp Connected!</b>\n\n` +
        `WhatsApp Gateway is actively connected and ready to send score reports automatically.`
      );
    }
  });
}

// --- 2. TELEGRAM USERBOT CLIENT (MTProto Direct Account) ---
let tgClient = null;
let isTelegramUserConnected = false;

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

// 🌐 1. PAIRING & LINKING WEB UI (With Real-Time Status & Pairing Code Alternative)
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
        .card { background: #1e293b; border: 1.5px solid #334155; border-radius: 16px; padding: 2rem; max-width: 520px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        h1 { margin-top: 0; font-size: 1.35rem; color: #38bdf8; text-align: center; }
        .service-box { background: #090d16; border: 1px solid #334155; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; }
        .qr-box { background: #ffffff; padding: 0.75rem; border-radius: 8px; display: inline-block; margin: 0.75rem 0; }
        .qr-box img { display: block; max-width: 220px; height: auto; margin: 0 auto; }
        .status-badge { display: inline-block; padding: 0.35rem 0.85rem; border-radius: 9999px; font-weight: 700; font-size: 0.82rem; margin-bottom: 0.5rem; }
        .status-online { background: #065f46; color: #34d399; }
        .status-waiting { background: #854d0e; color: #fde047; }
        input { width: 100%; padding: 0.65rem; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #fff; margin-bottom: 0.5rem; box-sizing: border-box; }
        button { width: 100%; background: #3b82f6; color: #fff; border: none; padding: 0.65rem; border-radius: 6px; font-weight: 700; cursor: pointer; }
      </style>
      <script>
        // Real-time polling to reload once connected so QR disappears automatically
        setInterval(async () => {
          try {
            const res = await fetch('/health');
            const data = await res.json();
            if (data.whatsappConnected && document.querySelector('.status-waiting')) {
              window.location.reload();
            }
          } catch(e) {}
        }, 3000);
      </script>
    </head>
    <body>
      <div class="card">
        <h1>⚡ SamForm Unified Gateways</h1>
        
        <!-- WhatsApp Section -->
        <div class="service-box" style="text-align: center;">
          <h3 style="margin: 0 0 0.5rem 0; color: #25D366;">WhatsApp Gateway</h3>
          ${isWhatsAppConnected ? `
            <div class="status-badge status-online">✓ WHATSAPP ONLINE & PERMANENTLY SYNCED</div>
            <p style="font-size: 0.84rem; color: #94a3b8; margin: 0.25rem 0 0 0;">Linked to Supabase Cloud. You never need to scan again!</p>
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

// 5. SERVER-SIDE EMAILJS PROXY ENDPOINT (Bypasses Browser CORS / Adblockers)
app.post('/send-email', async (req, res) => {
  const { serviceId, templateId, publicKey, templateParams } = req.body;
  if (!serviceId || !templateId || !publicKey || !templateParams) {
    return res.status(400).json({ error: 'Missing email parameters' });
  }

  try {
    const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: templateParams
      })
    });

    if (emailRes.ok) {
      console.log(`✓ Email sent successfully via EmailJS Proxy to ${templateParams.to_email}`);
      return res.json({ success: true });
    } else {
      const errText = await emailRes.text();
      return res.status(emailRes.status).json({ error: errText });
    }
  } catch (err) {
    console.error('Server email proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 SamForm Gateway running on port ${PORT}`);
  startWhatsAppBot();
});
