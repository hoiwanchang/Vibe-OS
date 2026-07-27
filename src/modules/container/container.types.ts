/**
 * 模块3：Docker 与 Tailscale 服务编排 — 类型定义
 */

/** 容器部署请求 */
export interface ContainerDeployRequest {
  /** 容器名称（唯一） */
  name: string;
  /** Docker 镜像（含 tag） */
  image: string;
  /** 端口映射 */
  ports?: Array<{
    host: number;
    container: number;
  }>;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 卷挂载（host 路径必须在 /data/ 内） */
  volumes?: Array<{
    host: string;
    container: string;
    readonly?: boolean;
  }>;
  /** 内存限制（如 "512m", "2g"） */
  memoryLimit?: string;
  /** CPU 限制（如 1.5） */
  cpuLimit?: number;
  /** 重启策略 */
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  /** Docker 网络名 */
  network?: string;
}

/** 容器部署响应 */
export interface ContainerDeployResponse {
  /** 容器 ID */
  containerId: string;
  /** 容器名称 */
  name: string;
  /** 镜像 */
  image: string;
  /** 部署状态 */
  status: string;
}

/** 容器信息 */
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  createdAt: string;
}

/** 容器日志结果 */
export interface ContainerLogResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** 应用目录初始化请求 */
export interface AppDirsInitRequest {
  /** 应用名（与容器名同命名规范） */
  appname: string;
}

/** 应用目录初始化响应 */
export interface AppDirsInitResponse {
  /** 应用根目录 */
  appDir: string;
  /** 新创建的目录列表 */
  createdDirs: string[];
}

/** Tailscale 节点状态 */
export interface TailscaleStatus {
  /** 后端状态（Running, Stopped, NotRunning 等） */
  backendState: string;
  /** 本节点信息 */
  self: {
    hostname: string;
    ips: string[];
    os: string;
    online: boolean;
  } | null;
  /** 对等节点列表 */
  peers: TailscalePeer[];
  /** 错误信息（如有） */
  error: string | null;
}

/** Tailscale 对等节点 */
export interface TailscalePeer {
  id: string;
  hostname: string;
  ips: string[];
  os: string;
  online: boolean;
  active: boolean;
}

/** Subnet Router 路由条目 */
export interface SubnetRoute {
  /** CIDR 格式子网 */
  cidr: string;
  /** 是否已通告 */
  advertised: boolean;
  /** 是否已批准 */
  approved: boolean;
}

/** Tailscale 状态 API 响应 */
export interface TailscaleStatusResponse {
  /** 检测时间戳 */
  timestamp: string;
  /** Tailscale 是否可用 */
  available: boolean;
  /** 节点状态 */
  status: TailscaleStatus;
  /** Subnet Router 路由 */
  subnetRoutes: SubnetRoute[];
}
