import macroModel from './macroModel.js';
import fileService from '../files/fileService.js';
import type { MacroFileDB } from '../types.js';


// Interface for standardized service responses
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  notFound?: boolean;
}

export async function getAllMacros(): Promise<ServiceResponse<any[]>> {
  try {
    const macros = await macroModel.getAllMacros();
    
    if (!macros || macros.length === 0) {
      return { success: true, data: [] };
    }
    
    // Transform data to match expected format
    const formattedMacros = macros.map(macro => ({
      id: macro.macro_id,
      name: macro.name,
      description: macro.description,
      item_count: macro.item_count
    }));
    
    return { success: true, data: formattedMacros };
  } catch (error) {
    console.error('Service error getting all macros:', error);
    return { success: false, error: 'Failed to retrieve macros' };
  }
}

export async function getMacroById(id: number): Promise<ServiceResponse<any>> {
  try {
    const macros = await macroModel.getMacroById(id);
    
    if (!macros || macros.length === 0) {
      return { 
        success: false, 
        notFound: true, 
        error: 'Macro not found' 
      };
    }
    
    // Format the macro data
    const macro = {
      id: macros[0].collection_id,
      name: macros[0].name,
      description: macros[0].description,
      volume: macros[0].volume || 1.0
    };
    
    return { success: true, data: macro };
  } catch (error) {
    console.error(`Service error getting macro ${id}:`, error);
    return { success: false, error: 'Failed to retrieve macro' };
  }
}

export async function getMacroWithFiles(id: number): Promise<ServiceResponse<any>> {
  try {
    // First get the macro
    const macroResponse = await getMacroById(id);
    
    if (!macroResponse.success) {
      return macroResponse;
    }
    
    // Get the files associated with this macro
    const files = await macroModel.getMacroFiles(id);
    
    // Validate and enhance file information using fileService where needed
    const enhancedFiles: MacroFileDB[] = await Promise.all(files.map(async (file) => {
      // Check if the file still exists in the database
      const audioFile = await fileService.getAudioFile(file.id);
      if (!audioFile) {
        // If file doesn't exist anymore, we'll use what we have from the macro files query
        return {
          id: file.id,
          name: file.name,
          audio_type: file.audio_type || 'sfx',
          duration: file.duration || 0,
          url: file.url || null,
          rel_path: file.rel_path || null,
          folder_id: file.folder_id || 0,
          added_at: file.added_at || new Date().toISOString(),
          volume: file.volume || 1.0,
          delay: file.delay || 0
        };
      }
      
      // If the file exists, merge properties to ensure we have the most current data
      return {
        id: file.id,
        name: audioFile.name || file.name,
        audio_type: audioFile.audio_type || file.audio_type || 'sfx',
        duration: audioFile.duration || file.duration || 0,
        url: audioFile.url || file.url || null,
        rel_path: audioFile.rel_path || file.rel_path || null,
        folder_id: audioFile.folder_id || file.folder_id || 0,
        added_at: audioFile.added_at || file.added_at || new Date().toISOString(),
        volume: file.volume || 1.0,
        delay: file.delay || 0
      };
    }));
    
    // Add files to the macro data
    const result = {
      ...macroResponse.data,
      files: enhancedFiles
    };
    
    return { success: true, data: result };
  } catch (error) {
    console.error(`Service error getting macro with files ${id}:`, error);
    return { success: false, error: 'Failed to retrieve macro with files' };
  }
}

export async function createMacro(name: string, description: string | null): Promise<ServiceResponse<any>> {
  try {
    // Validate input
    if (!name || name.trim() === '') {
      return { success: false, error: 'Macro name is required' };
    }
    
    // Create the macro in the database
    const macroId = await macroModel.createMacro(name, description);
    
    if (!macroId) {
      return { success: false, error: 'Failed to create macro' };
    }
    
    // Get the newly created macro to return complete data
    const macros = await macroModel.getMacroById(macroId);
    
    if (!macros || macros.length === 0) {
      return { success: true, data: { id: macroId, name, description } };
    }
    
    const macro = {
      id: macros[0].collection_id,
      name: macros[0].name,
      description: macros[0].description
    };
    
    return { success: true, data: macro };
  } catch (error) {
    console.error('Service error creating macro:', error);
    return { success: false, error: 'Failed to create macro' };
  }
}

