// Za3fran — Cloudflare Email Worker for brain@za3fran.io (Brain Inbox bi-1.0.0, 29 Oct 2026)
// Paste this whole file into the Worker "brain-inbox" (Cloudflare → Workers & Pages → brain-inbox → Edit code).
// Secrets (Worker → Settings → Variables and Secrets):
//   BRAIN_INBOX_SECRET  ← the secret Claude gave you in the chat (type "Secret")
//   FALLBACK_TO         ← optional: arnaudhebrard@gmail.com — if the site cannot take the message, it is forwarded there
//                         instead of being lost (must be a verified destination in Email Routing)
// No other setting. The Worker keeps nothing: it hands the raw message to za3fran.io and stops.

const API = 'https://www.za3fran.io/api/brain-inbox';

export default {
  async email(message, env) {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.BRAIN_INBOX_SECRET };
    try {
      // 1. Ask the site for a private upload slot (the site checks the sender).
      const init = await fetch(API, {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'email-init', from: message.from, to: message.to, size: message.rawSize }),
      });
      if (init.status === 403) { message.setReject('Sender not allowed'); return; }
      if (init.status === 413) { message.setReject('Message too large (25 MB maximum)'); return; }
      if (!init.ok) throw new Error('init ' + init.status);
      const { id, upload_url } = await init.json();

      // 2. Upload the raw message straight to the private storage bucket.
      const raw = await new Response(message.raw).arrayBuffer();
      const up = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': 'message/rfc822', 'x-upsert': 'true' }, body: raw });
      if (!up.ok) throw new Error('upload ' + up.status);

      // 3. Tell the site the message is there: it reads it and Claude prepares it for review.
      const done = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ action: 'email-commit', id }) });
      if (!done.ok) throw new Error('commit ' + done.status);
    } catch (e) {
      console.log('brain-inbox worker error: ' + e.message);
      if (env.FALLBACK_TO) await message.forward(env.FALLBACK_TO);
      else message.setReject('Temporary error, please resend later');
    }
  },
};
