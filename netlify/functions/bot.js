// Telegram бот на Netlify Functions (webhook)
// Не нужен отдельный сервер — работает бесплатно навсегда

const BOT_TOKEN  = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: '🌾 Bot is running' };
  }

  try {
    const body    = JSON.parse(event.body || '{}');
    const message = body.message;
    if (!message) return { statusCode: 200, body: 'ok' };

    const chatId = message.chat.id;
    const text   = message.text || '';

    if (text.startsWith('/start')) {
      await tgCall('sendMessage', {
        chat_id:      chatId,
        text:         '🌾 *Учёт движения кормов*\n\nНажмите кнопку чтобы открыть приложение:',
        parse_mode:   'Markdown',
        reply_markup: {
          inline_keyboard: [[{
            text:    '📊 Открыть приложение',
            web_app: { url: WEBAPP_URL }
          }]]
        }
      });

      await tgCall('setChatMenuButton', {
        chat_id:     chatId,
        menu_button: { type: 'web_app', text: '📊 Корма', web_app: { url: WEBAPP_URL } }
      });
    }
  } catch (e) {
    console.error('Bot error:', e.message);
  }

  return { statusCode: 200, body: 'ok' };
};

async function tgCall(method, params) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params)
  });
  return res.json();
}
