import express from 'express';
import * as playlistController from './playlistController.js';

const router = express.Router();

// GET /playlists - Get all playlists
router.get('/', playlistController.getAllPlaylists);

// GET /playlists/:id - Get a playlist by ID
router.get('/:id', playlistController.getPlaylistById);

// POST /playlists - Create a new playlist
router.post('/', playlistController.createPlaylist);

// PUT /playlists/:id - Update a playlist
router.put('/:id', playlistController.updatePlaylist);

// DELETE /playlists/:id - Delete a playlist
router.delete('/:id', playlistController.deletePlaylist);

/* Playlist files management 
 *****************************/

// POST /playlists/:id/files - Add a file to a playlist
router.post('/:id/files', playlistController.addFileToPlaylist);

// POST /playlists/:id/files/batch - Add multiple files to a playlist in one operation
router.post('/:id/files/batch', playlistController.addFilesToPlaylist);

// DELETE /playlists/:id/files/:fileId - Remove a file from a playlist
router.delete('/:id/files/:fileId', playlistController.removeFileFromPlaylist);

// PUT /playlists/:id/files/:fileId/position - Update the position of a file in a playlist
router.put('/:id/files/:fileId/position', playlistController.updatePlaylistFilePosition);

// PUT /playlists/:id/files/positions - Move a range of files to a new position
router.put('/:id/files/positions', playlistController.updateFileRangePosition);

export default router;
