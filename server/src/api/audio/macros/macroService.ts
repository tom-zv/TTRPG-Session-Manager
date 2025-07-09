import macroModel from './macroModel.js';
import fileService from '../files/fileService.js';
import type { MacroDB } from '../types.js';
import { NotFoundError, ValidationError } from 'src/api/HttpErrors.js';

export async function getAllMacros(): Promise<MacroDB[]> {
   return await macroModel.getAllMacros();
}

export async function getMacroById(id: number): Promise<MacroDB> {
  const macro = await macroModel.getMacroById(id);
  
  if (!macro) throw new NotFoundError(`Macro with ID ${id} not found`);

  return macro;
}

export async function getMacroWithFiles(id: number): Promise<MacroDB> {
  const macro = await getMacroById(id);
  if(!macro) throw new NotFoundError(`Macro with ID ${id} not found`);

  const files = await macroModel.getMacroFiles(id);
  if(!files) throw new NotFoundError(`Files for macro with ID ${id} not found`);
  
  // combine macro data with files
  const macroDb = {
    ...macro,
    files
  };
  
  return macroDb;
}

export async function createMacro(name: string, description: string | null): Promise<MacroDB> {
  // Validate input
  if (!name || name.trim() === '') {
    throw new Error('Macro name is required');
  }
  
  // Create the macro in the database
  const macroId = await macroModel.createMacro(name, description);
  
  if (!macroId) {
    throw new Error('Failed to create macro');
  }
  
  // Get the newly created macro to return complete data
  const macro = await macroModel.getMacroById(macroId);
  
  if (!macro) {
    throw new NotFoundError(`Created macro with ID ${macroId} not found`);
  }
  
  return macro;
}

export async function addFileToMacro(
  macroId: number,
  fileId: number,
  delay: number = 0
): Promise<void> {
  // Check if macro exists
  const macro = await macroModel.getMacroById(macroId);
  
  if (!macro) {
    throw new NotFoundError('Macro not found');
  }
  
  // Check if file exists
  const audioFile = await fileService.getAudioFile(fileId);
  if (!audioFile) {
    throw new NotFoundError('Audio file not found');
  }
  
  // Add file to macro
  await macroModel.addFileToMacro(macroId, fileId, delay);

  return;

}

export async function addFilesToMacro(
  macroId: number,
  fileIds: number[]
): Promise<void> {
  // Check if macro exists
  const macro = await macroModel.getMacroById(macroId);
  
  if (!macro) {
    throw new NotFoundError('Macro not found');
  }
  
  // If fileIds is empty, return early with success
  if (fileIds.length === 0) {
    return;
  }
  
  // Validate all files exist
  for (const fileId of fileIds) {
    const audioFile = await fileService.getAudioFile(fileId);
    if (!audioFile) {
      throw new NotFoundError(`Audio file with ID ${fileId} not found`);
    }
  }
  
  // Add files to macro
  const result = await macroModel.addFilesToMacro(macroId, fileIds);
  
  if (!result) {
    throw new Error('Failed to add files to macro');
  }
}

/**
 * Updates a macro with the provided fields
 * @param id The ID of the macro to update
 * @param name Optional new name for the macro
 * @param description Optional new description for the macro
 * @param volume Optional new volume for the macro
 */
export async function updateMacro(
  id: number, 
  name?: string, 
  description?: string | null,
  volume?: number
): Promise<void> {
  // Validate input
  if (!id || isNaN(id)) {
    throw new ValidationError('Invalid macro ID');
  }
  
  // Check if the macro exists
  const macro = await macroModel.getMacroById(id);
  if (!macro) {
    throw new NotFoundError('Macro not found');
  }
  
  // Ensure at least one field is being updated
  if (name === undefined && description === undefined && volume === undefined) {
    throw new Error('No update parameters provided');
  }
  
  // Validate volume if provided
  if (volume !== undefined && (volume < 0 || volume > 1)) {
    throw new Error('Volume must be between 0 and 1');
  }
  
  // Update the macro
  const result = await macroModel.updateMacro(id, name, description, volume);
  
  if (result === 0) {
    throw new Error('No changes were made');
  }
}

/**
 * Updates a file within a macro with new delay or volume
 * @param macroId The ID of the macro containing the file
 * @param fileId The ID of the file to update
 * @param params Object containing delay and/or volume to update
 */
export async function updateMacroFile(
  macroId: number,
  fileId: number,
  params: {
    delay?: number;
    volume?: number;
  }
): Promise<void> {
  // Validate input
  if (!macroId || isNaN(macroId)) {
    throw new ValidationError('Invalid macro ID');
  }
  
  if (!fileId || isNaN(fileId)) {
    throw new ValidationError('Invalid file ID');
  }
  
  // Check if the macro exists
  const macro = await macroModel.getMacroById(macroId);
  if (!macro) {
    throw new NotFoundError('Macro not found');
  }
  
  // Ensure at least one parameter is being updated
  if (params.delay === undefined && params.volume === undefined) {
    throw new Error('No update parameters provided');
  }
  
  // Validate volume if provided
  if (params.volume !== undefined && (params.volume < 0 || params.volume > 1)) {
    throw new Error('Volume must be between 0 and 1');
  }
  
  // Update the file in the macro
  const result = await macroModel.updateMacroFile(
    macroId, 
    fileId, 
    params.delay, 
    params.volume
  );
  
  if (result === 0) {
    throw new NotFoundError('File not found in macro or no changes were made');
  }
}

/**
 * Deletes a macro by ID
 * @param id The ID of the macro to delete
 */
export async function deleteMacro(id: number): Promise<void> {
  // Validate input
  if (!id || isNaN(id)) {
    throw new ValidationError('Invalid macro ID');
  }
  
  // Check if the macro exists
  const macro = await macroModel.getMacroById(id);
  if (!macro) {
    throw new NotFoundError('Macro not found');
  }
  
  // Delete the macro
  // Note: This assumes that database constraints will handle deleting related records
  // in the macro_files table (via ON DELETE CASCADE)
  const result = await macroModel.deleteMacro(id);
  
  if (result === 0) {
    throw new Error('Failed to delete macro');
  }
}

/**
 * Removes a file from a macro
 * @param macroId The ID of the macro
 * @param fileId The ID of the file to remove
 */
export async function removeFileFromMacro(
  macroId: number, 
  fileId: number
): Promise<void> {
  // Validate input
  if (!macroId || isNaN(macroId)) {
    throw new ValidationError('Invalid macro ID');
  }
  
  if (!fileId || isNaN(fileId)) {
    throw new ValidationError('Invalid file ID');
  }
  
  // Check if the macro exists
  const macro = await macroModel.getMacroById(macroId);
  if (!macro) {
    throw new NotFoundError('Macro not found');
  }
  
  // Remove the file from the macro
  const result = await macroModel.removeFileFromMacro(macroId, fileId);
  
  if (result === 0) {
    throw new NotFoundError('File not found in macro');
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