export async function addFileToMacro(
  macroId: number,
  fileId: number,
  delay: number = 0
): Promise<ServiceResponse<void>> {
  try {
    // Check if macro exists
    const macros = await macroModel.getMacroById(macroId);
    
    if (!macros || macros.length === 0) {
      return { 
        success: false, 
        notFound: true, 
        error: 'Macro not found' 
      };
    }
    
    // Check if file exists
    const audioFile = await fileService.getAudioFile(fileId);
    if (!audioFile) {
      return {
        success: false,
        notFound: true,
        error: 'Audio file not found'
      };
    }
    
    // Add file to macro
    const result = await macroModel.addFileToMacro(macroId, fileId, delay);
    
    if (result === -1) {
      return { 
        success: false, 
        error: 'This file is already in the macro' 
      };
    } else if (result === 0) {
      return { 
        success: false, 
        error: 'Failed to add file to macro' 
      };
    }
    
    return { success: true };
  } catch (error: any) {
    // Handle specific error for duplicate entries
    if (error.code === 'ER_DUP_ENTRY') {
      return { 
        success: false, 
        error: 'This file is already in the macro' 
      };
    }
    
    console.error(`Service error adding file ${fileId} to macro ${macroId}:`, error);
    return { success: false, error: 'Failed to add file to macro' };
  }
}

