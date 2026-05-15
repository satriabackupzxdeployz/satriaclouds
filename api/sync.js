export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return res.status(500).json({ success: false, error: 'Server misconfigured' });

  const { email } = req.query;
  if (!email) return res.status(400).json({ success: false, error: 'Missing email' });

  try {
    const messages = await fetchMessages(TOKEN, CHAT_ID);
    const files = [];
    let profileFileId = null;
    let profileMsgId = null;

    for (const msg of messages) {
      const rawCaption = msg.caption || msg.text || '';
      let meta = null;
      try {
        // Caption starts with '{' = our JSON metadata
        const jsonStart = rawCaption.indexOf('{');
        if (jsonStart === -1) continue;
        meta = JSON.parse(rawCaption.slice(jsonStart));
      } catch { continue; }

      if (!meta?.sc) continue;
      if (meta.email !== email) continue;

      if (meta.type === 'profile') {
        if (!profileMsgId || msg.message_id > profileMsgId) {
          const photos = msg.photo;
          if (photos?.length) {
            profileFileId = photos[photos.length - 1].file_id;
            profileMsgId = msg.message_id;
          }
        }
        continue;
      }

      let fileId = null;
      if (msg.document) fileId = msg.document.file_id;
      else if (msg.audio) fileId = msg.audio.file_id;
      else if (msg.video) fileId = msg.video.file_id;
      else if (msg.photo) fileId = msg.photo[msg.photo.length - 1].file_id;

      if (meta.type === 'folder') {
        files.push({
          id: String(msg.message_id),
          name: meta.name,
          type: 'folder',
          size: '-',
          modified: meta.label || '',
          icon: 'fa-folder',
          path: meta.path || 'root',
          messageId: msg.message_id,
        });
      } else if (fileId) {
        files.push({
          id: String(msg.message_id),
          name: meta.name,
          type: getFileCategory(meta.name, meta.mime),
          size: formatBytes(meta.size),
          modified: meta.label || '',
          icon: getFileIcon(meta.name),
          path: meta.path || 'root',
          telegramFileId: fileId,
          messageId: msg.message_id,
          mimeType: meta.mime,
        });
      }
    }

    files.sort((a, b) => b.messageId - a.messageId);

    return res.status(200).json({ success: true, files, profileFileId, profileMsgId });
  } catch {
    return res.status(500).json({ success: false, error: 'Sync gagal' });
  }
}

async function fetchMessages(TOKEN, CHAT_ID) {
  const all = [];
  // Telegram getUpdates without ack offset returns ALL pending updates
  // We use offset=-1 to never consume/acknowledge them, so they stay fetchable
  // This is the correct approach for using Telegram as persistent storage with bot API
  try {
    // Fetch with large negative offset ensures we get all available history
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?limit=100&offset=-1&allowed_updates=["message"]`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.ok) return all;

    for (const u of (d.result || [])) {
      if (u.message && String(u.message.chat.id) === String(CHAT_ID)) {
        all.push(u.message);
      }
    }

    // If we have 100 results, paginate back to get more
    if (d.result?.length === 100) {
      let minUpdateId = Math.min(...d.result.map(u => u.update_id));
      while (true) {
        const r2 = await fetch(
          `https://api.telegram.org/bot${TOKEN}/getUpdates?limit=100&offset=${minUpdateId - 100}&allowed_updates=["message"]`
        );
        const d2 = await r2.json();
        if (!d2.ok || !d2.result?.length) break;
        let gotNew = false;
        for (const u of d2.result) {
          if (u.update_id < minUpdateId) {
            minUpdateId = u.update_id;
            if (u.message && String(u.message.chat.id) === String(CHAT_ID)) {
              all.push(u.message);
              gotNew = true;
            }
          }
        }
        if (!gotNew) break;
      }
    }
  } catch {}
  return all;
}

function getFileCategory(name, mime) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes(ext)) return 'image';
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return 'video';
  if (['mp3','wav','ogg','flac','aac','m4a','opus'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'zip';
  return (mime || '').split('/')[0] || 'file';
}
function getFileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const m = {
    pdf:'fa-file-pdf',jpg:'fa-file-image',jpeg:'fa-file-image',png:'fa-file-image',gif:'fa-file-image',
    webp:'fa-file-image',svg:'fa-file-image',bmp:'fa-file-image',avif:'fa-file-image',
    mp4:'fa-file-video',mov:'fa-file-video',avi:'fa-file-video',mkv:'fa-file-video',webm:'fa-file-video',
    mp3:'fa-file-audio',wav:'fa-file-audio',ogg:'fa-file-audio',flac:'fa-file-audio',aac:'fa-file-audio',m4a:'fa-file-audio',
    zip:'fa-file-zipper',rar:'fa-file-zipper','7z':'fa-file-zipper',tar:'fa-file-zipper',gz:'fa-file-zipper',
    js:'fa-file-code',ts:'fa-file-code',jsx:'fa-file-code',tsx:'fa-file-code',html:'fa-file-code',
    css:'fa-file-code',json:'fa-file-code',py:'fa-file-code',doc:'fa-file-word',docx:'fa-file-word',
    xls:'fa-file-excel',xlsx:'fa-file-excel',ppt:'fa-file-powerpoint',pptx:'fa-file-powerpoint',
    txt:'fa-file-lines',md:'fa-file-lines',
  };
  return m[ext] || 'fa-file';
}
function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
}
