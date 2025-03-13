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

// Playlist files management //
router.post('/:id/files', playlistController.addFileToPlaylist);

router.delete('/:id/files/:fileId', playlistController.removeFileFromPlaylist);

router.put('/:id/files/:fileId/order', playlistController.updatePlaylistFileOrder);

export default router;
