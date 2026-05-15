import { createHmac, timingSafeEqual } from 'crypto';

// Verify HMAC-signed token — same logic as mktoken.js
function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');
  const [data, sig] = parts;
  const expected = createHmac('sha256', secret).update(data).digest('base64url');
  // Timing-safe comparison prevents timing attacks
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error('Invalid signature');
  }
  return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const SECRET = process.env.TOKEN_SECRET || process.env.TELEGRAM_BOT_TOKEN;
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!SECRET || !TOKEN) return res.status(500).end();

  // Token arrives as query param (e.g. /f/<token>.ext → vercel rewrites)
  const { token } = req.query;
  if (!token) return res.status(400).send('Token tidak valid.');

  let payload;
  try {
    payload = verifyToken(token, SECRET);
  } catch {
    return res.status(403).send('Token tidak valid atau sudah kedaluwarsa.');
  }

  if (Date.now() > payload.exp) {
    return res.status(410).send('Link sudah kedaluwarsa. Coba unduh lagi dari web.');
  }

  // email field in token = ownership proof created at mktoken time
  // No extra auth needed here — the signed token IS the proof
  const { fileId, fileName } = payload;

  try {
    const infoRes = await fetch(
      `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const infoData = await infoRes.json();
    if (!infoData.ok) return res.status(502).send('Gagal mengambil file dari penyimpanan.');

    const tgUrl = `https://api.telegram.org/file/bot${TOKEN}/${infoData.result.file_path}`;
    const fileRes = await fetch(tgUrl);
    if (!fileRes.ok) return res.status(502).send('Gagal mengambil file.');

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const safeFileName = encodeURIComponent(fileName);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFileName}; filename="${safeFileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Powered-By', 'Satriaclouds');

    const buf = Buffer.from(await fileRes.arrayBuffer());
    res.status(200).send(buf);
  } catch (err) {
    return res.status(500).send('Terjadi kesalahan: ' + err.message);
  }
}
