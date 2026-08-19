/**
 * SamForm 100% Free WhatsApp Gateway Microservice (Option B)
 * Built with @whiskeysockets/baileys (Open-Source WhatsApp Web Multi-Device Protocol)
 * 
 * Supports both:
 * 1. Visual Web UI Pairing with QR Code & 8-Digit Pairing Code
 * 2. Terminal QR Code Pairing
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
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

let sock;
let isConnected = false;
let currentQR = '';
let currentQRDataUrl = '';

async function startWhatsAppBot() {
  const authFolder = path.join(__dirname, 'auth_info_baileys');
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`Using Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    // Modern official macOS Chrome signature (prevents WhatsApp Web 428 link failures)
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
      } catch (err) {
        console.error('Error generating QR image:', err);
      }

      console.log('\n=============================================');
      console.log('⚡ SCAN QR CODE BELOW WITH WHATSAPP:');
      qrcode.generate(qr, { small: true });
      console.log(`Or open your browser at: http://localhost:${PORT}/pair`);
      console.log('=============================================\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      
      console.log(`⚠️ Connection closed (statusCode: ${statusCode}). Reconnecting: ${!isLoggedOut}`);
      isConnected = false;
      currentQR = '';
      currentQRDataUrl = '';

      if (isLoggedOut) {
        console.log('Device logged out. Clearing old credentials...');
        try {
          fs.rmSync(authFolder, { recursive: true, force: true });
        } catch (e) {}
      }

      setTimeout(() => startWhatsAppBot(), 3000);
    } else if (connection === 'open') {
      console.log('\n✅✅✅ SamForm WhatsApp Gateway is ONLINE & READY! ✅✅✅\n');
      isConnected = true;
      currentQR = '';
      currentQRDataUrl = '';
    }
  });
}

// 🌐 1. PAIRING & LINKING WEB UI
app.get('/pair', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Link WhatsApp Bot — SamForm</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
        .card { background: #1e293b; border: 1.5px solid #334155; border-radius: 16px; padding: 2rem; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        h1 { margin-top: 0; font-size: 1.4rem; color: #38bdf8; }
        .qr-box { background: #ffffff; padding: 1rem; border-radius: 12px; display: inline-block; margin: 1.25rem 0; }
        .qr-box img { display: block; max-width: 260px; height: auto; }
        .status-badge { display: inline-block; padding: 0.35rem 0.85rem; border-radius: 9999px; font-weight: 700; font-size: 0.85rem; margin-bottom: 1rem; }
        .status-online { background: #065f46; color: #34d399; }
        .status-waiting { background: #854d0e; color: #fde047; }
        .instructions { text-align: left; font-size: 0.85rem; color: #94a3b8; line-height: 1.5; background: #090d16; padding: 1rem; border-radius: 8px; margin-top: 1rem; }
        .instructions ol { margin: 0; padding-left: 1.25rem; }
        .btn-refresh { background: #3b82f6; color: #fff; border: none; padding: 0.6rem 1.2rem; border-radius: 8px; font-weight: 700; cursor: pointer; margin-top: 1rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⚡ SamForm WhatsApp Gateway</h1>
        
        ${isConnected ? `
          <div class="status-badge status-online">✓ BOT IS ONLINE & CONNECTED</div>
          <p style="color: #cbd5e1; font-size: 0.9rem;">Your WhatsApp account is linked and actively delivering test results to candidates.</p>
        ` : `
          <div class="status-badge status-waiting">⏳ WAITING FOR QR SCAN</div>
          
          ${currentQRDataUrl ? `
            <div class="qr-box">
              <img src="${currentQRDataUrl}" alt="WhatsApp QR Code" />
            </div>
          ` : `
            <p style="color: #94a3b8;">Generating fresh QR code, please wait a moment...</p>
          `}

          <div class="instructions">
            <strong>How to Link with WhatsApp:</strong>
            <ol>
              <li>Open WhatsApp on your phone</li>
              <li>Tap <strong>Settings</strong> (or 3 dots) → <strong>Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong></li>
              <li>Point your camera at this QR code</li>
            </ol>
          </div>

          <button class="btn-refresh" onclick="window.location.reload()">Refresh QR Code</button>
        `}
      </div>
      <script>
        // Auto-refresh every 12 seconds until connected
        ${!isConnected ? 'setTimeout(() => window.location.reload(), 12000);' : ''}
      </script>
    </body>
    </html>
  `);
});

// 2. HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    whatsappConnected: isConnected,
    hasQRWaiting: !!currentQR,
    timestamp: new Date().toISOString()
  });
});

// 3. SEND MESSAGE ENDPOINT
app.post('/send-message', async (req, res) => {
  if (API_SECRET) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${API_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API_SECRET' });
    }
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Missing phone or message body' });
  }

  if (!isConnected) {
    return res.status(503).json({ error: 'WhatsApp bot is not connected yet. Visit /pair to scan QR code.' });
  }

  // Format JID (e.g. 2348012345678@s.whatsapp.net)
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;

  try {
    const sent = await sock.sendMessage(jid, { text: message });
    console.log(`✓ Result successfully sent to WhatsApp: +${cleanPhone}`);
    return res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    console.error('Error sending WhatsApp message:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 SamForm WhatsApp Gateway running on port ${PORT}`);
  console.log(`👉 Open http://localhost:${PORT}/pair in your browser to scan the QR code visually\n`);
  startWhatsAppBot();
});
