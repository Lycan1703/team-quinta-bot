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
  // Responder INMEDIATAMENTE 200 OK a Meta para que sepa que recibimos la notificación y NO reintente
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Si es solo una actualización de estado (enviado, entregado, leído), ignorar
    if (value?.statuses && !value?.messages) {
      return;
    }

    // Verificar si viene un mensaje entrante real
    if (value?.messages && value.messages.length > 0) {
      const message = value.messages[0];
      const messageId = message.id;
      
      // 1. Evitar reintentos de mensajes duplicados
      if (processedMessages.has(messageId)) {
        console.log(`[Webhook] Mensaje ${messageId} ya fue procesado antes. Omitiendo duplicado.`);
        return;
      }
      processedMessages.add(messageId);
      // Limpiar de memoria después de 15 minutos
      setTimeout(() => processedMessages.delete(messageId), 15 * 60 * 1000);

      // 2. Filtro de mensajes antiguos / reintentos tardíos de Meta (más de 2 minutos de antigüedad)
      if (message.timestamp) {
        const messageAgeInSeconds = (Date.now() / 1000) - Number(message.timestamp);
        if (messageAgeInSeconds > 120) {
          console.log(`[Webhook] Ignorando mensaje antiguo (${Math.round(messageAgeInSeconds)}s de antigüedad).`);
          return;
        }
      }

      // Obtener el número de teléfono del remitente
      const from = message.from || value.contacts?.[0]?.wa_id;
      const contactName = value.contacts?.[0]?.profile?.name || 'Cliente';

      if (!from) {
        console.warn('[Webhook] Mensaje sin número remitente. Omitiendo.');
        return;
      }

      // Marcar mensaje como leído en WhatsApp
      if (messageId && !messageId.startsWith('ABGG')) {
        await markMessageAsRead(messageId);
      }

      // Procesar mensajes de texto
      if (message.type === 'text') {
        const textBody = message.text?.body;
        if (!textBody || !textBody.trim()) return;

        console.log(`\n📩 [Nuevo Mensaje] De: ${contactName} (${from}): "${textBody}"`);

        // Generar respuesta con ChatGPT
        console.log(`🤖 [Team Quinta AI] Procesando respuesta con ChatGPT...`);
        const aiResponse = await generateAIResponse(from, textBody);

        // Enviar respuesta por WhatsApp
        console.log(`🚀 [Enviando] Respuesta a ${from}:\n${aiResponse}\n`);
        await sendWhatsAppMessage(from, aiResponse);
      } else {
        // Mensaje no es de texto (audio, imagen, sticker)
        console.log(`ℹ️ [Webhook] Mensaje no-texto de tipo "${message.type}" recibido.`);
        const nonTextNotice = `¡Hola ${contactName}! 🌴 Por el momento nuestro asistente procesa consultas de texto. Por favor, escríbeme tu duda sobre destinos, vuelos o paquetes para ayudarte de inmediato ✈️`;
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
