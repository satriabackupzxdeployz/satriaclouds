export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return res.status(500).json({ success: false, error: 'Server misconfigured' });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const ct = req.headers['content-type'] || '';
    const bm = ct.match(/boundary=(.+)$/);
    if (!bm) return res.status(400).json({ success: false, error: 'Missing boundary' });

    const parsed = parseMultipart(raw, '--' + bm[1]);
    const photoField = parsed.photo;
    const oldMsgId = parsed.oldMessageId?.value;
    const email = parsed.email?.value || 'unknown';
    if (!photoField) return res.status(400).json({ success: false, error: 'No photo received' });

    // Delete old profile photo
    if (oldMsgId) {
      try {
        await fetch(`https://api.telegram.org/bot${TOKEN}/deleteMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, message_id: parseInt(oldMsgId, 10) }),
        });
      } catch {}
    }

    const now = new Date();
    const meta = {
      v: 1,
      sc: true,
      type: 'profile',
      email,
      ts: now.toISOString(),
    };

    const mimeType = photoField.contentType || 'image/jpeg';
    const fileName = photoField.filename || 'profile.jpg';
    const blob = new Blob([photoField.data], { type: mimeType });
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append('caption', JSON.stringify(meta));
    form.append('photo', blob, fileName);

    const tgRes = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: 'POST', body: form });
    const tgData = await tgRes.json();
    if (!tgData.ok) return res.status(500).json({ success: false, error: 'Gagal menyimpan foto' });

    const msg = tgData.result;
    const fileId = msg.photo[msg.photo.length - 1].file_id;

    return res.status(200).json({ success: true, fileId, messageId: msg.message_id });
  } catch {
    return res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
  }
}

function parseMultipart(body, boundary) {
  const result = {};
  const parts = splitBuffer(body, Buffer.from(boundary));
  for (const part of parts) {
    if (!part.length) continue;
    if (part.toString('binary').trim() === '--' || part.toString('binary').trim() === '') continue;
    const sep = Buffer.from('\r\n\r\n');
    const si = indexOfBuf(part, sep, 0);
    if (si === -1) continue;
    const h = part.slice(0, si).toString();
    const raw = part.slice(si + 4);
    const d = raw.length >= 2 ? raw.slice(0, raw.length - 2) : raw;
    const nm = h.match(/name="([^"]+)"/);
    const fm = h.match(/filename\*=UTF-8''([^\s;]+)/) || h.match(/filename="([^"]+)"/i);
    const cm = h.match(/Content-Type:\s*([^\r\n]+)/i);
    if (!nm) continue;
    if (fm) {
      let fn = fm[1]; try { fn = decodeURIComponent(fn) } catch {}
      result[nm[1]] = { filename: fn, contentType: cm ? cm[1].trim() : 'image/jpeg', data: d };
    } else {
      result[nm[1]] = { value: d.toString() };
    }
  }
  return result;
}
function splitBuffer(buf, sep) {
  const parts = []; let s = 0;
  while (true) {
    const i = indexOfBuf(buf, sep, s);
    if (i === -1) { parts.push(buf.slice(s)); break; }
    parts.push(buf.slice(s, i)); s = i + sep.length;
  }
  return parts;
}
function indexOfBuf(buf, search, from) {
  outer: for (let i = from; i <= buf.length - search.length; i++) {
    for (let j = 0; j < search.length; j++) { if (buf[i + j] !== search[j]) continue outer; }
    return i;
  }
  return -1;
}
