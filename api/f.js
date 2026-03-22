export const config = { runtime: 'edge' };

export default async function handler(req) {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('id');
    const ext = url.searchParams.get('ext') || 'bin';
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!fileId) {
        return new Response('Invalid request', { status: 400 });
    }

    try {
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
        const fileInfo = await fileInfoRes.json();

        if (!fileInfo.ok) {
            return new Response('File not found in Telegram', { status: 404 });
        }

        const filePath = fileInfo.result.file_path;
        const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);

        return new Response(fileRes.body, {
            headers: {
                'Content-Type': fileRes.headers.get('content-type') || 'application/octet-stream',
                'Content-Disposition': `inline; filename="${fileId}.${ext}"`
            }
        });
    } catch (e) {
        return new Response('Error fetching file', { status: 500 });
    }
}