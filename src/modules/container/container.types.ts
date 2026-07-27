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

/* ---------- Tailscale 多账户 / HeadScale 管理 ---------- */

/** Tailscale 账户（profile）条目 */
export interface TailscaleAccount {
  /** 账户唯一标识（profile id 或自定义名） */
  id: string;
  /** 显示名称（控制平面域名或自定义标签） */
  label: string;
  /** 控制平面地址（headscale / 官方 control URL） */
  controlUrl: string;
  /** 登录用户邮箱（如可获取） */
  loginName: string;
  /** 是否为当前激活账户 */
  active: boolean;
}

/** Tailscale 登录请求（支持 headscale 第三方服务器） */
export interface TailscaleLoginRequest {
  /** 控制平面地址，headscale 服务器 URL（如 http://10.0.0.1:8080）或官方默认 */
  controlUrl?: string;
  /** 预认证密钥（headscale 场景免交互登录） */
  authKey?: string;
  /** 账户标签（用于多账户区分，默认取 controlUrl 主机名） */
  label?: string;
  /** 是否作为 exit node 通告自身 */
  exitNode?: boolean;
  /** 是否接受子网路由 */
  acceptRoutes?: boolean;
}

/** Tailscale 登录响应 */
export interface TailscaleLoginResponse {
  /** 登录后的后端状态 */
  backendState: string;
  /** 需要用户访问的认证 URL（无 authKey 时由 tailscale 返回） */
  authUrl: string | null;
  /** 当前激活账户 */
  account: TailscaleAccount;
}

/** Tailscale 偏好设置（set 命令可配置项） */
export interface TailscalePrefs {
  /** 是否接受子网路由 */
  acceptRoutes: boolean;
  /** 使用的 exit node 节点 IP（空字符串表示不使用） */
  exitNode: string;
  /** 是否允许 LAN 流量绕过 exit node */
  exitNodeAllowLanAccess: boolean;
  /** 是否通告自身为 exit node */
  advertiseExitNode: boolean;
}

/** Tailscale 管理综合报告（状态 + 账户 + 偏好） */
export interface TailscaleManageReport {
  /** 基础状态报告 */
  report: TailscaleStatusResponse;
  /** 已配置账户列表 */
  accounts: TailscaleAccount[];
  /** 当前偏好设置 */
  prefs: TailscalePrefs;
}
