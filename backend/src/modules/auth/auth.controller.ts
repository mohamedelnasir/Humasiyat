import type { Request } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { asyncHandler } from '../../utils/asyncHandler';
import { authService, type RequestContext } from './auth.service';

const ctxOf = (req: Request): RequestContext => ({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined });

export const authController = {
  register: asyncHandler(async (req, res) => {
    res.status(201).json(await authService.register(req.body, ctxOf(req)));
  }),

  login: asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    res.json(await authService.login(identifier, password, ctxOf(req)));
  }),

  refresh: asyncHandler(async (req, res) => {
    res.json(await authService.refresh(req.body.refreshToken, ctxOf(req)));
  }),

  logout: asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    res.status(204).end();
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body.identifier, ctxOf(req));
    res.json({ message: 'If an account exists, reset instructions have been sent.' });
  }),

  resetPassword: asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.newPassword, ctxOf(req));
    res.status(204).end();
  }),

  changePassword: asyncHandler(async (req, res) => {
    const { userId } = getAuth(res);
    res.json(await authService.changePassword(userId, req.body.currentPassword, req.body.newPassword, ctxOf(req)));
  }),
};
