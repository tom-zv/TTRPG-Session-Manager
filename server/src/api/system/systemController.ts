import { Request, Response } from 'express';
import { serverConfig } from '../../config/server-config.js';

export const getServerInfo = (_req: Request, res: Response) => {
  // Get host and protocol from the request
  const host = _req.get('host') || serverConfig.host || 'localhost:3000';
  const protocol = _req.protocol || 'http';
  
  res.json({
    baseUrl: `${protocol}://${host}`,
    apiVersion: '1.0',
  });
};