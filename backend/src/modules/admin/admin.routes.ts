import { Router } from 'express';
import { authenticate, getAuth, requireRole } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { setStatusSchema, userIdParams } from './admin.schemas';
import { adminService } from './admin.service';

export const adminRoutes = Router();

adminRoutes.use(authenticate, requireRole('super_admin'));

adminRoutes.patch(
  '/users/:id/status',
  validate({ params: userIdParams, body: setStatusSchema }),
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    res.json(await adminService.setUserStatus(getAuth(res).userId, String(req.params.id), status, reason, req.ip));
  }),
);
