/**
 * Docker CE API 封装
 * 通过 docker CLI 实现容器化部署、重启、日志读取
 * 注意：生产环境应通过 Docker Socket API 调用，此处使用 CLI 封装作为原子化 API 层
 */
import { executeCommand, executeCommandStrict } from './command-executor.js';
import type {
  ContainerDeployRequest,
  ContainerInfo,
  ContainerLogResult,
} from '../modules/container/container.types.js';

/**
 * 部署（创建并启动）容器
 * @param req - 部署请求参数
 * @returns 容器 ID
 */
export async function deployContainer(
  req: ContainerDeployRequest,
): Promise<string> {
  const args: string[] = ['run', '-d', '--name', req.name];

  // 端口映射
  for (const port of req.ports ?? []) {
    args.push('-p', `${port.host}:${port.container}`);
  }

  // 环境变量
  for (const [key, value] of Object.entries(req.env ?? {})) {
    args.push('-e', `${key}=${value}`);
  }

  // 卷挂载（限定 /data/ 内）
  for (const vol of req.volumes ?? []) {
    args.push('-v', `${vol.host}:${vol.container}${vol.readonly ? ':ro' : ''}`);
  }

  // 资源限制
  if (req.memoryLimit) {
    args.push('--memory', req.memoryLimit);
  }
  if (req.cpuLimit) {
    args.push('--cpus', String(req.cpuLimit));
  }

  // 重启策略
  args.push('--restart', req.restartPolicy ?? 'unless-stopped');

  // 网络
  if (req.network) {
    args.push('--network', req.network);
  }

  args.push(req.image);

  const result = await executeCommandStrict('docker', args);
  return result.stdout.trim();
}

/**
 * 重启容器
 * @param nameOrId - 容器名或 ID
 */
export async function restartContainer(nameOrId: string): Promise<void> {
  await executeCommandStrict('docker', ['restart', nameOrId]);
}

/**
 * 停止容器
 */
export async function stopContainer(nameOrId: string): Promise<void> {
  await executeCommandStrict('docker', ['stop', nameOrId]);
}

/**
 * 删除容器
 */
export async function removeContainer(
  nameOrId: string,
  force = false,
): Promise<void> {
  const args = ['rm'];
  if (force) args.push('-f');
  args.push(nameOrId);
  await executeCommandStrict('docker', args);
}

/**
 * 获取容器列表
 */
export async function listContainers(all = true): Promise<ContainerInfo[]> {
  const args = ['ps', '--format', '{{json .}}'];
  if (all) args.push('-a');

  const result = await executeCommand('docker', args);
  if (result.exitCode !== 0) return [];

  const containers: ContainerInfo[] = [];
  const lines = result.stdout.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, string>;
      containers.push({
        id: parsed['ID'] ?? '',
        name: parsed['Names'] ?? '',
        image: parsed['Image'] ?? '',
        status: parsed['Status'] ?? '',
        state: parsed['State'] ?? '',
        ports: parsed['Ports'] ?? '',
        createdAt: parsed['CreatedAt'] ?? '',
      });
    } catch {
      // 跳过解析失败的行
    }
  }
  return containers;
}

/**
 * 读取容器日志
 * @param nameOrId - 容器名或 ID
 * @param tail - 返回最后 N 行
 * @param since - 起始时间（如 "2024-01-01T00:00:00"）
 */
export async function getContainerLogs(
  nameOrId: string,
  tail = 100,
  since?: string,
): Promise<ContainerLogResult> {
  const args = ['logs', '--tail', String(tail)];
  if (since) {
    args.push('--since', since);
  }
  args.push(nameOrId);

  const result = await executeCommand('docker', args);
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

/**
 * 检查 Docker 守护进程是否可用
 */
export async function isDockerAvailable(): Promise<boolean> {
  const result = await executeCommand('docker', ['info', '--format', '{{.ServerVersion}}']);
  return result.exitCode === 0;
}
