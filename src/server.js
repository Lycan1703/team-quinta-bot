const express = require('express');
const config = require('./config');
const { verifyWebhook, handleWebhookEvent } = require('./controllers/webhookController');
const { generateAIResponse } = require('./services/openai');

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Página principal de bienvenida y estado
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Team Quinta - Bot WhatsApp & IA</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Outfit', sans-serif;
          background: linear-gradient(135deg, #091a28 0%, #0d283e 50%, #07131e 100%);
          color: #e6f1ff;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 35px;
          max-width: 650px;
          width: 100%;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }
        .header {
          text-align: center;
          margin-bottom: 25px;
        }
        .badge {
          display: inline-block;
          background: #10b981;
          color: #064e3b;
          font-weight: 700;
          font-size: 12px;
          padding: 5px 14px;
          border-radius: 20px;
          margin-bottom: 12px;
          letter-spacing: 0.5px;
        }
        h1 {
          font-size: 26px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 6px;
        }
        p.subtitle {
          color: #94a3b8;
          font-size: 15px;
        }
        .status-box {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          font-size: 14px;
        }
        .status-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .status-row:last-child { border-bottom: none; }
        .tag-ok { color: #34d399; font-weight: 600; }
        .tag-warn { color: #fbbf24; font-weight: 600; }
        .chat-box {
          margin-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 20px;
        }
        .chat-messages {
          height: 180px;
          overflow-y: auto;
          background: rgba(0,0,0,0.25);
          border-radius: 10px;
          padding: 12px;
          margin-bottom: 12px;
          font-size: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .msg { padding: 8px 12px; border-radius: 10px; max-width: 80%; }
        .msg.user { background: #0284c7; align-self: flex-end; color: white; }
        .msg.bot { background: rgba(255,255,255,0.1); align-self: flex-start; color: #e2e8f0; }
        .chat-input-row { display: flex; gap: 8px; }
        input[type="text"] {
          flex: 1;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.2);
          background: rgba(0,0,0,0.3);
          color: white;
          outline: none;
          font-family: inherit;
        }
        button {
          padding: 10px 18px;
          background: #0284c7;
          border: none;
          color: white;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover { background: #0369a1; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="badge">● SERVIDOR ACTIVO</div>
          <h1>Team Quinta - Travel AI Bot</h1>
          <p class="subtitle">Agencia de Viajes & Turismo (Venezuela)</p>
        </div>

        <div class="status-box">
          <div class="status-row">
            <span>Webhook Meta WhatsApp:</span>
            <span class="tag-ok">/webhook</span>
          </div>
          <div class="status-row">
            <span>Verify Token:</span>
            <span><code>${config.verifyToken}</code></span>
          </div>
          <div class="status-row">
            <span>API OpenAI (ChatGPT):</span>
            <span class="${config.openaiApiKey ? 'tag-ok' : 'tag-warn'}">
              ${config.openaiApiKey ? '✓ Configurada' : '⚠ Falta clave en .env'}
            </span>
          </div>
          <div class="status-row">
            <span>WhatsApp Token:</span>
            <span class="${config.whatsappToken ? 'tag-ok' : 'tag-warn'}">
              ${config.whatsappToken ? '✓ Configurado' : '⚠ Falta clave en .env'}
            </span>
          </div>
        </div>

        <div class="chat-box">
          <h3 style="font-size: 15px; margin-bottom: 10px; color: #93c5fd;">🧪 Simulador de Prueba del Bot:</h3>
          <div class="chat-messages" id="chatArea">
            <div class="msg bot">¡Hola! 🌴✈️ Soy QuintaBot de Team Quinta. ¿En qué destino o paquete te gustaría viajar hoy?</div>
          </div>
          <div class="chat-input-row">
            <input type="text" id="userInput" placeholder="Ej: ¿Qué paquetes tienen a Los Roques o Canaima?" onkeydown="if(event.key==='Enter') sendTestMsg()">
            <button onclick="sendTestMsg()">Enviar</button>
          </div>
        </div>
      </div>

      <script>
        async function sendTestMsg() {
          const input = document.getElementById('userInput');
          const chat = document.getElementById('chatArea');
          const text = input.value.trim();
          if (!text) return;

          chat.innerHTML += '<div class="msg user">' + text + '</div>';
          input.value = '';
          chat.scrollTop = chat.scrollHeight;

          try {
            const res = await fetch('/api/test-chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: text })
            });
            const data = await res.json();
            chat.innerHTML += '<div class="msg bot">' + data.reply + '</div>';
            chat.scrollTop = chat.scrollHeight;
          } catch(e) {
            chat.innerHTML += '<div class="msg bot" style="color: #f87171;">Error al procesar mensaje con la IA.</div>';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Endpoint de prueba web local
app.post('/api/test-chat', async (req, res) => {
  const { message } = req.body;
  const reply = await generateAIResponse('test_web_user', message);
  res.json({ reply });
});

// Rutas de WhatsApp Cloud API (Webhook)
app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWebhookEvent);

// Iniciar servidor
app.listen(config.port, () => {
  console.log('========================================================');
  console.log(`🚀 [Team Quinta Bot] Servidor corriendo en http://localhost:${config.port}`);
  console.log(`📌 Webhook URL para Meta: http://localhost:${config.port}/webhook`);
  console.log(`🔑 Verify Token: ${config.verifyToken}`);
  console.log('========================================================\n');
});