export async function addFilesToMacro(
  macroId: number,
  fileIds: number[]
): Promise<ServiceResponse<void>> {
  try {
    // Check if macro exists
    const macros = await macroModel.getMacroById(macroId);
    
    if (!macros || macros.length === 0) {
      return { 
        success: false, 
        notFound: true, 
        error: 'Macro not found' 
      };
    }
    
    // If fileIds is empty, return early with success
    if (fileIds.length === 0) {
      return { success: true };
    }
    
    // Validate all files exist
    for (const fileId of fileIds) {
      const audioFile = await fileService.getAudioFile(fileId);
      if (!audioFile) {
        return {
          success: false,
          notFound: true,
          error: `Audio file with ID ${fileId} not found`
        };
      }
    }
    
    // Add files to macro
    const result = await macroModel.addFilesToMacro(macroId, fileIds);
    
    if (!result) {
      return { 
        success: false, 
        error: 'Failed to add files to macro' 
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error adding files to macro ${macroId}:`, error);
    return { success: false, error: 'Failed to add files to macro' };
  }
}

/**
 * Updates a macro with the provided fields
 * @param id The ID of the macro to update
 * @param name Optional new name for the macro
 * @param description Optional new description for the macro
 * @param volume Optional new volume for the macro
 * @returns ServiceResponse indicating success or failure
 */
export async function updateMacro(
  id: number, 
  name?: string, 
  description?: string | null,
  volume?: number
): Promise<ServiceResponse<any>> {
  try {
    // Validate input
    if (!id || isNaN(id)) {
      return { success: false, error: 'Invalid macro ID' };
    }
    
    // Check if the macro exists
    const macros = await macroModel.getMacroById(id);
    if (!macros || macros.length === 0) {
      return { 
        success: false, 
        notFound: true, 
        error: 'Macro not found' 
      };
    }
    
    // Ensure at least one field is being updated
    if (name === undefined && description === undefined && volume === undefined) {
      return { success: false, error: 'No update parameters provided' };
    }
    
    // Validate volume if provided
    if (volume !== undefined && (volume < 0 || volume > 1)) {
      return { success: false, error: 'Volume must be between 0 and 1' };
    }
    
    // Update the macro
    const result = await macroModel.updateMacro(id, name, description, volume);
    
    if (result === 0) {
      return { success: false, error: 'No changes were made' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error updating macro ${id}:`, error);
    return { success: false, error: 'Failed to update macro' };
  }
}

/**
 * Updates a file within a macro with new delay or volume
 * @param macroId The ID of the macro containing the file
 * @param fileId The ID of the file to update
 * @param params Object containing delay and/or volume to update
 * @returns ServiceResponse indicating success or failure
 */
export async function updateMacroFile(
  macroId: number,
  fileId: number,
  params: {
    delay?: number;
    volume?: number;
  }
): Promise<ServiceResponse<void>> {
  try {
    // Validate input
    if (!macroId || isNaN(macroId)) {
      return { success: false, error: 'Invalid macro ID' };
    }
    
    if (!fileId || isNaN(fileId)) {
      return { success: false, error: 'Invalid file ID' };
    }
    
    // Check if the macro exists
    const macros = await macroModel.getMacroById(macroId);
    if (!macros || macros.length === 0) {
      return { 
        success: false, 
        notFound: true, 
        error: 'Macro not found' 
      };
    }
    
    // Ensure at least one parameter is being updated
    if (params.delay === undefined && params.volume === undefined) {
      return { success: false, error: 'No update parameters provided' };
    }
    
    // Validate volume if provided
    if (params.volume !== undefined && (params.volume < 0 || params.volume > 1)) {
      return { success: false, error: 'Volume must be between 0 and 1' };
    }
    
    // Update the file in the macro
    const result = await macroModel.updateMacroFile(
      macroId, 
      fileId, 
      params.delay, 
      params.volume
    );
    
    if (result === 0) {
      return { 
        success: false, 
        notFound: true, 
        error: 'File not found in macro or no changes were made' 
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error updating file ${fileId} in macro ${macroId}:`, error);
    return { success: false, error: 'Failed to update file in macro' };
  }
}

/**
 * Deletes a macro by ID
 * @param id The ID of the macro to delete
 * @returns ServiceResponse indicating success or failure
 */
export async function deleteMacro(id: number): Promise<ServiceResponse<void>> {
  try {
    // Validate input
    if (!id || isNaN(id)) {
      return { success: false, error: 'Invalid macro ID' };
    }
    
    // Check if the macro exists
    const macros = await macroModel.getMacroById(id);
    if (!macros || macros.length === 0) {
      return { 
        success: false, 
        notFound: true, 
        error: 'Macro not found' 
      };
    }
    
    // Delete the macro
    // Note: This assumes that database constraints will handle deleting related records
    // in the macro_files table (via ON DELETE CASCADE)
    const result = await macroModel.deleteMacro(id);
    
    if (result === 0) {
      return { 
        success: false, 
        error: 'Failed to delete macro' 
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error deleting macro ${id}:`, error);
    return { success: false, error: 'Failed to delete macro' };
  }
}

/**
 * Removes a file from a macro
 * @param macroId The ID of the macro
 * @param fileId The ID of the file to remove
 * @returns ServiceResponse indicating success or failure
 */
export async function removeFileFromMacro(
  macroId: number, 
  fileId: number
): Promise<ServiceResponse<void>> {
  try {
    // Validate input
    if (!macroId || isNaN(macroId)) {
      return { success: false, error: 'Invalid macro ID' };
    }
    
    if (!fileId || isNaN(fileId)) {
      return { success: false, error: 'Invalid file ID' };
    }
    
    // Check if the macro exists
    const macros = await macroModel.getMacroById(macroId);
    if (!macros || macros.length === 0) {
      return { 
        success: false, 
        notFound: true, 
        error: 'Macro not found' 
      };
    }
    
    // Remove the file from the macro
    const result = await macroModel.removeFileFromMacro(macroId, fileId);
    
    if (result === 0) {
      return { 
        success: false, 
        notFound: true, 
        error: 'File not found in macro' 
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error removing file ${fileId} from macro ${macroId}:`, error);
    return { success: false, error: 'Failed to remove file from macro' };
  }
}

export default {
  getAllMacros,
  getMacroById,
  getMacroWithFiles,
  createMacro,
  updateMacro,
  deleteMacro,
  addFileToMacro,
  addFilesToMacro,
  updateMacroFile,
  removeFileFromMacro
};