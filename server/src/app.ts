import express from 'express';
import http from 'http';
import cors from 'cors';
import { serverConfig } from './config/server-config.js';
import authRoutes from './api/auth/authRoutes.js';
import userRoutes from './api/users/userRoutes.js';
import campaignRoutes from './api/campaigns/campaignRoutes.js';
import audioRoutes from './api/audio/audioRoutes.js';
import entityRoutes from './api/encounter/entities/entityRoutes.js';
import spellRoutes from './api/encounter/spells/spellRoutes.js';
import itemRoutes from './api/encounter/items/itemRoutes.js';
import { HttpError } from './api/HttpErrors.js';
import { INVENTORY_LIMITS } from 'shared/domain/encounters/dnd5e/inventory.js';
import encounterRoutes from './api/encounter/encounters/encounterRoutes.js';
import path from 'path';
import { initSocketServer } from './socket/index.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Middleware Configuration
  // -----------------------

  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://localhost:3000',
    serverConfig.clientOrigin,
  ]);

  app.use(cors({
    origin: (origin, cb) => {
      // allow server-to-server / curl - no Origin header
      if (!origin) return cb(null, true);

      // allow explicit list
      if (allowedOrigins.has(origin)) return cb(null, true);

      // allow LAN dev origins on Vite port
      if (/^http:\/\/192\.168\.\d+\.\d+:5173$/.test(origin)) return cb(null, true);

      return cb(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true
  }));


  // Routes whose valid bodies exceed Express's 100 KiB default get their own bounded parser. A body
  // over the bound is a deliberate 413; every other route keeps the default.
  const boundedJson = (limit: number | string, tooLarge: string): express.RequestHandler => {
    const parse = express.json({ limit });
    return (req, res, next) => {
      parse(req, res, (error?: unknown) => {
        if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
          return next(new HttpError(413, tooLarge));
        }
        next(error);
      });
    };
  };

  // A full item snapshot can contain a 65,535-character description plus bounded lists.
  // 1 MiB covers those fields even when JSON escapes each UTF-16 code unit as six bytes.
  app.use('/api/dnd5e/items', boundedJson('1mb', 'Item request body exceeds 1 MiB.'));
  // A full inventory replacement: every row at its name and notes limits, each code unit escaped
  // as six bytes (\uXXXX), plus room for the keys, numbers and link of each row.
  const inventoryBodyLimit = INVENTORY_LIMITS.items * ((INVENTORY_LIMITS.name + INVENTORY_LIMITS.notes) * 6 + 256) + 1024;
  app.put('/api/dnd5e/entities/:id/inventory', boundedJson(inventoryBodyLimit, 'Inventory request body is too large.'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static File Serving
  // -----------------
  // Serve static audiofiles from the public directory
  app.use('/audio', express.static(path.join(serverConfig.rootDir, 'public/audio')));
  app.use('/images', express.static(path.join(serverConfig.rootDir, 'public/images')));

  // API Routes
  // ---------
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/campaigns', campaignRoutes);
  app.use('/api/audio', audioRoutes);
  app.use('/api/dnd5e/spells', spellRoutes);
  app.use('/api/dnd5e/items', itemRoutes);
  app.use('/api/:system/entities', entityRoutes);
  app.use('/api/:system/encounters', encounterRoutes);

  // Production Configuration
  // ----------------------
  // Serve static files
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(serverConfig.rootDir, '../client/dist')));

    // Handle any requests that don't match the API routes
    app.get('*', (_req, res) => {
      res.sendFile(path.join(serverConfig.rootDir, '../client/dist/index.html'));
    });
  }

  app.use(errorHandler);


  return app;
}

export function createServer() {
  const app = createApp();
  const httpServer = http.createServer(app);
  const io = initSocketServer(httpServer);
  return { app, httpServer, io };
}
