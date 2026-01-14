import { Router } from 'express';
import indexRoutes from './routes/index.routes.js';
import escrowRoutes from './routes/escrow.routes.js';

const apiRouter = Router();

// Mount index routes
apiRouter.use('/', indexRoutes);

// Mount escrow routes
apiRouter.use('/api/escrow', escrowRoutes);

export default apiRouter;
