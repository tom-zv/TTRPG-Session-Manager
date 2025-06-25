import { Request, Response, NextFunction } from 'express';
import packService from './packService.js';
import { ValidationError } from 'src/api/HttpErrors.js';

export const getAllPacks = async (
  _req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const packs = await packService.getAllPacks();
    res.status(200).json(packs);
  } catch (error) {
    next(error);
  }
};

export const createPack = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      throw new ValidationError('Pack name is required');
    }
    const pack = await packService.createPack(name, description || null);
    res.status(201).json(pack);
  } catch (error) {
    next(error);
  }
};

export const deletePack = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      throw new ValidationError('Invalid pack ID');
    }
    await packService.deletePack(id);
    res.status(200).json({ message: 'Pack deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const addCollectionToPack = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const packId = parseInt(req.params.id);
    const { collectionId } = req.body;
    if (isNaN(packId) || !collectionId) {
      throw new ValidationError('Invalid pack ID or collection ID');
    }
    await packService.addCollectionToPack(packId, collectionId);
    res.status(201).json({ message: 'Collection added to pack' });
  } catch (error) {
    next(error);
  }
};

export const getPackCollections = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const packId = parseInt(req.params.id);
    if (isNaN(packId)) {
      throw new ValidationError('Invalid pack ID');
    }
    const collections = await packService.getPackCollections(packId);
    res.status(200).json(collections);
  } catch (error) {
    next(error);
  }
};

export default {
  getAllPacks,
  createPack,
  deletePack,
  addCollectionToPack,
  getPackCollections
};
