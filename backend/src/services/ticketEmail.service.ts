import nodemailer from "nodemailer";

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !pass || !from) {
    return null;
  }

  return { host, port, user, pass, from };
};

export const isTicketEmailConfigured = (): boolean => getSmtpConfig() !== null;

export const sendTicketEmail = async (params: {
  to: string;
  subject: string;
  pdfBase64: string;
  pdfFilename?: string;
}): Promise<void> => {
  const smtp = getSmtpConfig();
  if (!smtp) {
    throw new Error(
      "El servicio de correo no está configurado. Contacte al administrador del sistema."
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${params.subject}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
          <h2 style="margin:0 0 12px 0;font-size:18px;color:#1e3a8a;">LYFRGL POS</h2>
          <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;">
            Adjunto encontrará su comprobante en formato PDF, con el mismo diseño mostrado en caja.
          </p>
          <p style="margin:0;font-size:13px;color:#64748b;">
            Asunto: <strong>${params.subject}</strong>
          </p>
        </div>
        <p style="max-width:520px;margin:12px auto 0;font-size:11px;color:#64748b;text-align:center;">
          Comprobante generado por LYFRGL POS
        </p>
      </body>
    </html>
  `;

  await transporter.sendMail({
    from: smtp.from,
    to: params.to,
    subject: params.subject,
    html,
    attachments: [
      {
        filename: params.pdfFilename?.trim() || "ticket.pdf",
        content: Buffer.from(params.pdfBase64, "base64"),
        contentType: "application/pdf",
      },
    ],
  });
};
