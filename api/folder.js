export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

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

  const { folderName, email, path } = req.body;
  if (!folderName) return res.status(400).json({ success: false, error: 'Missing folder name' });

  try {
    const now = new Date();
    const timestamp = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' });

    // Metadata JSON in caption — same structure as files
    const meta = {
      v: 1,
      sc: true,
      type: 'folder',
      name: folderName,
      path: path || 'root',
      email: email || 'unknown',
      ts: now.toISOString(),
      label: timestamp,
    };
    const caption = JSON.stringify(meta);

    // Send empty zip as the "folder file" with JSON metadata caption
    const emptyZip = Buffer.from([
      0x50,0x4B,0x05,0x06,0x00,0x00,0x00,0x00,
      0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
      0x00,0x00,0x00,0x00,0x00,0x00,
    ]);
    const safeFolder = folderName.replace(/[/\\?%*:|"<>]/g, '_');
    const blob = new Blob([emptyZip], { type: 'application/zip' });
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append('caption', caption);
    form.append('document', blob, `📁 ${safeFolder}.zip`);

    const tgRes = await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, {
      method: 'POST', body: form,
    });
    const tgData = await tgRes.json();
    if (!tgData.ok) return res.status(500).json({ success: false, error: tgData.description });

    return res.status(200).json({ success: true, messageId: tgData.result.message_id });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
  }
}
