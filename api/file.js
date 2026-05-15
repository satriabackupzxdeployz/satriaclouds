// Proxy API: fetch a file from Telegram by file_id
// SECURITY: file_id is validated by verifying it belongs to the requesting user's email
// The caller must pass their email as a query param; server cross-checks against Telegram metadata

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return res.status(500).end();

  const { file_id, email } = req.query;
  if (!file_id || !email) return res.status(400).json({ error: 'Missing file_id or email' });

  // SECURITY: verify that this file_id was uploaded by this email
  const isOwner = await verifyFileOwnership(TOKEN, CHAT_ID, file_id, email);
  if (!isOwner) {
    return res.status(403).json({ error: 'Akses ditolak — file tidak ditemukan atau bukan milik Anda' });
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${encodeURIComponent(file_id)}`);
    const data = await r.json();
    if (!data.ok) return res.status(502).json({ success: false, error: 'Storage error' });

    const tgUrl = `https://api.telegram.org/file/bot${TOKEN}/${data.result.file_path}`;
    const fileRes = await fetch(tgUrl);
    if (!fileRes.ok) return res.status(502).end();

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await fileRes.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.status(200).send(buf);
  } catch {
    res.status(500).end();
  }
}

// Verify file_id belongs to email by scanning Telegram message metadata
async function verifyFileOwnership(TOKEN, CHAT_ID, fileId, email) {
  try {
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?limit=100&offset=-1&allowed_updates=["message"]`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.ok) return false;

    const allMessages = [];
    for (const u of (d.result || [])) {
      if (u.message && String(u.message.chat.id) === String(CHAT_ID)) {
        allMessages.push(u.message);
      }
    }

    // Paginate to find older messages if needed
    if (d.result?.length === 100) {
      let minId = Math.min(...d.result.map(u => u.update_id));
      for (let page = 0; page < 10; page++) {
        const r2 = await fetch(
          `https://api.telegram.org/bot${TOKEN}/getUpdates?limit=100&offset=${minId - 100}&allowed_updates=["message"]`
        );
        const d2 = await r2.json();
        if (!d2.ok || !d2.result?.length) break;
        let gotNew = false;
        for (const u of d2.result) {
          if (u.update_id < minId) {
            minId = u.update_id;
            if (u.message && String(u.message.chat.id) === String(CHAT_ID)) {
              allMessages.push(u.message);
              gotNew = true;
            }
          }
        }
        if (!gotNew) break;
      }
    }

    for (const msg of allMessages) {
      // Extract file_id from this message
      let msgFileId = null;
      if (msg.document) msgFileId = msg.document.file_id;
      else if (msg.audio) msgFileId = msg.audio.file_id;
      else if (msg.video) msgFileId = msg.video.file_id;
      else if (msg.photo) msgFileId = msg.photo[msg.photo.length - 1].file_id;

      if (msgFileId !== fileId) continue;

      // Match found — verify email in caption metadata
      const rawCaption = msg.caption || msg.text || '';
      try {
        const jsonStart = rawCaption.indexOf('{');
        if (jsonStart === -1) continue;
        const meta = JSON.parse(rawCaption.slice(jsonStart));
        if (meta?.sc && meta.email === email) return true;
      } catch {}
    }
    return false;
  } catch {
    return false;
  }
}
