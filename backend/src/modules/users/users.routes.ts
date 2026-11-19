import { Router } from 'express';
import { authenticate, getAuth } from '../../middleware/authenticate';
import { asyncHandler } from '../../utils/asyncHandler';
import { usersService } from './users.service';

export const usersRoutes = Router();

usersRoutes.get(
  '/me',
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json(await usersService.getById(getAuth(res).userId));
  }),
);
