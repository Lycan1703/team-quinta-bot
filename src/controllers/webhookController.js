const config = require('../config');
const { generateAIResponse } = require('../services/openai');
const { sendWhatsAppMessage, markMessageAsRead } = require('../services/whatsapp');

// Registro de mensajes procesados recientemente para evitar duplicados por reintentos de Meta
const processedMessages = new Set();

/**
 * Verificación del Webhook por parte de Meta (GET /webhook)
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[Webhook] Petición de verificación recibida:', { mode, token, challenge });

  if (mode === 'subscribe' && token === config.verifyToken) {
    console.log('[Webhook] ¡Verificación exitosa con Meta!');
    return res.status(200).send(challenge);
  } else {
    console.warn('[Webhook] Fallo en la verificación. Tokens no coinciden.');
    return res.status(403).send('Forbidden');
  }
}

/**
 * Recepción y procesamiento de eventos de WhatsApp (POST /webhook)
 */
async function handleWebhookEvent(req, res) {
  // Responder de inmediato con 200 OK a Meta para evitar timeouts y reintentos
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    console.log('[Webhook] POST recibido de Meta:', JSON.stringify(body, null, 2));

    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Verificar si viene un mensaje entrante
    if (value?.messages && value.messages.length > 0) {
      const message = value.messages[0];
      const messageId = message.id;
      
      // Obtener el número de teléfono del remitente (soporta mensajes reales y pruebas de Meta)
      const from = message.from || value.contacts?.[0]?.wa_id || value.contacts?.[0]?.phones?.[0]?.phone;
      const contactName = value.contacts?.[0]?.profile?.name || 'Cliente';

      // Si no hay remitente válido (ejemplo test malformado), omitir
      if (!from) {
        console.warn('[Webhook] Mensaje sin remitente ("from" no encontrado). Omitiendo.');
        return;
      }

      // Evitar procesar mensajes duplicados
      if (processedMessages.has(messageId)) {
        console.log(`[Webhook] Mensaje ${messageId} ya fue procesado. Omitiendo.`);
        return;
      }
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 60000);

      // Marcar mensaje como leído en WhatsApp (si es ID real)
      if (messageId && !messageId.startsWith('ABGG')) {
        await markMessageAsRead(messageId);
      }

      // Procesar mensajes de texto
      if (message.type === 'text') {
        const textBody = message.text?.body;
        console.log(`\n📩 [Nuevo Mensaje] De: ${contactName} (${from}): "${textBody}"`);

        // Generar respuesta con ChatGPT
        console.log(`🤖 [Team Quinta AI] Procesando respuesta con ChatGPT...`);
        const aiResponse = await generateAIResponse(from, textBody);

        // Enviar respuesta por WhatsApp
        console.log(`🚀 [Enviando] Respuesta a ${from}:\n${aiResponse}\n`);
        await sendWhatsAppMessage(from, aiResponse);
      } else {
        // Mensaje no es de texto (audio, imagen, sticker, prueba de contactos)
        console.log(`ℹ️ [Webhook] Mensaje de tipo "${message.type}" recibido.`);
        const nonTextNotice = `¡Hola ${contactName}! 🌴 Por el momento nuestro asistente procesa mensajes de texto. Por favor, escríbeme tu consulta sobre destinos, vuelos o paquetes para ayudarte de inmediato ✈️`;
        await sendWhatsAppMessage(from, nonTextNotice);
      }
    }
  } catch (error) {
    console.error('[Webhook] Error procesando evento de WhatsApp:', error.message);
  }
}

module.exports = {
  verifyWebhook,
  handleWebhookEvent
};
