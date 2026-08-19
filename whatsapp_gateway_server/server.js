/**
 * SamForm 100% Free WhatsApp Gateway Microservice (Option B)
 * Built with @whiskeysockets/baileys (Open-Source WhatsApp Web Multi-Device Protocol)
 * 
 * Deployment:
 * Deploy to Render.com, Railway.app, or Koyeb (Free tier) with Node.js 18+.
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'samform_secret_key';

let sock;
let isConnected = false;

async function startWhatsAppBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['SamForm Automated Bot', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('⚡ Scan this QR Code with your WhatsApp app to link bot:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
      isConnected = false;
      if (shouldReconnect) {
        startWhatsAppBot();
      }
    } else if (connection === 'open') {
      console.log('✅ SamForm WhatsApp Gateway Bot is ONLINE and connected to WhatsApp!');
      isConnected = true;
    }
  });
}

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    whatsappConnected: isConnected,
    timestamp: new Date().toISOString()
  });
});

// Send Message Endpoint (Triggered by SamForm web app)
app.post('/send-message', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (API_SECRET && authHeader !== `Bearer ${API_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API_SECRET' });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Missing phone or message body' });
  }

  if (!isConnected) {
    return res.status(503).json({ error: 'WhatsApp bot is not connected. Scan QR code.' });
  }

  // Format JID (e.g. 2348012345678@s.whatsapp.net)
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;

  try {
    const sent = await sock.sendMessage(jid, { text: message });
    console.log(`✓ Result dispatched to WhatsApp: +${cleanPhone}`);
    return res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    console.error('Error sending WhatsApp message:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SamForm WhatsApp Gateway running on port ${PORT}`);
  startWhatsAppBot();
});
