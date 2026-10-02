import nodemailer from "nodemailer";
import logger from "./logger.js";

let cachedTransporter = null;

export function useRealEmailOTP() {
  return (
    process.env.USE_REAL_EMAIL_OTP === "true" ||
    process.env.USE_REAL_EMAIL_OTP === "1"
  );
}

function parseSmtpPort() {
  return parseInt(process.env.SMTP_PORT || "587", 10);
}

function parseSmtpSecure(port) {
  if (process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1") {
    return true;
  }

  if (process.env.SMTP_SECURE === "false" || process.env.SMTP_SECURE === "0") {
    return false;
  }

  return port === 465;
}

function getMailFrom() {
  const fromAddress = String(process.env.MAIL_FROM || "").trim();
  const fromName = String(process.env.MAIL_FROM_NAME || "").trim();

  if (!fromAddress) {
    const error = new Error("MAIL_FROM is required for email OTP delivery");
    error.statusCode = 500;
    throw error;
  }

  return fromName ? `${fromName} <${fromAddress}>` : fromAddress;
}

function getTransportConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = parseSmtpPort();
  const secure = parseSmtpSecure(port);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host) {
    const error = new Error("SMTP_HOST is required for email OTP delivery");
    error.statusCode = 500;
    throw error;
  }

  if (!Number.isFinite(port) || port <= 0) {
    const error = new Error("SMTP_PORT must be a valid number");
    error.statusCode = 500;
    throw error;
  }

  if ((user && !pass) || (!user && pass)) {
    const error = new Error("SMTP_USER and SMTP_PASS must be provided together");
    error.statusCode = 500;
    throw error;
  }

  return {
    host,
    port,
    secure,
    ...(user && pass
      ? {
          auth: {
            user,
            pass,
          },
        }
      : {}),
  };
}

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(getTransportConfig());
  }

  return cachedTransporter;
}

export async function sendSellerVerificationOtpEmail({
  email,
  otp,
  expiresInMinutes,
}) {
  if (!useRealEmailOTP()) {
    logger.info("Seller email OTP generated in mock mode", {
      email,
      otp,
      mode: "mock",
    });
    return {
      delivered: false,
      mode: "mock",
    };
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: getMailFrom(),
    to: email,
    subject: "Verify your seller signup email",
    text: `Your seller signup verification code is ${otp}. This code expires in ${expiresInMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a;">
        <p>Your seller signup verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otp}</p>
        <p>This code expires in ${expiresInMinutes} minutes.</p>
      </div>
    `,
  });

  return {
    delivered: true,
    mode: "real",
  };
}

export async function sendApplicationRejectionEmail({ email, name, reason, type }) {
  if (!useRealEmailOTP()) {
    logger.info("Application rejection email in mock mode", { email, type, reason, mode: "mock" });
    return { delivered: false, mode: "mock" };
  }

  const transporter = getTransporter();
  const label = type === "seller" ? "Seller" : "Delivery Partner";
  const reRegisterNote =
    type === "seller"
      ? "You may re-apply by visiting the seller registration page and submitting a new application."
      : "You may re-register by visiting the delivery partner registration page.";

  await transporter.sendMail({
    from: getMailFrom(),
    to: email,
    subject: `Your ${label} Application — Action Required`,
    text: `Hi ${name},\n\nUnfortunately your ${label.toLowerCase()} application has been rejected.\n\nReason: ${reason}\n\n${reRegisterNote}\n\nIf you believe this is a mistake, please contact our support team.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 560px;">
        <p>Hi <strong>${name}</strong>,</p>
        <p>Unfortunately, your <strong>${label}</strong> application has been <span style="color:#dc2626;font-weight:700;">rejected</span>.</p>
        <div style="margin:20px 0;padding:14px 18px;border-left:4px solid #dc2626;background:#fef2f2;border-radius:6px;">
          <p style="margin:0;font-size:13px;color:#7f1d1d;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Rejection Reason</p>
          <p style="margin:6px 0 0;color:#1e293b;">${reason}</p>
        </div>
        <p>${reRegisterNote}</p>
        <p style="color:#64748b;font-size:13px;">If you believe this is a mistake, please contact our support team.</p>
      </div>
    `,
  });

  return { delivered: true, mode: "real" };
}

export function __resetEmailTransportForTests() {
  cachedTransporter = null;
}
