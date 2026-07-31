/**
 * 模块：WireGuard VPN — 服务层
 * 密钥生成、wg0.conf 管理、peer 增删、配置导出
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import { executeCommand } from '../../system/command-executor.js';
import { AppError } from '../../common/app-error.js';
import type {
  VpnStatus,
  ServerConfig,
  PeerRecord,
  PeerInfo,
  AddPeerResult,
} from './vpn.types.js';

const VPN_DIR = path.join(VIBEOS_APP_DIR, 'vpn');
const CONFIG_FILE = path.join(VPN_DIR, 'server.json');
const PEERS_FILE = path.join(VPN_DIR, 'peers.json');
const WG_CONF = '/etc/wireguard/wg0.conf';

async function loadConfig(): Promise<ServerConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as ServerConfig;
  } catch {
    return null;
  }
}

async function saveConfig(cfg: ServerConfig): Promise<void> {
  await ensureDir(VPN_DIR);
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

async function loadPeers(): Promise<PeerRecord[]> {
  try {
    const raw = await fs.readFile(PEERS_FILE, 'utf-8');
    return JSON.parse(raw) as PeerRecord[];
  } catch {
    return [];
  }
}

async function savePeers(peers: PeerRecord[]): Promise<void> {
  await ensureDir(VPN_DIR);
  await fs.writeFile(PEERS_FILE, JSON.stringify(peers, null, 2), 'utf-8');
}

/** 生成 WireGuard 密钥对（通过 bash 管道） */
async function generateKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
  const priv = await executeCommand('bash', ['-c', 'wg genkey']);
  if (priv.exitCode !== 0) throw AppError.internal('wg genkey 失败');
  const privateKey = priv.stdout.trim();
  const pub = await executeCommand('bash', ['-c', `echo '${privateKey}' | wg pubkey`]);
  if (pub.exitCode !== 0) throw AppError.internal('wg pubkey 失败');
  return { privateKey, publicKey: pub.stdout.trim() };
}

/** 计算子网中第 n 个可用 IP */
function nthIp(subnet: string, n: number): string {
  const base = subnet.split('/')[0] ?? '10.8.0.0';
  const parts = base.split('.').map(Number);
  parts[3] = n;
  return parts.join('.');
}

/** GET /api/vpn/status */
export async function getStatus(): Promise<VpnStatus> {
  const cfg = await loadConfig();
  const peers = await loadPeers();
  let running = false;
  try {
    const result = await executeCommand('wg', ['show', 'wg0']);
    running = result.exitCode === 0;
  } catch {
    running = false;
  }
  return {
    running,
    interface: 'wg0',
    publicKey: cfg?.publicKey ?? null,
    listenPort: cfg?.port ?? null,
    peerCount: peers.length,
  };
}

/** POST /api/vpn/server — 初始化 */
export async function initServer(port: number, subnet: string, dns?: string): Promise<VpnStatus> {
  const existing = await loadConfig();
  if (existing) throw AppError.conflict('VPN 服务器已初始化');

  const { privateKey, publicKey } = await generateKeyPair();
  const prefix = subnet.split('/')[1] ?? '24';
  const address = nthIp(subnet, 1);

  const cfg: ServerConfig = {
    privateKey,
    publicKey,
    port,
    subnet,
    address,
    dns: dns ?? null,
    createdAt: new Date().toISOString(),
  };
  await saveConfig(cfg);

  // 生成 wg0.conf
  const confLines = [
    '[Interface]',
    `Address = ${address}/${prefix}`,
    `ListenPort = ${port}`,
    `PrivateKey = ${privateKey}`,
  ];
  if (dns) confLines.push(`DNS = ${dns}`);
  const conf = confLines.join('\n') + '\n';
  await executeCommand('bash', ['-c', `mkdir -p /etc/wireguard && cat > ${WG_CONF} << 'WGEOF'\n${conf}WGEOF`]);
  await executeCommand('chmod', ['600', WG_CONF]);
  await executeCommand('wg-quick', ['up', 'wg0']);

  return getStatus();
}

/** PUT /api/vpn/server — 更新 */
export async function updateServer(port?: number, dns?: string): Promise<VpnStatus> {
  const cfg = await loadConfig();
  if (!cfg) throw AppError.notFound('VPN 服务器');

  if (port !== undefined) cfg.port = port;
  if (dns !== undefined) cfg.dns = dns;
  await saveConfig(cfg);

  // 重新生成 conf 并重启
  const peers = await loadPeers();
  const prefix = cfg.subnet.split('/')[1] ?? '24';
  const lines = [
    '[Interface]',
    `Address = ${cfg.address}/${prefix}`,
    `ListenPort = ${cfg.port}`,
    `PrivateKey = ${cfg.privateKey}`,
  ];
  if (cfg.dns) lines.push(`DNS = ${cfg.dns}`);
  lines.push('');
  for (const p of peers) {
    lines.push('[Peer]', `PublicKey = ${p.publicKey}`, `AllowedIPs = ${p.allowedIps}`);
    if (p.presharedKey) lines.push(`PresharedKey = ${p.presharedKey}`);
    lines.push('');
  }
  const conf = lines.join('\n');
  await executeCommand('bash', ['-c', `cat > ${WG_CONF} << 'WGEOF'\n${conf}WGEOF`]);
  await executeCommand('wg-quick', ['down', 'wg0']);
  await executeCommand('wg-quick', ['up', 'wg0']);

  return getStatus();
}

