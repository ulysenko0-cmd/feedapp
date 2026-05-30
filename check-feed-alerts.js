// Daily feed balance alerts for Telegram.
// Netlify Scheduled Function: checks every morning and notifies users by role/site.

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rukqmhrhxzmiwtbepxmz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_y5vcLvwP6zO4AUXIAJp6ng_0arShMHX';

const SITES = {
  'РУС': 'ЖК Русь',
  'РОС': 'Комплекс Российский'
};

const ALERT_DAYS = 7;

exports.config = {
  // 04:00 UTC = 09:00 Asia/Yekaterinburg.
  schedule: '0 4 * * *'
};

exports.handler = async () => {
  try {
    if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const alertDate = now.toISOString().slice(0, 10);

    const [users, feeds] = await Promise.all([
      sbGet('app_users', 'select=tg_id,name,role,site&tg_id=gt.0'),
      sbGet('feeds', 'select=id,name,active&active=is.true&order=sort_order')
    ]);

    const siteAlerts = {};
    for (const site of Object.keys(SITES)) {
      siteAlerts[site] = await buildSiteAlerts(site, feeds, year, month, day);
    }

    let sent = 0;
    for (const user of users) {
      const sites = sitesForUser(user);
      for (const site of sites) {
        const alerts = siteAlerts[site] || [];
        const freshAlerts = [];

        for (const alert of alerts) {
          const alreadySent = await sbGet(
            'feed_alert_notifications',
            `select=id&alert_date=eq.${alertDate}&tg_id=eq.${user.tg_id}&site=eq.${site}&feed_id=eq.${alert.feed_id}&limit=1`
          );
          if (!alreadySent.length) freshAlerts.push(alert);
        }

        if (!freshAlerts.length) continue;

        await sendTelegram(user.tg_id, formatMessage(site, freshAlerts));

        for (const alert of freshAlerts) {
          await sbUpsert('feed_alert_notifications', {
            alert_date: alertDate,
            tg_id: user.tg_id,
            site,
            feed_id: alert.feed_id,
            days_left: Number(alert.days_left.toFixed(2)),
            balance_t: Number(alert.balance.toFixed(3))
          });
        }
        sent++;
      }
    }

    return json(200, { ok: true, sent });
  } catch (err) {
    console.error('Feed alerts error:', err);
    return json(500, { ok: false, error: err.message });
  }
};

async function buildSiteAlerts(site, feeds, year, month, day) {
  const [needs, openBalances, dayRecords] = await Promise.all([
    sbGet('monthly_needs', `select=feed_id,per_month_t&site=eq.${site}&year=eq.${year}&month=eq.${month}`),
    sbGet('opening_balances', `select=feed_id,opening_balance&site=eq.${site}&year=eq.${year}&month=eq.${month}`),
    sbGet('day_records', `select=feed_id,day,intake,expense&site=eq.${site}&year=eq.${year}&month=eq.${month}`)
  ]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const alerts = [];

  for (const feed of feeds) {
    const need = Number((needs.find(x => x.feed_id === feed.id) || {}).per_month_t || 0);
    if (need <= 0) continue;

    const dailyNeed = need / daysInMonth;
    const opening = Number((openBalances.find(x => x.feed_id === feed.id) || {}).opening_balance || 0);
    let balance = opening;

    for (let d = 1; d <= day; d++) {
      const rec = dayRecords.find(x => x.feed_id === feed.id && Number(x.day) === d);
      const intake = Number((rec || {}).intake || 0);
      const expense = Number((rec || {}).expense || 0);
      balance += intake;
      balance -= expense > 0 ? expense : dailyNeed;
    }

    balance = Math.max(0, balance);
    const daysLeft = dailyNeed > 0 ? balance / dailyNeed : Infinity;

    if (daysLeft <= ALERT_DAYS) {
      alerts.push({
        feed_id: feed.id,
        name: feed.name,
        balance,
        days_left: daysLeft
      });
    }
  }

  return alerts.sort((a, b) => a.days_left - b.days_left);
}

function sitesForUser(user) {
  if (user.role === 'admin' || user.role === 'viewer') return Object.keys(SITES);
  if (user.role === 'operator' && user.site) return [user.site];
  return [];
}

function formatMessage(site, alerts) {
  const lines = alerts.map(a =>
    `• ${a.name}: ${fmt(a.balance)} т, примерно ${fmt(a.days_left)} дн.`
  );
  return [
    `⚠️ Остатки на 7 дней или меньше`,
    `Площадка: ${SITES[site] || site}`,
    '',
    ...lines
  ].join('\n');
}

function fmt(value) {
  return Number(value || 0).toFixed(2).replace(/\.?0+$/, '');
}

async function sbGet(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`${table}: ${await res.text()}`);
  return res.json();
}

async function sbUpsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...sbHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`${table}: ${await res.text()}`);
}

function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  };
}

async function sendTelegram(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });
  if (!res.ok) throw new Error(`Telegram: ${await res.text()}`);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
