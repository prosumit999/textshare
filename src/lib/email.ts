import nodemailer from "nodemailer";
import { serverEnv } from "./env";

function mailTransport() {
  const user = serverEnv.GMAIL_USER || "prosumit999@gmail.com";
  const appPassword = serverEnv.GMAIL_APP_PASSWORD;
  if (!appPassword) throw new Error("GMAIL_APP_PASSWORD is not configured.");
  return {
    user,
    transporter: nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: appPassword },
    }),
  };
}

export async function sendAdminVerificationCode(to: string, code: string) {
  const { user, transporter } = mailTransport();

  await transporter.sendMail({
    from: `TextShare Security <${user}>`,
    to,
    subject: "Your TextShare admin verification code",
    text: `Your TextShare admin verification code is ${code}. It expires in 10 minutes. If you did not request this, change your admin password immediately.`,
    html: `<p>Your TextShare admin verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request this, change your admin password immediately.</p>`,
  });
}

export async function sendEmailVerification(to: string, verificationUrl: string) {
  const { user, transporter } = mailTransport();
  await transporter.sendMail({
    from: `TextShare <${user}>`,
    to,
    subject: "Verify your TextShare email",
    text: `Verify your TextShare email by opening this link:\n\n${verificationUrl}\n\nThis link expires in 30 minutes. If you did not create this account, ignore this message.`,
    html: `<p>Welcome to TextShare.</p><p><a href="${verificationUrl}">Verify your email address</a></p><p>This single-use link expires in 30 minutes. If you did not create this account, ignore this message.</p>`,
  });
}

export async function sendPasswordReset(to: string, resetUrl: string) {
  const { user, transporter } = mailTransport();
  await transporter.sendMail({
    from: `TextShare Security <${user}>`,
    to,
    subject: "Reset your TextShare password",
    text: `Reset your TextShare password by opening this link:\n\n${resetUrl}\n\nThis single-use link expires in 30 minutes. If you did not request this, your password has not changed.`,
    html: `<p>A password reset was requested for your TextShare account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This single-use link expires in 30 minutes. If you did not request this, your password has not changed.</p>`,
  });
}

export async function sendEmailChangeVerification(to: string, verificationUrl: string) {
  const { user, transporter } = mailTransport();
  await transporter.sendMail({
    from: `TextShare Security <${user}>`,
    to,
    subject: "Confirm your new TextShare email",
    text: `Confirm this as your new TextShare email:\n\n${verificationUrl}\n\nThis single-use link expires in 30 minutes.`,
    html: `<p>Confirm this as your new TextShare email address.</p><p><a href="${verificationUrl}">Confirm email change</a></p><p>This single-use link expires in 30 minutes.</p>`,
  });
}

export async function sendSupportMessage(fromName: string, fromEmail: string, message: string) {
  const { user, transporter } = mailTransport();
  const to = serverEnv.SUPPORT_EMAIL || serverEnv.SECURITY_ALERT_EMAIL || serverEnv.ADMIN_EMAIL || user;
  await transporter.sendMail({
    from: `TextShare Support <${user}>`,
    replyTo: fromEmail,
    to,
    subject: `TextShare support request from ${fromName.replace(/[\r\n]/g, " ")}`,
    text: `From: ${fromName} <${fromEmail}>\n\n${message}`,
  });
}

export async function sendSecurityAlert(
  subject: string,
  message: string,
  to = serverEnv.SECURITY_ALERT_EMAIL ||
    serverEnv.ADMIN_EMAIL ||
    serverEnv.GMAIL_USER,
) {
  if (serverEnv.EMAIL_DELIVERY_DISABLED === "true" && !import.meta.env.PROD)
    return false;
  const user = serverEnv.GMAIL_USER || "prosumit999@gmail.com";
  const appPassword = serverEnv.GMAIL_APP_PASSWORD;
  if (!to || !appPassword) {
    console.warn(
      JSON.stringify({
        event: "security_alert_email_unavailable",
        subject,
        at: new Date().toISOString(),
      }),
    );
    return false;
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: appPassword },
  });
  await transporter.sendMail({
    from: `TextShare Security <${user}>`,
    to,
    subject: `[TextShare Security] ${subject}`,
    text: `${message}\n\nTime: ${new Date().toISOString()}`,
  });
  return true;
}
