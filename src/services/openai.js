const OpenAI = require('openai');
const config = require('../config');
const { SYSTEM_PROMPT } = require('./travelPrompts');

// Inicializar cliente de OpenAI
const openai = new OpenAI({
  apiKey: config.openaiApiKey
});

// Memoria de conversación en memoria (almacena últimos mensajes por número de teléfono)
const conversationMemory = new Map();

// Límite de mensajes guardados por usuario para no saturar tokens
const MAX_HISTORY = 10;

/**
 * Obtiene el historial de mensajes de un usuario
 */
function getUserHistory(userPhone) {
  if (!conversationMemory.has(userPhone)) {
    conversationMemory.set(userPhone, []);
  }
  return conversationMemory.get(userPhone);
}

/**
 * Agrega un mensaje al historial
 */
function addMessageToHistory(userPhone, role, content) {
  const history = getUserHistory(userPhone);
  history.push({ role, content });
  
  // Mantener solo los últimos mensajes
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

/**
 * Genera una respuesta con ChatGPT (gpt-4o-mini)
 */
async function generateAIResponse(userPhone, userMessage) {
  try {
    if (!config.openaiApiKey) {
      return "Hola, estamos configurando el sistema de atención con IA de Team Quinta. En breve un asesor te responderá.";
    }

    // Agregar el mensaje del usuario al historial
    addMessageToHistory(userPhone, 'user', userMessage);
    const history = getUserHistory(userPhone);

    // Armar el array de mensajes para OpenAI
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Rápido, económico y de altísima calidad
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });

    const botReply = response.choices[0]?.message?.content || 
      "Disculpa, tuve un inconveniente procesando tu solicitud. ¿Podrías repetirme tu consulta sobre el viaje?";

    // Guardar respuesta del bot en el historial
    addMessageToHistory(userPhone, 'assistant', botReply);

    return botReply;
  } catch (error) {
    console.error('Error al llamar a OpenAI:', error.response?.data || error.message);
    return "¡Hola! En este momento estamos actualizando nuestras tarifas y disponibilidad. Un asesor humano de Team Quinta te responderá a la brevedad 🌴✈️";
  }
}

module.exports = {
  generateAIResponse,
  getUserHistory
};
