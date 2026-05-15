export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  res.setHeader('Access-Control-Allow-Origin', '*');

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return res.status(500).json({ success: false, error: 'Server misconfigured' });

  const { messageId, imageTgMsgId, fileTgMsgId, email } = req.body;

  // SECURITY: email required — we verify ownership before deleting
  if (!email) {
    return res.status(400).json({ success: false, error: 'Missing email — ownership required' });
  }

  const idsToDelete = [];
  if (messageId) idsToDelete.push(messageId);
  if (imageTgMsgId && !idsToDelete.includes(imageTgMsgId)) idsToDelete.push(imageTgMsgId);
  if (fileTgMsgId && !idsToDelete.includes(fileTgMsgId)) idsToDelete.push(fileTgMsgId);
  if (idsToDelete.length === 0) return res.status(400).json({ success: false, error: 'No messageId provided' });

  // Verify ownership: fetch each message and confirm caption email matches
  for (const id of idsToDelete) {
    try {
      const msgRes = await fetch(
        `https://api.telegram.org/bot${TOKEN}/forwardMessage`,
        // We use getChat approach — actually we fetch the message via copyMessage preview
        // Simpler: we call getMessage via getUpdates-based check, but Telegram Bot API
        // doesn't have a direct getMessages. We use the /api/sync email check pattern instead.
        // Ownership is enforced at sync/client level + we check via caption below.
      );
      // Alternative: Use Telegram's getMessage via a dedicated check
      // Since Bot API has no direct getMessage, we fetch file info as ownership check:
      // We instead trust the email param for soft check but also check if message belongs to our CHAT_ID
    } catch {}
  }

  // Perform the ownership-verified deletes
  // We verify by fetching message content first using a workaround:
  // (Telegram Bot API doesn't have getMessages directly, so we use a safe approach:
  //  we only delete from our own CHAT_ID and verify caption email in each message)
  const verifiedIds = await verifyOwnership(TOKEN, CHAT_ID, idsToDelete, email);

  if (verifiedIds.length === 0) {
    return res.status(403).json({ success: false, error: 'Tidak ada file yang bisa dihapus — kepemilikan tidak terverifikasi' });
  }

  const results = await Promise.allSettled(
    verifiedIds.map(id =>
      fetch(`https://api.telegram.org/bot${TOKEN}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, message_id: id }),
      }).then(r => r.json())
    )
  );

  return res.status(200).json({
    success: true,
    deleted: results.map((r, i) => ({ id: verifiedIds[i], ok: r.status === 'fulfilled' && r.value?.ok })),
  });
}

// Verify that each messageId belongs to the requesting email by
// checking caption metadata in recent Telegram updates
async function verifyOwnership(TOKEN, CHAT_ID, messageIds, email) {
  try {
    // Fetch recent updates to find the messages and verify their email metadata
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?limit=100&offset=-1&allowed_updates=["message"]`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.ok) return [];

    const messageMap = new Map();
    for (const u of (d.result || [])) {
      if (u.message && String(u.message.chat.id) === String(CHAT_ID)) {
        messageMap.set(u.message.message_id, u.message);
      }
    }

    // Paginate if needed to find older messages
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
              messageMap.set(u.message.message_id, u.message);
              gotNew = true;
            }
          }
        }
        // Stop paginating if we found all the messages we need
        if (messageIds.every(id => messageMap.has(Number(id)))) break;
        if (!gotNew) break;
      }
    }

    const verified = [];
    for (const id of messageIds) {
      const msg = messageMap.get(Number(id));
      if (!msg) {
        // Message not found in history — deny for safety
        continue;
      }
      const rawCaption = msg.caption || msg.text || '';
      try {
        const jsonStart = rawCaption.indexOf('{');
        if (jsonStart === -1) continue;
        const meta = JSON.parse(rawCaption.slice(jsonStart));
        if (meta?.sc && meta.email === email) {
          verified.push(id);
        }
      } catch {
        continue;
      }
    }
    return verified;
  } catch {
    return [];
  }
}
