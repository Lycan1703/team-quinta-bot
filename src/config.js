// Configuración de variables de entorno
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  whatsappToken: process.env.WHATSAPP_TOKEN || '',
  whatsappPhoneId: process.env.PHONE_NUMBER_ID || '',
  verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'team_quinta_secret_2024',
  apiVersion: process.env.META_API_VERSION || 'v21.0'
};
