const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// מגיש את הקבצים הסטטיים (האתר)
app.use(express.static(__dirname));

// Endpoint לשליחת הזמנה לבוט
app.post('/api/notify-order', async (req, res) => {
  const order = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !chatId) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID');
    return res.status(500).json({ success: false, error: 'Missing env vars' });
  }

  const message = `
🚀 *הזמנה חדשה התקבלה!*

🆔 *מספר הזמנה:* \`${order.orderId}\`
📱 *רשת:* ${order.platformName}
🎯 *יעד:* \`${order.target}\`
🔢 *כמות:* ${order.amount}
🕐 *שעה:* ${order.localTime}

👤 *פרטי משתמש:*
• מזהה: \`${order.userId}\`
• שפה: ${order.language}
• מסך: ${order.screen}
• אזור זמן: ${order.timezone}
• מקור: ${order.referrer || 'ישיר'}

🖥 *מכשיר:*
\`${order.userAgent}\`
  `.trim();

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram error:', data);
      return res.status(500).json({ success: false });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// כל שאר הנתיבים מחזירים את index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
