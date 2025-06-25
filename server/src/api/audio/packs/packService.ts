import packModel from './packModel.js'
import { audioPool } from "src/db.js";
import { ValidationError, NotFoundError } from 'src/api/HttpErrors.js';
import { RowDataPacket } from 'mysql2';

export const getAllPacks = async (): Promise<RowDataPacket[]> => {
  try {
    return await packModel.getAllPacks();
  } catch (error) {
    console.error('Service error getting all packs:', error);
    throw error;
  }
};

export const createPack = async (name: string, description: string | null): Promise<RowDataPacket> => {
  try {
    if (!name) {
      throw new ValidationError('Pack name is required');
    }
    const insertId = await packModel.createPack(name, description);
    if (!insertId) {
      throw new Error('Failed to create pack');
    }
    const packs = await packModel.getAllPacks();
    const createdPack = packs.find(p => p.pack_id === insertId);
    if (!createdPack) {
      throw new Error('Pack created but could not be retrieved');
    }
    return createdPack;
  } catch (error) {
    console.error('Service error creating pack:', error);
    throw error;
  }
};

export const deletePack = async (packId: number): Promise<void> => {
  try {
    const packs = await packModel.getAllPacks();
    const packExists = packs.some(pack => pack.pack_id === packId);
    if (!packExists) {
      throw new NotFoundError('Pack not found');
    }
    const affectedRows = await packModel.deletePack(packId);
    if (!affectedRows) {
      throw new Error('Failed to delete pack');
    }
  } catch (error) {
    console.error(`Service error deleting pack ${packId}:`, error);
    throw error;
  }
};

export const addCollectionToPack = async (
  packId: number,
  collectionId: number,
): Promise<void> => {
  try {
    // Verify the pack exists
    const packs = await packModel.getAllPacks();
    const packExists = packs.some(pack => pack.pack_id === packId);
    if (!packExists) {
      throw new NotFoundError('Pack not found');
    }
    // Verify the collection exists (without checking specific type)
    const collections = await audioPool.execute(
      `SELECT id FROM collections WHERE id = ?`,
      [collectionId]
    );
    if (!collections[0] || (collections[0] as any[]).length === 0) {
      throw new NotFoundError('Collection not found');
    }
    const affectedRows = await packModel.addCollectionToPack(packId, collectionId);
    if (affectedRows === 0) {
      throw new Error('Failed to add collection to pack');
    }
  } catch (error) {
    console.error(`Service error adding collection ${collectionId} to pack ${packId}:`, error);
    throw error;
  }
};

export const getPackCollections = async (packId: number): Promise<RowDataPacket[]> => {
  try {
    // Verify the pack exists
    const packs = await packModel.getAllPacks();
    const packExists = packs.some(pack => pack.pack_id === packId);
    if (!packExists) {
      throw new NotFoundError('Pack not found');
    }
    return await packModel.getPackCollections(packId);
  } catch (error) {
    console.error(`Service error getting collections for pack ${packId}:`, error);
    throw error;
  }
};

export default {
  getAllPacks,
  createPack,
  deletePack,
  addCollectionToPack,
  getPackCollections
};
