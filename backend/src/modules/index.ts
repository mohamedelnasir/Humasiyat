import { Router } from 'express';
import { adminRoutes } from './admin/admin.routes';
import { authRoutes } from './auth/auth.routes';
import { usersRoutes } from './users/users.routes';

/** Module routers mounted under /api/v1, registered as each module is built. */
export const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/admin', adminRoutes);
