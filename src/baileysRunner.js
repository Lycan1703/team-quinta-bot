require('dotenv').config();
const { startBaileysBot } = require('./services/baileysBot');

console.log('🌴 [Team Quinta] Iniciando Bot de WhatsApp con Baileys (Código QR)...');
startBaileysBot();
