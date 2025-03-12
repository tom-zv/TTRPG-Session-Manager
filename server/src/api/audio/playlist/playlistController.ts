import playlistService from "./playlistService.js";
import fileService from "../file/fileService.js";
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
  const { audioFileId, playOrder } = req.body;
  
  if (isNaN(playlistId) || !audioFileId) {
    return res.status(400).json({ error: 'Invalid playlist ID or audio file ID' });
  }
  
  // Check if playlist exists
  const playlistResponse = await playlistService.getPlaylistById(playlistId);
  if (!playlistResponse.success) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  
  // Check if audio file exists (assuming fileService has similar response structure)
  const audioFile = await fileService.getAudioFile(audioFileId);
  if (!audioFile || audioFile.length === 0) {
    return res.status(404).json({ error: 'Audio file not found' });
  }
  
  const response = await playlistService.addFileToPlaylist(playlistId, audioFileId, playOrder || null);
  
  if (response.success) {
    res.status(201).json({ message: 'Audio file added to playlist' });
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

export const updatePlaylistFileOrder = async (req: Request, res: Response) => {
  const playlistId = parseInt(req.params.id);
  const audioFileId = parseInt(req.params.fileId);
  const { newPlayOrder } = req.body;
  
  if (isNaN(playlistId) || isNaN(audioFileId)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  
  const response = await playlistService.updatePlaylistFileOrder(playlistId, audioFileId, newPlayOrder);
  
  if (response.success) {
    res.status(200).json({ message: 'Play order updated successfully' });
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
  removeFileFromPlaylist,
  updatePlaylistFileOrder
};
