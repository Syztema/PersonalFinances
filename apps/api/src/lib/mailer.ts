import nodemailer from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createMailer(config: AppConfig, log: FastifyBaseLogger): Mailer {
  const smtp = config.smtp;
  if (smtp) {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    return {
      async send(message) {
        await transport.sendMail({ from: smtp.from, ...message });
      },
    };
  }
  return {
    async send(message) {
      if (config.nodeEnv !== 'development') {
        log.warn('SMTP no configurado: no se envió el correo');
        return;
      }
      log.info({ mail: message }, 'Correo de desarrollo (SMTP no configurado)');
    },
  };
}

export class MemoryMailer implements Mailer {
  readonly messages: MailMessage[] = [];
  async send(message: MailMessage) {
    this.messages.push(message);
  }
}
