export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ success: false }), { status: 405 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    try {
        const formData = await req.formData();
        const file = formData.get('file');
        const account = formData.get('account') || 'Unknown';

        if (!file) {
            return new Response(JSON.stringify({ success: false }), { status: 400 });
        }

        const ip = req.headers.get('x-forwarded-for') || 'Unknown IP';
        const caption = `*IP:* ${ip}\n*Account:* ${account}\n*Filename:* ${file.name}`;

        const tgFormData = new FormData();
        tgFormData.append('chat_id', chatId);
        tgFormData.append('caption', caption);
        tgFormData.append('document', file);
        tgFormData.append('parse_mode', 'Markdown');

        const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            body: tgFormData
        });

        const tgData = await tgRes.json();

        if (!tgData.ok) {
            return new Response(JSON.stringify({ success: false }), { status: 500 });
        }

        const fileId = tgData.result.document.file_id;
        const ext = file.name.split('.').pop();
        const urlPath = `/api/f?id=${fileId}&ext=${ext}`;

        return new Response(JSON.stringify({
            success: true,
            filename: file.name,
            fileId: fileId,
            url: urlPath,
            data: tgData.result
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ success: false }), { status: 500 });
    }
}import