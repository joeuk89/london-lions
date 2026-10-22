import { readFile } from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { body, isEmpty, subject } from './notice.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: node src/sync/send-email.js <notice.json>');
  process.exit(2);
}

const notice = JSON.parse(await readFile(file, 'utf8'));
if (isEmpty(notice)) {
  console.log('Notice is empty; no email sent.');
  process.exit(0);
}

const { GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO } = process.env;
if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !MAIL_TO) {
  console.log('GMAIL_USER, GMAIL_APP_PASSWORD or MAIL_TO not set; no email sent.');
  process.exit(0);
}

const transport = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

const result = await transport.sendMail({
  from: `London Lions fixtures <${GMAIL_USER}>`,
  to: MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean),
  subject: subject(notice),
  text: body(notice),
});
console.log(`Sent ${result.messageId} to ${MAIL_TO}`);
