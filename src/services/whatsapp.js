const axios = require('axios');
const config = require('../config');

/**
 * Envía un mensaje de texto al usuario en WhatsApp
 * @param {string} to - Número de teléfono del destinatario (ej: 584121234567)
 * @param {string} text - Contenido del mensaje
 */
async function sendWhatsAppMessage(to, text) {
  try {
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.whatsappPhoneId}/messages`;
    
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: {
        preview_url: false,
        body: text
      }
    };

    const headers = {
      'Authorization': `Bearer ${config.whatsappToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(url, data, { headers });
    console.log(`[WhatsApp] Mensaje enviado a ${to}: ID ${response.data?.messages?.[0]?.id}`);
    return response.data;
  } catch (error) {
    console.error('[WhatsApp] Error al enviar mensaje:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Marca un mensaje entrante como leído (doble check azul)
 * @param {string} messageId - ID del mensaje recibido
 */
async function markMessageAsRead(messageId) {
  try {
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.whatsappPhoneId}/messages`;
    
    const data = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    };

    const headers = {
      'Authorization': `Bearer ${config.whatsappToken}`,
      'Content-Type': 'application/json'
    };

    await axios.post(url, data, { headers });
  } catch (error) {
    // Si falla marcar como leído no es crítico, solo registramos log
    console.warn('[WhatsApp] No se pudo marcar como leído:', error.response?.data || error.message);
  }
}

module.exports = {
  sendWhatsAppMessage,
  markMessageAsRead
};
