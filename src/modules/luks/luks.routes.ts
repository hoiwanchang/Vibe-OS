/**
 * 模块：LUKS 卷加密 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './luks.controller.js';

const router: IRouter = Router();

/** 设备路径校验：必须以 /dev/ 开头，防止命令注入 */
const deviceSchema = z.string().regex(/^\/dev\//, '设备路径必须以 /dev/ 开头');

/** 卷名校验：仅允许字母、数字、连字符、下划线，防止路径穿越 */
const nameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, '卷名仅允许字母、数字、连字符、下划线');

/** POST /api/luks/create — 创建 LUKS2 加密卷 */
const createSchema = z.object({
  device: deviceSchema,
  passphrase: z.string().min(1).optional(),
  keyfile: z.string().min(1).optional(),
});
router.post('/luks/create', validateBody(createSchema), asyncHandler(controller.handleCreate));

/** POST /api/luks/open — 解锁卷 */
const openSchema = z.object({
  device: deviceSchema,
  name: nameSchema,
  passphrase: z.string().min(1).optional(),
  keyfile: z.string().min(1).optional(),
});
router.post('/luks/open', validateBody(openSchema), asyncHandler(controller.handleOpen));

/** POST /api/luks/close — 锁定卷 */
const closeSchema = z.object({ name: nameSchema });
router.post('/luks/close', validateBody(closeSchema), asyncHandler(controller.handleClose));

/** GET /api/luks/status — 列出所有加密卷状态（必须在 :name 之前注册） */
router.get('/luks/status', asyncHandler(controller.handleStatus));

/** GET /api/luks/:name — 单个卷详情 */
const paramNameSchema = z.object({ name: nameSchema });
router.get('/luks/:name', validateParams(paramNameSchema), asyncHandler(controller.handleVolumeDetail));

/** POST /api/luks/keyfile — 生成 keyfile */
const keyfileSchema = z.object({ name: nameSchema });
router.post('/luks/keyfile', validateBody(keyfileSchema), asyncHandler(controller.handleKeyfile));

/** PUT /api/luks/autounlock — 配置开机自动解锁 */
const autounlockSchema = z.object({
  name: nameSchema,
  device: deviceSchema,
  keyfile: z.string().min(1).optional(),
});
router.put('/luks/autounlock', validateBody(autounlockSchema), asyncHandler(controller.handleAutounlock));

export default router;
