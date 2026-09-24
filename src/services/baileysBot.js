const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const path = require('path');
const { generateAIResponse } = require('./openai');

let currentQR = null;
let connectionStatus = 'DISCONNECTED'; // DISCONNECTED, QR_READY, CONNECTED
let sockInstance = null;

// Carpeta para guardar la sesión autenticada
const AUTH_FOLDER = path.join(__dirname, '../../baileys_auth_info');

/**
 * Función robusta para extraer texto de cualquier formato de mensaje en WhatsApp
 */
function extractMessageText(msg) {
  if (!msg.message) return '';
  const message = msg.message;
  
  // Desenvolver mensajes efímeros o de visualización única si existen
  const unpacked = message.ephemeralMessage?.message || 
                   message.viewOnceMessage?.message || 
                   message.viewOnceMessageV2?.message || 
                   message.documentWithCaptionMessage?.message || 
                   message;

  return unpacked.conversation || 
         unpacked.extendedTextMessage?.text || 
         unpacked.imageMessage?.caption || 
         unpacked.videoMessage?.caption || 
         '';
}

async function startBaileysBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`\n🤖 [Baileys] Iniciando WhatsApp Socket (v${version.join('.')}, isLatest: ${isLatest})...`);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }), // Silenciar logs internos de Baileys
    printQRInTerminal: false,
    auth: state,
    browser: ['Team Quinta Bot', 'Chrome', '1.0.0'],
    syncFullHistory: false
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
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`❌ [Baileys] Conexión cerrada. Código: ${statusCode}, Razón:`, lastDisconnect?.error?.message);
      connectionStatus = 'DISCONNECTED';
      currentQR = null;

      if (shouldReconnect) {
        console.log('🔄 [Baileys] Reconectando en 3 segundos...');
        setTimeout(() => startBaileysBot(), 3000);
      } else {
        console.log('🔒 [Baileys] Sesión cerrada. Deberás volver a escanear el QR.');
      }
    } else if (connection === 'open') {
      console.log('\n======================================================');
      console.log('🎉 [Baileys] ¡CONEXIÓN EXITOSA CON TU WHATSAPP!');
      console.log('El bot de Team Quinta está activo y responderá automáticamente.');
      console.log('======================================================\n');
      connectionStatus = 'CONNECTED';
      currentQR = null;
    }
  });

  // Guardar credenciales de sesión cuando se actualicen
  sock.ev.on('creds.update', saveCreds);

  // Manejador de mensajes entrantes
  sock.ev.on('messages.upsert', async (m) => {
    const messages = m.messages || [];

    for (const msg of messages) {
      // Ignorar si el mensaje fue enviado por el propio bot o es un estado
      if (msg.key.fromMe) continue;
      
      const remoteJid = msg.key.remoteJid || '';
      if (remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@newsletter')) continue;

      // Opcional: Si no quieres que responda en grupos de WhatsApp
      if (remoteJid.endsWith('@g.us')) continue;

      const userPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
      const pushName = msg.pushName || 'Cliente';

      // Extraer texto del mensaje
      const messageText = extractMessageText(msg);

      if (!messageText.trim()) {
        continue;
      }

      console.log(`\n📩 [Baileys WhatsApp] De: ${pushName} (${userPhone}): "${messageText}"`);

      // Marcar como leído
      try {
        await sock.readMessages([msg.key]);
      } catch (e) {}

      // Procesar respuesta con ChatGPT
      console.log(`🤖 [Team Quinta AI] Procesando respuesta con ChatGPT...`);
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
