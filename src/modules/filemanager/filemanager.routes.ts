/**
 * 模块：文件管理器 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './filemanager.controller.js';

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

/** GET /api/files/list */
router.get('/files/list', asyncHandler(controller.handleList));

/** GET /api/files/read */
router.get('/files/read', asyncHandler(controller.handleRead));

/** POST /api/files/mkdir */
const mkdirSchema = z.object({ path: z.string().min(1), uid: z.number().int().min(0) });
router.post('/files/mkdir', validateBody(mkdirSchema), asyncHandler(controller.handleMkdir));

/** POST /api/files/write */
const writeSchema = z.object({ path: z.string().min(1), uid: z.number().int().min(0), content: z.string() });
router.post('/files/write', validateBody(writeSchema), asyncHandler(controller.handleWrite));

/** POST /api/files/rename */
const renameSchema = z.object({ path: z.string().min(1), newName: z.string().min(1), uid: z.number().int().min(0) });
router.post('/files/rename', validateBody(renameSchema), asyncHandler(controller.handleRename));

/** DELETE /api/files/delete */
const deleteSchema = z.object({ path: z.string().min(1), uid: z.number().int().min(0), permanent: z.boolean().optional() });
router.delete('/files/delete', validateBody(deleteSchema), asyncHandler(controller.handleDelete));

/** POST /api/files/copy */
const copySchema = z.object({ src: z.string().min(1), dest: z.string().min(1), uid: z.number().int().min(0) });
router.post('/files/copy', validateBody(copySchema), asyncHandler(controller.handleCopy));

/** GET /api/files/download */
router.get('/files/download', asyncHandler(controller.handleDownload));

/** POST /api/files/upload */
router.post('/files/upload', upload.single('file'), asyncHandler(controller.handleUpload));

/** GET /api/files/trash */
router.get('/files/trash', asyncHandler(controller.handleListTrash));

/** DELETE /api/files/trash/empty */
router.delete('/files/trash/empty', asyncHandler(controller.handleEmptyTrash));

/** GET /api/files/preview */
router.get('/files/preview', asyncHandler(controller.handlePreview));

/** GET /api/files/thumbnail */
router.get('/files/thumbnail', asyncHandler(controller.handleThumbnail));

export default router;
