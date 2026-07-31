/**
 * 模块：WireGuard VPN — 路由
 */
import { Router, type Router as IRouter } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import * as controller from './vpn.controller.js';

const router: IRouter = Router();

router.get('/vpn/status', asyncHandler(controller.handleGetStatus));
router.post('/vpn/server', asyncHandler(controller.handleInitServer));
router.put('/vpn/server', asyncHandler(controller.handleUpdateServer));
router.get('/vpn/peers', asyncHandler(controller.handleListPeers));
router.post('/vpn/peers', asyncHandler(controller.handleAddPeer));
router.delete('/vpn/peers/:pubkey', asyncHandler(controller.handleRemovePeer));
router.get('/vpn/peers/:pubkey/config', asyncHandler(controller.handleExportConfig));

export { router as vpnRoutes };
