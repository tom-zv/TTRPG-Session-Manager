import mysql from 'mysql2/promise';
import { DatabaseConfig, dbConfig} from './config/server-config.js';

// Interface for MySQL insert result
export interface QueryResult {
  insertId?: number;
  affectedRows?: number;
  changedRows?: number;
}

const pool = mysql.createPool(dbConfig as DatabaseConfig);

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

// Execute a query with parameters
export const executeQuery = async <T>(sql: string, params?: any[]): Promise<T[]> => {
  try {
    const [results] = await pool.execute(sql, params);
    return results as T[];
  } catch (err) {
    console.error('Error executing query:', err);
    throw err;
  }
};

export default {
  getConnection,
  executeQuery
};
