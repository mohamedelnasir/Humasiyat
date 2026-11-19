import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authRateLimiters } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { authController as c } from './auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.schemas';

export const authRoutes = Router();

authRoutes.post('/register', ...authRateLimiters, validate({ body: registerSchema }), c.register);
authRoutes.post('/login', ...authRateLimiters, validate({ body: loginSchema }), c.login);
authRoutes.post('/refresh', validate({ body: refreshSchema }), c.refresh);
authRoutes.post('/logout', validate({ body: logoutSchema }), c.logout);
authRoutes.post('/forgot-password', ...authRateLimiters, validate({ body: forgotPasswordSchema }), c.forgotPassword);
authRoutes.post('/reset-password', ...authRateLimiters, validate({ body: resetPasswordSchema }), c.resetPassword);
authRoutes.post('/change-password', authenticate, validate({ body: changePasswordSchema }), c.changePassword);
