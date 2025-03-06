import * as dotenv from 'dotenv';

// Initialize dotenv to load environment variables from .env file
dotenv.config();

// Database configuration
export interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port?: number;
}

// Server configuration
export interface ServerConfig {
  port: number;
}

// Load database configuration from environment variables
export const getDatabaseConfig = (): DatabaseConfig => {
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'DND',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306
  };
};

// Load server configuration from environment variables
export const getServerConfig = (): ServerConfig => {
  return {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000
  };
};

// Export configurations
export const dbConfig = getDatabaseConfig();
export const serverConfig = getServerConfig();
