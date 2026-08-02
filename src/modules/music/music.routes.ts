/**
 * 模块：音乐串流 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './music.controller.js';

const router: IRouter = Router();

const trackIdSchema = z.object({ id: z.string().min(1) });
const playlistIdSchema = z.object({ id: z.string().min(1) });

const createPlaylistSchema = z.object({
  name: z.string().min(1).max(200),
  trackIds: z.array(z.string()).default([]),
});

const updatePlaylistSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  addTrackIds: z.array(z.string()).optional(),
  removeTrackIds: z.array(z.string()).optional(),
});

// 音乐库
router.get('/music/library', asyncHandler(controller.handleGetLibrary));
router.get('/music/artists', asyncHandler(controller.handleListArtists));
router.get('/music/albums', asyncHandler(controller.handleListAlbums));
router.get('/music/tracks', asyncHandler(controller.handleListTracks));
router.post('/music/scan', asyncHandler(controller.handleScan));

// 曲目流媒体 & 封面
router.get('/music/tracks/:id/stream', validateParams(trackIdSchema), asyncHandler(controller.handleStreamTrack));
router.get('/music/tracks/:id/cover', validateParams(trackIdSchema), asyncHandler(controller.handleGetCover));

// 播放列表
router.get('/music/playlists', asyncHandler(controller.handleListPlaylists));
router.post('/music/playlists', validateBody(createPlaylistSchema), asyncHandler(controller.handleCreatePlaylist));
router.delete('/music/playlists/:id', validateParams(playlistIdSchema), asyncHandler(controller.handleDeletePlaylist));
router.put('/music/playlists/:id', validateParams(playlistIdSchema), validateBody(updatePlaylistSchema), asyncHandler(controller.handleUpdatePlaylist));

export default router;
