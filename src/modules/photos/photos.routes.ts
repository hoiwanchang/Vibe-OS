/**
 * 模块：照片管理 — 路由
 */
import { Router, type Router as IRouter } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import * as controller from './photos.controller.js';

const router: IRouter = Router();

router.get('/photos/library', asyncHandler(controller.handleGetLibrary));
router.get('/photos/albums', asyncHandler(controller.handleGetAlbums));
router.post('/photos/albums', asyncHandler(controller.handleCreateAlbum));
router.delete('/photos/albums/:id', asyncHandler(controller.handleDeleteAlbum));
router.post('/photos/albums/:id/photos', asyncHandler(controller.handleAddPhotos));
router.post('/photos/share', asyncHandler(controller.handleCreateShare));
router.get('/photos/share/:token', asyncHandler(controller.handleGetShare));
router.get('/photos/:id', asyncHandler(controller.handleGetPhoto));
router.get('/photos/:id/thumbnail', asyncHandler(controller.handleGetThumbnail));
router.get('/photos/:id/original', asyncHandler(controller.handleGetOriginal));

export { router as photosRoutes };
