const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

// ── Config ──
// Detect real home vs Hermes profile home
const REAL_HOME = (process.env.HOME || '').includes('/.hermes/profiles/') 
  ? '/home/ferdignatius' 
  : (process.env.HOME || '/home/ferdignatius');

const BOT_NAME = '@aii';
const QUEUE_DIR = path.join(REAL_HOME, '.hermes/profiles/sekkha_puggala/wa_queue');
const INBOX_FILE = path.join(QUEUE_DIR, 'inbox.json');
const OUTBOX_FILE = path.join(QUEUE_DIR, 'outbox.json');
const OUTBOX_SENT_FILE = path.join(QUEUE_DIR, 'outbox_sent.json');
const DATA_DIR = path.join(__dirname, '.wwebjs_auth');

// Chromium path (from playwright install)
const CHROME_PATH = process.env.CHROME_PATH || 
  path.join(REAL_HOME, '.hermes/profiles/sekkha_puggala/home/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');

// ── Ensure queue dir exists ──
if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
if (!fs.existsSync(INBOX_FILE)) fs.writeFileSync(INBOX_FILE, '[]');
if (!fs.existsSync(OUTBOX_FILE)) fs.writeFileSync(OUTBOX_FILE, '[]');
if (!fs.existsSync(OUTBOX_SENT_FILE)) fs.writeFileSync(OUTBOX_SENT_FILE, '[]');

// ── Queue helpers ──
function readQueue(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || '[]'); }
  catch { return []; }
}

function writeQueue(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function pushToQueue(file, item) {
  const q = readQueue(file);
  q.push(item);
  writeQueue(file, q);
}

// ── Outbox sender (check for messages to send to WA) ──
async function processOutbox(client) {
  try {
    const outbox = readQueue(OUTBOX_FILE);
    if (outbox.length === 0) return;

    const sent = readQueue(OUTBOX_SENT_FILE);
    const remaining = [];

    for (const msg of outbox) {
      try {
        const chat = await client.getChatById(msg.chatId);
        await chat.sendMessage(msg.text);
        sent.push({ ...msg, sentAt: new Date().toISOString() });
        console.log(`[OUTBOX] Sent to ${msg.chatId}: ${msg.text.substring(0, 50)}`);
      } catch (err) {
        console.error(`[OUTBOX] Failed to ${msg.chatId}:`, err.message);
        remaining.push(msg);
      }
    }

    writeQueue(OUTBOX_FILE, remaining);
    writeQueue(OUTBOX_SENT_FILE, sent.slice(-100)); // keep last 100
  } catch (err) {
    console.error('[OUTBOX] Error:', err.message);
  }
}

// ── Start bridge ──
async function start() {
  console.log('[BRIDGE] Starting WhatsApp bridge...');
  console.log('[BRIDGE] Chrome:', CHROME_PATH);
  console.log('[BRIDGE] Queue:', QUEUE_DIR);

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: DATA_DIR }),
    puppeteer: {
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
    },
  });

  // ── Puppeteer page console (catch WA Web errors) ──
  client.on('loading_screen', (percent, message) => {
    console.log(`[BRIDGE] Loading: ${percent}% - ${message}`);
  });

  client.on('authenticated', () => {
    console.log('[BRIDGE] Authenticated!');
  });

  client.on('auth_failure', (msg) => {
    console.error('[BRIDGE] Auth failure:', msg);
  });

  // ── QR Code (first time setup) ──
  client.on('qr', (qr) => {
    // Save raw QR data
    fs.writeFileSync(path.join(__dirname, 'qr.txt'), qr);

    console.log('\n========================================');
    console.log('  SCAN QR CODE DENGAN WHATSAPP LO');
    console.log('  Buka WA → 3 titik → Linked Devices');
    console.log('========================================\n');

    // Generate QR as ASCII for terminal
    const qrcode = require('qrcode-terminal');
    qrcode.generate(qr, { small: false });
    console.log('\nQR raw data saved to: qr.txt\n');
  });

  // ── Ready ──
  client.on('ready', () => {
    const botNumber = client.info?.wid?._serialized?.replace('@c.us', '') || 'unknown';
    console.log('[BRIDGE] ✅ WhatsApp connected!');
    console.log(`[BRIDGE] 📱 Bot number: ${botNumber}`);
    console.log('[BRIDGE] Listening for @aii mentions in groups...');
    
    // Poll outbox every 3 seconds
    setInterval(() => processOutbox(client), 3000);
  });

  // ── Authentication failure ──
  client.on('auth_failure', (msg) => {
    console.error('[BRIDGE] Auth failure:', msg);
  });

  // ── Disconnected ──
  client.on('disconnected', (reason) => {
    console.log('[BRIDGE] Disconnected:', reason);
    console.log('[BRIDGE] Restarting in 10 seconds...');
    setTimeout(() => process.exit(1), 10000);
  });

  // ── Global error handler ──
  client.on('error', (err) => {
    console.error('[BRIDGE] Client error:', err.message, err.stack);
  });

  // ── Message handler ──
  client.on('message', async (message) => {
    try {
      const chat = await message.getChat();
      
      // Log all incoming messages for debugging
      console.log(`[DEBUG] Message received - from: ${message.from}, isGroup: ${chat.isGroup}, body: "${message.body?.substring(0, 80)}"`);
      console.log(`[DEBUG] Mentioned IDs: ${JSON.stringify(message.mentionedIds || [])}`);
      
      // ONLY PROCESS GROUP MESSAGES
      if (!chat.isGroup) {
        console.log(`[SKIP] DM from ${message.from}: not a group`);
        return;
      }

      // Check if message mentions @aii
      const body = message.body || '';
      const hasMention = body.toLowerCase().includes(BOT_NAME.toLowerCase());
      
      if (!hasMention) {
        // Check mentions array as well (for real @ mentions)
        const mentionedIds = message.mentionedIds || [];
        // We can't easily check our own ID, so fall back to body check
        // Skip if no mention
        if (!mentionedIds.includes(client.info?.wid?._serialized)) {
          return;
        }
      }

      // Get group name
      const groupName = chat.name || 'Unknown Group';
      
      // Get sender info
      const contact = await message.getContact();
      const senderName = contact.pushname || contact.name || message.author || message.from;

      // Get replied message context if any
      let replyContext = null;
      if (message.hasQuotedMsg) {
        try {
          const quoted = await message.getQuotedMessage();
          replyContext = {
            from: quoted.author || quoted.from,
            body: quoted.body?.substring(0, 200),
          };
        } catch (e) { /* ignore */ }
      }

      // Build inbox entry
      const entry = {
        id: message.id._serialized,
        type: 'group_message',
        timestamp: new Date().toISOString(),
        chatId: chat.id._serialized,
        groupName: groupName,
        from: message.author || message.from,
        senderName: senderName,
        body: body,
        hasMedia: message.hasMedia,
        replyContext: replyContext,
      };

      // If it has media (images, etc.), note that we can't process them yet
      if (message.hasMedia) {
        entry.mediaWarning = 'Media not processed - text only';
      }

      pushToQueue(INBOX_FILE, entry);
      console.log(`[INBOX] @aii mention in "${groupName}" from ${senderName}: ${body.substring(0, 80)}`);

    } catch (err) {
      console.error('[BRIDGE] Message handler error:', err.message);
    }
  });

  // ── Initialize ──
  try {
    await client.initialize();
  } catch (err) {
    console.error('[BRIDGE] Failed to initialize:', err.message);
    process.exit(1);
  }
}

start();
