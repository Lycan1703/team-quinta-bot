const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const { generateAIResponse } = require('./openai');

let currentQR = null;
let connectionStatus = 'DISCONNECTED'; // DISCONNECTED, QR_READY, CONNECTED
let sockInstance = null;

// Carpeta para guardar la sesión autenticada (para no tener que escanear el QR cada vez)
const AUTH_FOLDER = path.join(__dirname, '../../baileys_auth_info');

async function startBaileysBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`\n🤖 [Baileys] Iniciando WhatsApp Socket (v${version.join('.')}, isLatest: ${isLatest})...`);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }), // Silenciar logs internos de Baileys para no saturar consola
    printQRInTerminal: false,
    auth: state,
    browser: ['Team Quinta Bot', 'Chrome', '1.0.0']
  });

  sockInstance = sock;

  // Manejador de estado de la conexión
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      connectionStatus = 'QR_READY';
      console.log('\n======================================================');
      console.log('📱 [Baileys] ¡ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP!');
      console.log('Abre WhatsApp > Dispositivos Vinculados > Vincular Dispositivo');
      console.log('======================================================\n');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`❌ [Baileys] Conexión cerrada debido a:`, lastDisconnect?.error?.message);
      connectionStatus = 'DISCONNECTED';
      currentQR = null;

      if (shouldReconnect) {
        console.log('🔄 [Baileys] Reconectando en 5 segundos...');
        setTimeout(() => startBaileysBot(), 5000);
      } else {
        console.log('🔒 [Baileys] Sesión cerrada. Deberás volver a escanear el QR.');
      }
    } else if (connection === 'open') {
      console.log('\n======================================================');
      console.log('🎉 [Baileys] ¡CONEXIÓN EXITOSA CON TU WHATSAPP!');
      console.log('El bot de Team Quinta ahora responderá automáticamente a cualquier mensaje.');
      console.log('======================================================\n');
      connectionStatus = 'CONNECTED';
      currentQR = null;
    }
  });

  // Guardar credenciales de sesión cuando se actualicen
  sock.ev.on('creds.update', saveCreds);

  // Manejador de mensajes entrantes
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignorar mensajes enviados por el propio bot/usuario o mensajes de estado
      if (msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') continue;

      const remoteJid = msg.key.remoteJid;
      // Ignorar grupos si se desea solo atención privada (individual)
      if (remoteJid.endsWith('@g.us')) continue;

      const userPhone = remoteJid.replace('@s.whatsapp.net', '');
      const pushName = msg.pushName || 'Cliente';

      // Extraer texto del mensaje
      const messageText = msg.message?.conversation || 
                          msg.message?.extendedTextMessage?.text || 
                          msg.message?.imageMessage?.caption || '';

      if (!messageText.trim()) continue;

      console.log(`\n📩 [Baileys WhatsApp] De: ${pushName} (${userPhone}): "${messageText}"`);

      // Marcar como leído
      try {
        await sock.readMessages([msg.key]);
      } catch (e) {}

      // Procesar respuesta con ChatGPT
      console.log(`🤖 [Team Quinta AI] Procesando con ChatGPT...`);
      const aiReply = await generateAIResponse(userPhone, messageText);

      // Enviar respuesta por WhatsApp
      console.log(`🚀 [Baileys Enviando] A: ${userPhone}\n${aiReply}\n`);
      await sock.sendMessage(remoteJid, { text: aiReply });
    }
  });

  return sock;
}

function getBotStatus() {
  return {
    status: connectionStatus,
    qr: currentQR
  };
}

module.exports = {
  startBaileysBot,
  getBotStatus
};
