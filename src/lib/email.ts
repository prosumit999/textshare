import nodemailer from 'nodemailer';

export async function sendAdminVerificationCode(to: string, code: string) {
  const user = import.meta.env.GMAIL_USER || process.env.GMAIL_USER || 'prosumit999@gmail.com';
  const appPassword = import.meta.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  if (!appPassword) throw new Error('GMAIL_APP_PASSWORD is not configured.');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword }
  });

  await transporter.sendMail({
    from: `TextShare Security <${user}>`,
    to,
    subject: 'Your TextShare admin verification code',
    text: `Your TextShare admin verification code is ${code}. It expires in 10 minutes. If you did not request this, change your admin password immediately.`,
    html: `<p>Your TextShare admin verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request this, change your admin password immediately.</p>`
  });
}
