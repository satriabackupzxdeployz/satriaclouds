import { createHmac } from 'crypto';

export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };

// Sign token with HMAC-SHA256 — cannot be forged without TOKEN_SECRET
function signPayload(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  const SECRET = process.env.TOKEN_SECRET || process.env.TELEGRAM_BOT_TOKEN;
  if (!SECRET) return res.status(500).json({ success: false, error: 'Server misconfigured' });

  const { fileId, fileName, email } = req.body;
  if (!fileId || !fileName || !email) {
    return res.status(400).json({ success: false, error: 'Missing params' });
  }

  // Token expires in 5 minutes, tied to user email (ownership)
  const payload = {
    fileId,
    fileName,
    email,        // ownership — verified server-side on download
    exp: Date.now() + 5 * 60 * 1000,
  };

  const token = signPayload(payload, SECRET);
  const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : 'bin';

  return res.status(200).json({
    success: true,
    token,
    url: `/f/${encodeURIComponent(token)}.${ext}`,
  });
}
