import * as sfxService from './sfxCollecitonService.js';
import { Request, Response } from 'express';

export const getAllSfxCollections = async (_req: Request, res: Response) => {
  const response = await sfxService.getAllSfxCollections();
  
  if (response.success) {
    res.status(200).json(response.data);
  } else {
    res.status(500).json({ error: response.error });
  }
};

export default {
    getAllSfxCollections
}