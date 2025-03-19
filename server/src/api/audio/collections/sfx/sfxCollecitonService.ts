import * as sfxModel from './sfxCollectionModel.js';

// Interface for standardized service responses
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  notFound?: boolean;
}

export async function getAllSfxCollections(): Promise<ServiceResponse<any[]>> {
  try {
    const collections = await sfxModel.getAllSfxCollections();
    return { success: true, data: collections };
  } catch (error) {
    console.error('Service error getting all SFX collections:', error);
    return { success: false, error: 'Failed to retrieve SFX collections' };
  }
}

export default {
  getAllSfxCollections
};

