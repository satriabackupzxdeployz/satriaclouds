export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ success: false }), { status: 405 });
    }

    try {
        const body = await req.json();
        const { action, account, details } = body;
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        const ip = req.headers.get('x-forwarded-for') || 'Unknown IP';

        let message = `*SatriaClouds Activity*\n\n*IP:* ${ip}\n*Account:* ${account}\n*Action:* ${action}\n*Details:* ${details}`;

        if (action === 'Login') {
            message = `*New User Login*\n\n*IP:* ${ip}\n*Account:* ${account}\n*Status:* Success via Google Auth`;
        }

        const tgFormData = new FormData();
        tgFormData.append('chat_id', chatId);
        tgFormData.append('text', message);
        tgFormData.append('parse_mode', 'Markdown');

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            body: tgFormData
        });

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ success: false }), { status: 500 });
    }
}export