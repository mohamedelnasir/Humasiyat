import { isProduction } from '../config/env';
import { logger } from '../config/logger';

export interface MessageRecipient {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
}

/**
 * Delivery channel for transactional messages (password reset now, more later).
 * The real email/SMS provider is plugged in here once chosen.
 */
export interface Messenger {
  sendPasswordReset(input: { to: MessageRecipient; token: string; expiresAt: Date }): Promise<void>;
}

class LogMessenger implements Messenger {
  async sendPasswordReset({ to, token, expiresAt }: { to: MessageRecipient; token: string; expiresAt: Date }) {
    if (isProduction) {
      logger.error({ userId: to.id }, 'Password reset requested but no email/SMS provider is configured');
      return;
    }
    // Development only: the token is never logged in production.
    logger.info({ userId: to.id, token, expiresAt }, 'DEV password reset token (no provider configured)');
  }
}

let messenger: Messenger = new LogMessenger();

export const getMessenger = (): Messenger => messenger;
export const setMessenger = (m: Messenger): void => {
  messenger = m;
};
