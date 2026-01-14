import { Router } from 'express';
import escrowRouter from './escrow/index.routes.js';

const router = Router();

// Mount all escrow routes
router.use('/', escrowRouter);

export default router;
