import express from 'express';
import { getServerInfo } from './systemController.js';

const router = express.Router();

router.get('/server-info', getServerInfo);

export default router;