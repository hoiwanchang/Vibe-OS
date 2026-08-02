/**
 * 模块：SNMP 监控 — 路由
 */
import { Router, type Router as IRouter } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import * as controller from './snmp.controller.js';

const router: IRouter = Router();

router.get('/snmp/status', asyncHandler(controller.handleGetStatus));
router.post('/snmp/start', asyncHandler(controller.handleStart));
router.post('/snmp/stop', asyncHandler(controller.handleStop));
router.post('/snmp/restart', asyncHandler(controller.handleRestart));
router.get('/snmp/config', asyncHandler(controller.handleGetConfig));
router.put('/snmp/config', asyncHandler(controller.handleUpdateConfig));
router.get('/snmp/oids', asyncHandler(controller.handleGetOids));

export { router as snmpRoutes };
