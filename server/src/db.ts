import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { dbConfig} from './config/server-config.js';

export const audioPool = mysql.createPool({...dbConfig, database: 'audio'});
export const corePool = mysql.createPool({...dbConfig, database: 'core'});
export const dnd5ePool = mysql.createPool({...dbConfig, database: 'dnd5e'});

/** A pool or a connection inside a transaction. Models that may join a transaction accept one. */
export type SqlExecutor = Pick<Pool | PoolConnection, 'execute'>;

/**
 * Run `task` on one connection of `pool` inside a transaction: committed when it resolves, rolled
 * back when it throws. Every schema is on the same server, so qualified names of other schemas
 * join the same transaction.
 */
export async function withTransaction<T>(pool: Pool, task: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await task(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Function to get a connection from a specific pool
export const getConnection = async (database = 'audio') => {
  try {
    let connection;
    switch (database) {
      case 'core':
        connection = await corePool.getConnection();
        break;
      case 'dnd5e':
        connection = await dnd5ePool.getConnection();
        break;
      case 'audio':
      default:
        connection = await audioPool.getConnection();
    }
    console.log(`Connected to the ${database} database.`);
    return connection;
  } catch (err) {
    console.error(`Error connecting to the ${database} database:`, err);
    throw err;
  }
};

export default {
  getConnection,
  audioPool,
  corePool,
  dnd5ePool
};