/** GET /api/vpn/peers */
export async function listPeers(): Promise<PeerInfo[]> {
  const records = await loadPeers();
  const runtimeMap = new Map<string, { lastHandshake: string | null; rxBytes: number; txBytes: number; endpoint: string | null }>();
  try {
    const result = await executeCommand('wg', ['show', 'wg0', 'peers']);
    if (result.exitCode === 0) {
      const pubkeys = result.stdout.trim().split('\n').filter(Boolean);
      for (const pk of pubkeys) {
        const detail = await executeCommand('wg', ['show', 'wg0', pk, 'latest-handshakes', 'transfer', 'endpoints']);
        const parts = detail.stdout.trim().split('\t');
        runtimeMap.set(pk, {
          lastHandshake: parts[0] ?? null,
          rxBytes: Number(parts[1] ?? 0),
          txBytes: Number(parts[2] ?? 0),
          endpoint: parts[3] ?? null,
        });
      }
    }
  } catch {
    // wg 不可用，降级
  }

  return records.map((r) => {
    const rt = runtimeMap.get(r.publicKey);
    return {
      publicKey: r.publicKey,
      name: r.name,
      address: r.address,
      lastHandshake: rt?.lastHandshake ?? null,
      rxBytes: rt?.rxBytes ?? 0,
      txBytes: rt?.txBytes ?? 0,
      endpoint: rt?.endpoint ?? null,
      allowedIps: r.allowedIps.split(',').map((s) => s.trim()),
    };
  });
}

/** POST /api/vpn/peers */
export async function addPeer(name: string, allowedIps?: string): Promise<AddPeerResult> {
  const cfg = await loadConfig();
  if (!cfg) throw AppError.notFound('VPN 服务器');

  const peers = await loadPeers();
  const { privateKey, publicKey } = await generateKeyPair();
  const address = nthIp(cfg.subnet, peers.length + 2);
  const ips = allowedIps ?? `${address}/32`;

  const record: PeerRecord = {
    name,
    publicKey,
    privateKey,
    presharedKey: null,
    address,
    allowedIps: ips,
    createdAt: new Date().toISOString(),
  };
  peers.push(record);
  await savePeers(peers);

  // 追加到 wg0.conf 并 syncconf
  const peerBlock = `[Peer]\\nPublicKey = ${publicKey}\\nAllowedIPs = ${ips}\\n`;
  await executeCommand('bash', ['-c', `echo -e '\\n${peerBlock}' >> ${WG_CONF}`]);
  await executeCommand('wg', ['syncconf', 'wg0']);

  return { publicKey, name, address, message: `Peer ${name} 已添加，VPN IP: ${address}` };
}

/** DELETE /api/vpn/peers/:pubkey */
export async function removePeer(pubkey: string): Promise<void> {
  const peers = await loadPeers();
  const idx = peers.findIndex((p) => p.publicKey === pubkey);
  if (idx === -1) throw AppError.notFound(`Peer ${pubkey.slice(0, 8)}...`);
  peers.splice(idx, 1);
  await savePeers(peers);
  await executeCommand('wg', ['set', 'wg0', 'peer', pubkey, 'remove']);
}

/** GET /api/vpn/peers/:pubkey/config — 导出客户端配置 */
export async function exportPeerConfig(pubkey: string): Promise<string> {
  const cfg = await loadConfig();
  if (!cfg) throw AppError.notFound('VPN 服务器');
  const peers = await loadPeers();
  const peer = peers.find((p) => p.publicKey === pubkey);
  if (!peer) throw AppError.notFound(`Peer ${pubkey.slice(0, 8)}...`);

  let serverEndpoint = `SERVER_IP:${cfg.port}`;
  try {
    const result = await executeCommand('hostname', ['-I']);
    if (result.exitCode === 0) {
      const ip = result.stdout.trim().split(' ')[0];
      if (ip) serverEndpoint = `${ip}:${cfg.port}`;
    }
  } catch { /* 降级 */ }

  const prefix = cfg.subnet.split('/')[1] ?? '24';
  const lines = [
    '[Interface]',
    `PrivateKey = ${peer.privateKey}`,
    `Address = ${peer.address}/${prefix}`,
  ];
  if (cfg.dns) lines.push(`DNS = ${cfg.dns}`);
  lines.push(
    '',
    '[Peer]',
    `PublicKey = ${cfg.publicKey}`,
    `Endpoint = ${serverEndpoint}`,
    `AllowedIPs = ${cfg.subnet}`,
    'PersistentKeepalive = 25',
    '',
  );
  return lines.join('\n');
}
