import playlistService from "./playlistService.js";
import fileService from "../../files/fileService.js";
import { transformAudioFile } from "src/utils/format-transformers.js";
import { Request, Response } from 'express';

export const getAllPlaylists = async (_req: Request, res: Response) => {
  const response = await playlistService.getAllPlaylists();
  
  if (response.success) {
    res.status(200).json(response.data);
  } else {
    res.status(500).json({ error: response.error });
  }
};

export const getPlaylistById = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid playlist ID' });
  }
  
  const includeFiles = req.query.includeFiles === 'true';
  let response;
  
  if (includeFiles) {
    response = await playlistService.getPlaylistWithFiles(id);
    if (response.success && response.data.files) {
      // Transform the files to the format expected by the frontend
      response.data.files = response.data.files.map((file: any) => transformAudioFile(file));
    }
  } else {
    response = await playlistService.getPlaylistById(id);
  }
  
  if (response.success) {
    res.status(200).json(response.data);
  } else if (response.notFound) {
    res.status(404).json({ error: response.error });
  } else {
    res.status(500).json({ error: response.error });
  }
};

export const createPlaylist = async (req: Request, res: Response) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ 
      field: 'name',
      error: 'Playlist name is required' 
    });
  }
  
  const response = await playlistService.createPlaylist(name, description || null);
  
  if (response.success) {
    res.status(201).json(response.data);
  } else {
    res.status(400).json({ error: response.error });
  }
};

export const updatePlaylist = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid playlist ID' });
  }
  
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ 
      field: 'name',
      error: 'Playlist name is required' 
    });
  }
  
  const response = await playlistService.updatePlaylist(id, name, description || null);
  
  if (response.success) {
    res.status(200).json(response.data);
  } else if (response.notFound) {
    res.status(404).json({ error: response.error });
  } else {
    res.status(400).json({ error: response.error });
  }
};

export const deletePlaylist = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid playlist ID' });
  }
  
  const response = await playlistService.deletePlaylist(id);
  
  if (response.success) {
    res.status(200).json({ message: 'Playlist deleted successfully' });
  } else if (response.notFound) {
    res.status(404).json({ error: response.error });
  } else {
    res.status(500).json({ error: response.error });
  }
};

export const addFileToPlaylist = async (req: Request, res: Response) => {
  const playlistId = parseInt(req.params.id);
  const { audioFileId, position } = req.body;
  if (isNaN(playlistId) || !audioFileId) {
    return res.status(400).json({ error: 'Invalid playlist ID or audio file ID' });
  }
  
  // Check if playlist exists
  const playlistResponse = await playlistService.getPlaylistById(playlistId);
  if (!playlistResponse.success) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  
  // Check if audio file exists
  const audioFile = await fileService.getAudioFile(audioFileId);
  if (!audioFile || audioFile.length === 0) {
    return res.status(404).json({ error: 'Audio file not found' });
  }
  
  const response = await playlistService.addFileToPlaylist(playlistId, audioFileId, position );
  
  if (response.success) {
    res.status(201).json({ message: 'Audio file added to playlist' });
  } else {
    res.status(500).json({ error: response.error });
  }
};

export const addFilesToPlaylist = async (req: Request, res: Response) => {
  const playlistId = parseInt(req.params.id);
  const { audioFileIds, startPosition } = req.body;
  
  if (isNaN(playlistId) || !Array.isArray(audioFileIds) || audioFileIds.length === 0) {
    return res.status(400).json({ error: 'Invalid playlist ID or audio file IDs' });
  }
  
  // Check if playlist exists
  const playlistResponse = await playlistService.getPlaylistById(playlistId);
  if (!playlistResponse.success) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  
  const response = await playlistService.addFilesToPlaylist(
    playlistId, 
    audioFileIds, 
    startPosition !== undefined ? startPosition : null
  );
  
  if (response.success) {
    res.status(201).json({ message: `Added ${audioFileIds.length} files to playlist` });
  } else {
    res.status(500).json({ error: response.error });
  }
};

export const removeFileFromPlaylist = async (req: Request, res: Response) => {
  const playlistId = parseInt(req.params.id);
  const audioFileId = parseInt(req.params.fileId);
  
  if (isNaN(playlistId) || isNaN(audioFileId)) {
    return res.status(400).json({ error: 'Invalid playlist ID or audio file ID' });
  }
  
  const response = await playlistService.removeFileFromPlaylist(playlistId, audioFileId);
  
  if (response.success) {
    res.status(200).json({ message: 'Audio file removed from playlist' });
  } else if (response.notFound) {
    res.status(404).json({ error: response.error });
  } else {
    res.status(500).json({ error: response.error });
  }
};

export const updatePlaylistFilePosition = async (req: Request, res: Response) => {
  const playlistId = parseInt(req.params.id);
  const audioFileId = parseInt(req.params.fileId);
  const { targetPosition } = req.body;

  if (isNaN(playlistId) || isNaN(audioFileId)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  
  const response = await playlistService.updatePlaylistFilePosition(playlistId, audioFileId, targetPosition);
  
  if (response.success) {
    res.status(200).json({ message: 'Play position updated successfully' });
  } else if (response.notFound) {
    res.status(404).json({ error: response.error });
  } else {
    res.status(400).json({ error: response.error });
    console.log('Error updating playlist file position:', response.error);
  }
};

export const updateFileRangePosition = async (req: Request, res: Response) => {
  const playlistId = parseInt(req.params.id);
  const { sourceStartPosition, sourceEndPosition, targetPosition } = req.body;
  
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID' });
  }
  
  if (
    typeof sourceStartPosition !== 'number' || 
    typeof sourceEndPosition !== 'number' || 
    typeof targetPosition !== 'number'
  ) {
    return res.status(400).json({ error: 'Invalid position parameters' });
  }
  
  const response = await playlistService.updateFileRangePosition(
    playlistId,
    sourceStartPosition,
    sourceEndPosition,
    targetPosition
  );
  
  if (response.success) {
    res.status(200).json({ message: 'Playlist items moved successfully' });
  } else if (response.notFound) {
    res.status(404).json({ error: response.error });
  } else {
    res.status(400).json({ error: response.error });
  }
};

export default {
  getAllPlaylists,
  getPlaylistById,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addFileToPlaylist,
  addFilesToPlaylist,
  removeFileFromPlaylist,
  updatePlaylistFilePosition,
  updateFileRangePosition
};
