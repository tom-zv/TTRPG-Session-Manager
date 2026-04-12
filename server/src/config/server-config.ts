import * as dotenv from 'dotenv';
import path from 'path';

// Initialize dotenv to load environment variables from .env file
dotenv.config();

// Calculate base directories for the application
export const rootDir = process.cwd();
export const publicDir = path.join(rootDir, 'public');


// Database configuration
export interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  port?: number;
}

// Server configuration
export interface ServerConfig {
  port: number;
  host: string;
  clientOrigin: string;
  rootDir: string;
  publicDir: string;
  audioDir: string;
}

// Load database configuration from environment variables
export const getDatabaseConfig = (): DatabaseConfig => {
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306
  };
};

// Load server configuration from environment variables
export const getServerConfig = (): ServerConfig => {
  return {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    host: process.env.HOST || '0.0.0.0',
    clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    rootDir,
    publicDir,
    audioDir: process.env.AUDIO_DIR || path.join(publicDir, 'audio'),
  };
};

// Export configurations
export const dbConfig = getDatabaseConfig();
export const serverConfig = getServerConfig();
