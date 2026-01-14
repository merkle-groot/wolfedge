import { Router } from 'express';
import metadataRoutes from './metadata.routes.js';
import actionRoutes from './action.routes.js';
import eventsRoutes from './events.routes.js';

const router = Router();

// Mount metadata routes
router.use('/', metadataRoutes);

// Mount action routes
router.use('/', actionRoutes);

// Mount events routes
router.use('/', eventsRoutes);

export default router;
