import mysql from 'mysql2/promise';
import { dbConfig} from './config/server-config.js';

export const audioPool = mysql.createPool({...dbConfig, database: 'audio'});
export const corePool = mysql.createPool({...dbConfig, database: 'core'});
export const dnd5ePool = mysql.createPool({...dbConfig, database: 'dnd5e'});

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