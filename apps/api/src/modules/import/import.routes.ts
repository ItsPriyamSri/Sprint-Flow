import { Router, type IRouter } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import * as ctrl from './import.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB hard limit (env check inside controller)
});

const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many import attempts — try again in a minute' } },
});

export const importRouter: IRouter = Router();

importRouter.use(requireAuth);

importRouter.post('/', importLimiter, upload.single('file'), ctrl.upload);
importRouter.get('/:importId/preview', ctrl.preview);
importRouter.patch('/:importId/mapping', ctrl.updateMapping);
importRouter.post('/:importId/commit', ctrl.commit);
importRouter.post('/:importId/rollback', ctrl.rollback);
