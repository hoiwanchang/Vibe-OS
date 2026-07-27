/**
 * 模块：网络配置 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './network.controller.js';

const router: IRouter = Router();

router.get('/network/interfaces', asyncHandler(controller.handleListInterfaces));

const ifaceConfigSchema = z.object({
  method: z.enum(['dhcp', 'static']),
  ip: z.string().optional(),
  netmask: z.string().optional(),
  gateway: z.string().optional(),
  dns: z.array(z.string()).optional(),
});
const ifaceNameSchema = z.object({ name: z.string().min(1).max(64) });
router.put('/network/interfaces/:name', validateParams(ifaceNameSchema), validateBody(ifaceConfigSchema), asyncHandler(controller.handleConfigureInterface));

router.get('/network/dns', asyncHandler(controller.handleGetDns));
const dnsSchema = z.object({ servers: z.array(z.string()).min(1), search: z.array(z.string()).optional() });
router.put('/network/dns', validateBody(dnsSchema), asyncHandler(controller.handleSetDns));

router.get('/network/firewall', asyncHandler(controller.handleListFirewall));
const fwRuleSchema = z.object({
  chain: z.enum(['input', 'forward', 'output']),
  protocol: z.enum(['tcp', 'udp', 'icmp', 'all']),
  port: z.union([z.number(), z.string()]).nullable().optional(),
  action: z.enum(['accept', 'drop', 'reject']),
  source: z.string().optional(),
  comment: z.string().optional(),
});
router.post('/network/firewall', validateBody(fwRuleSchema), asyncHandler(controller.handleAddFirewall));
const fwIdSchema = z.object({ id: z.string().min(1) });
router.delete('/network/firewall/:id', validateParams(fwIdSchema), asyncHandler(controller.handleRemoveFirewall));

router.get('/network/ports', asyncHandler(controller.handleListPorts));
router.get('/network/wol', asyncHandler(controller.handleListWol));
const wolSchema = z.object({ mac: z.string().min(1), broadcast: z.string().optional() });
router.post('/network/wol', validateBody(wolSchema), asyncHandler(controller.handleSendWol));

export default router;
