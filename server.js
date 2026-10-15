const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ====================== Environment ======================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '8017590244';
const CRYPTO_PAY_TOKEN = process.env.CRYPTO_PAY_TOKEN || '650769:AAc4yAR24KknYvdtLgfbLG2ESfBWKCw0gkZ';

// ====================== Simple in-memory store (for future feed connection) ======================
// זה המקום המרכזי והיחיד שממנו עמודים אחרים יכולים לקרוא הזמנות
const ordersStore = [];

function addOrder(order) {
  ordersStore.unshift({
    ...order,
    status: order.status || 'pending',
    createdAt: new Date().toISOString()
  });
  // שומר רק 200 אחרונות
  if (ordersStore.length > 200) ordersStore.pop();
}

// ====================== Crypto Pay – Create Invoice ======================
app.post('/api/create-invoice', async (req, res) => {
  try {
    const { plan, price, amount, target, platform, userId } = req.body;

    if (!price || !plan) {
      return res.status(400).json({ success: false, error: 'Missing plan or price' });
    }

    const payload = JSON.stringify({
      plan,
      price,
      amount: amount || null,
      target: target || null,
      platform: platform || null,
      userId: userId || 'guest',
      ts: Date.now()
    });

    const body = {
      currency_type: 'fiat',
      fiat: 'USD',
      amount: String(price),
      description: `PRO ${plan} – AI Agent Code`,
      payload: payload,
      paid_btn_name: 'callback',
      paid_btn_url: 'https://boster-4837.onrender.com/',
      allow_comments: false,
      allow_anonymous: true,
      expires_in: 3600
    };

    const response = await fetch('https://pay.crypt.bot/api/createInvoice', {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': CRYPTO_PAY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('CryptoPay error:', data);
      return res.status(500).json({ success: false, error: data.error || 'CryptoPay failed' });
    }

    const invoice = data.result;

    // שומר הזמנה ממתינה
    addOrder({
      orderId: 'INV-' + invoice.invoice_id,
      type: 'pro',
      plan,
      price,
      amount,
      target,
      platform,
      userId,
      invoiceId: invoice.invoice_id,
      payUrl: invoice.bot_invoice_url || invoice.pay_url,
      status: 'waiting_payment'
    });

    res.json({
      success: true,
      payUrl: invoice.bot_invoice_url || invoice.pay_url,
      invoiceId: invoice.invoice_id,
      miniAppUrl: invoice.mini_app_invoice_url || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== Notify order to Telegram ======================
app.post('/api/notify-order', async (req, res) => {
  const order = req.body;

  // שומר גם הזמנות חינמיות
  addOrder({ ...order, status: 'processing', type: 'free' });

  if (!TELEGRAM_BOT_TOKEN) {
    return res.json({ success: true, note: 'No telegram token' });
  }

  const message = `
🚀 *הזמנה חדשה התקבלה!*

🆔 *מספר:* \`${order.orderId}\`
📱 *רשת:* ${order.platformName || order.platform}
🎯 *יעד:* \`${order.target}\`
🔢 *כמות:* ${order.amount}
🕐 *שעה:* ${order.localTime || new Date().toLocaleString('he-IL')}
${order.isPro ? '💎 *PRO*' : '🆓 *חינם*'}

👤 *משתמש:* \`${order.userId || 'guest'}\`
🌐 *מקור:* ${order.referrer || 'ישיר'}
  `.trim();

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// ====================== חיבור פשוט לעמודים עתידיים ======================
// עמוד הפיד / מעקב יכול לקרוא מכאן
app.get('/api/orders', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const status = req.query.status; // optional filter
  let list = ordersStore;
  if (status) list = list.filter(o => o.status === status);
  res.json({ success: true, orders: list.slice(0, limit) });
});

// פרמטרים לאזור אישי (profile.html)
app.get('/api/profile-data', (req, res) => {
  const userId = req.query.userId || 'guest';
  const userOrders = ordersStore.filter(o => o.userId === userId);
  res.json({
    success: true,
    userId,
    totalOrders: userOrders.length,
    lastOrders: userOrders.slice(0, 10),
    online: true,
    serverTime: new Date().toISOString()
  });
});

// ====================== Static + SPA fallback ======================
app.get('*', (req, res) => {
  // אם מבקשים profile.html – נותן אותו
  if (req.path === '/profile.html' || req.path === '/profile') {
    return res.sendFile(path.join(__dirname, 'profile.html'));
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
