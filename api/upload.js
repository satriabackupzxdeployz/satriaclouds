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
    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) return res.status(400).json({ success: false, error: 'Missing boundary' });

    const parsed = parseMultipart(body, '--' + boundaryMatch[1]);
    const fileField = parsed.file;
    const email = parsed.email?.value || 'unknown';
    const path = parsed.path?.value || 'root';
    if (!fileField) return res.status(400).json({ success: false, error: 'No file received' });

    const mimeType = fileField.contentType || 'application/octet-stream';
    const fileName = fileField.filename || 'file';
    const fileSize = fileField.data.length;
    const now = new Date();
    const timestamp = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' });

    // Metadata JSON stored in caption — this is our database record
    const meta = {
      v: 1,
      sc: true,           // marker to identify SatriaClouds messages
      name: fileName,
      mime: mimeType,
      size: fileSize,
      path,
      email,
      ts: now.toISOString(),
      label: timestamp,
    };
    const caption = JSON.stringify(meta);

    const blob = new Blob([fileField.data], { type: mimeType });
    const tgForm = new FormData();
    tgForm.append('chat_id', CHAT_ID);
    tgForm.append('caption', caption);

    const mime = mimeType.toLowerCase();
    let endpoint, fieldName;
    if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a|opus)$/i.test(fileName)) {
      endpoint = 'sendAudio'; fieldName = 'audio';
    } else if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName)) {
      endpoint = 'sendVideo'; fieldName = 'video';
    } else {
      endpoint = 'sendDocument'; fieldName = 'document';
    }
    tgForm.append(fieldName, blob, fileName);

    let tgData = await (await fetch(`https://api.telegram.org/bot${TOKEN}/${endpoint}`, {
      method: 'POST', body: tgForm,
    })).json();

    if (!tgData.ok) {
      const fb = new FormData();
      fb.append('chat_id', CHAT_ID);
      fb.append('caption', caption);
      fb.append('document', new Blob([fileField.data], { type: mimeType }), fileName);
      tgData = await (await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, {
        method: 'POST', body: fb,
      })).json();
      if (!tgData.ok) return res.status(500).json({ success: false, error: 'Upload ke penyimpanan gagal' });
    }

    const msg = tgData.result;
    let fileId;
    if (msg.audio) fileId = msg.audio.file_id;
    else if (msg.video) fileId = msg.video.file_id;
    else if (msg.document) fileId = msg.document.file_id;
    else if (msg.photo) fileId = msg.photo[msg.photo.length - 1].file_id;
    else return res.status(500).json({ success: false, error: 'Tidak bisa membaca ID file' });

    return res.status(200).json({
      success: true,
      fileId,
      fileName,
      messageId: msg.message_id,
      path,
      size: formatBytes(fileSize),
      modified: timestamp,
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
  }
}

function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
}

function parseMultipart(body, boundary) {
  const result = {};
  const parts = splitBuffer(body, Buffer.from(boundary));
  for (const part of parts) {
    if (!part.length) continue;
    if (part.toString('binary').trim() === '--' || part.toString('binary').trim() === '') continue;
    const sep = Buffer.from('\r\n\r\n');
    const sepIdx = indexOfBuf(part, sep, 0);
    if (sepIdx === -1) continue;
    const headerStr = part.slice(0, sepIdx).toString();
    const rawData = part.slice(sepIdx + 4);
    const data = rawData.length >= 2 ? rawData.slice(0, rawData.length - 2) : rawData;
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const fileMatch = headerStr.match(/filename\*=UTF-8''([^\s;]+)/) || headerStr.match(/filename="([^"]+)"/i);
    const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (fileMatch) {
      let filename = fileMatch[1];
      try { filename = decodeURIComponent(filename) } catch {}
      result[name] = { filename, contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream', data };
    } else {
      result[name] = { value: data.toString() };
    }
  }
  return result;
}
function splitBuffer(buf, sep) {
  const parts = []; let start = 0;
  while (true) {
    const idx = indexOfBuf(buf, sep, start);
    if (idx === -1) { parts.push(buf.slice(start)); break; }
    parts.push(buf.slice(start, idx)); start = idx + sep.length;
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
