import mysql from 'mysql2/promise';
import { DatabaseConfig, dbConfig} from './config/server-config.js';

// Interface for MySQL insert/update/delete result
export interface QueryResult {
  fieldCount?: number;
  affectedRows?: number;
  insertId?: number;
  info?: string;
  serverStatus?: number;
  warningStatus?: number;
  changedRows?: number;
}

export const pool = mysql.createPool(dbConfig as DatabaseConfig);

// Function to get a connection from the pool
export const getConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to the database.');
    return connection;
  } catch (err) {
    console.error('Error connecting to the database:', err);
    throw err;
  }
};

export default {
  getConnection
};
