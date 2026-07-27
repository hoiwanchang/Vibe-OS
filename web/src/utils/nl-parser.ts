/**
 * 自然语言指令解析器（纯函数，单元测试覆盖）
 * 将中英文混合的自然语言指令解析为结构化部署参数，
 * 供 AI 应用管理中心的"自然语言配置"调用后端 API 完成变更
 */

/** 端口映射条目 */
export interface PortMapping {
  host: number;
  container: number;
}

/** 解析后的部署参数（所有字段可选） */
export interface ParsedDeployParams {
  name?: string;
  image?: string;
  ports?: PortMapping[];
  env?: Record<string, string>;
  memoryLimit?: string;
  cpuLimit?: number;
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
}

/** 解析结果 */
export interface ParseResult {
  params: ParsedDeployParams;
  /** 人类可读的解析摘要（用于确认弹窗） */
  summary: string[];
  /** 无法识别的片段（提示用户检查） */
  warnings: string[];
}

/** 应用模板注册表：名称 → 默认镜像与端口 */
const APP_TEMPLATES: Record<
  string,
  { image: string; port: number; label: string }
> = {
  ollama: { image: 'ollama/ollama:latest', port: 11434, label: 'Ollama 本地大模型' },
  dify: { image: 'langgenius/dify-api:latest', port: 5001, label: 'Dify AI 应用平台' },
  'open-webui': { image: 'ghcr.io/open-webui/open-webui:main', port: 8080, label: 'Open WebUI' },
  whisper: {
    image: 'onerahmet/openai-whisper-asr-webservice:latest',
    port: 9000,
    label: 'Whisper 语音识别',
  },
  comfyui: { image: 'ghcr.io/ai-dock/comfyui:latest', port: 8188, label: 'ComfyUI 图像生成' },
  'stable-diffusion': {
    image: 'lscr.io/linuxserver/stable-diffusion-webui:latest',
    port: 7860,
    label: 'Stable Diffusion WebUI',
  },
  lobechat: { image: 'lobehub/lobe-chat:latest', port: 3210, label: 'LobeChat' },
  anythingllm: { image: 'mintplexlabs/anythingllm:latest', port: 3001, label: 'AnythingLLM' },
};

/**
 * 从指令中提取应用名（优先匹配模板关键词）
 */
function extractAppName(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const key of Object.keys(APP_TEMPLATES)) {
    if (lower.includes(key)) return key;
  }
  // 中文别名映射
  const aliases: Array<[RegExp, string]> = [
    [/大模型|本地模型/, 'ollama'],
    [/语音识别/, 'whisper'],
    [/画图|图像生成|绘图/, 'comfyui'],
  ];
  for (const [pattern, name] of aliases) {
    if (pattern.test(text)) return name;
  }
  return undefined;
}

/**
 * 提取镜像名（形如 repo/image:tag）
 */
function extractImage(text: string): string | undefined {
  const match = text.match(
    /(?:镜像|image)[^a-z0-9]*([a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?)/i,
  );
  return match?.[1];
}

/**
 * 提取端口映射
 * 支持："端口 8080"、"映射 8080:80"、"port 8080->80"、"8080 映射到 80"
 */
function extractPorts(text: string): PortMapping[] | undefined {
  const ports: PortMapping[] = [];

  // host:container / host->container
  const pairPattern = /(\d{1,5})\s*(?::|->|→|映射到)\s*(\d{1,5})/g;
  let match: RegExpExecArray | null;
  while ((match = pairPattern.exec(text)) !== null) {
    const host = parseInt(match[1] ?? '', 10);
    const container = parseInt(match[2] ?? '', 10);
    if (host >= 1 && host <= 65535 && container >= 1 && container <= 65535) {
      ports.push({ host, container });
    }
  }

  // 单个端口："端口 8080" / "port 8080"
  if (ports.length === 0) {
    const single = text.match(/(?:端口|port)\D{0,4}(\d{1,5})/i);
    if (single?.[1]) {
      const host = parseInt(single[1], 10);
      if (host >= 1 && host <= 65535) ports.push({ host, container: host });
    }
  }

  return ports.length > 0 ? ports : undefined;
}

/**
 * 提取环境变量 KEY=VALUE（支持多个）
 */
function extractEnv(text: string): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  const pattern = /([A-Z][A-Z0-9_]{1,40})=("[^"]*"|'[^']*'|[\w./-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1];
    let value = match[2] ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

/**
 * 提取内存限制："内存 2g"、"memory 512m"、"限制 4G 内存"
 */
function extractMemory(text: string): string | undefined {
  const match = text.match(/(?:内存|memory|mem)\D{0,6}(\d+(?:\.\d+)?)\s*([kmgt]b?)/i);
  if (!match) return undefined;
  const value = match[1];
  const unit = (match[2] ?? 'm').toLowerCase().replace(/b$/, '');
  if (!value) return undefined;
  return `${value}${unit}`;
}

/**
 * 提取 CPU 限制："CPU 2"、"2 核"、"cpu limit 1.5"
 */
function extractCpu(text: string): number | undefined {
  const match = text.match(/cpu\D{0,6}(\d+(?:\.\d+)?)/i) ?? text.match(/(\d+(?:\.\d+)?)\s*(?:核|cores?)/i);
  if (!match?.[1]) return undefined;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * 提取重启策略
 */
function extractRestartPolicy(
  text: string,
): ParsedDeployParams['restartPolicy'] | undefined {
  const lower = text.toLowerCase();
  if (/always|总是重启|始终重启/.test(lower)) return 'always';
  if (/unless.?stopped|除非停止|非手动停止/.test(lower)) return 'unless-stopped';
  if (/on.?failure|失败时重启|出错重启/.test(lower)) return 'on-failure';
  if (/不重启|never|no restart/.test(lower)) return 'no';
  return undefined;
}

/**
 * 解析自然语言部署指令
 * @param input - 用户输入的自然语言指令
 * @returns 结构化参数 + 摘要 + 警告
 */
export function parseDeployCommand(input: string): ParseResult {
  const text = input.trim();
  const params: ParsedDeployParams = {};
  const summary: string[] = [];
  const warnings: string[] = [];

  if (!text) {
    return { params, summary, warnings: ['指令为空'] };
  }

  // 应用名（模板匹配）
  const appName = extractAppName(text);
  if (appName) {
    params.name = appName;
    const template = APP_TEMPLATES[appName];
    if (template) {
      params.image = template.image;
      summary.push(`应用：${template.label}（${appName}）`);
      summary.push(`默认镜像：${template.image}`);
    }
  }

  // 显式镜像优先于模板默认值
  const image = extractImage(text);
  if (image) {
    params.image = image;
    const idx = summary.findIndex((s) => s.startsWith('默认镜像'));
    if (idx >= 0) summary.splice(idx, 1);
    summary.push(`镜像：${image}`);
  }

  // 端口
  const ports = extractPorts(text);
  if (ports) {
    params.ports = ports;
    summary.push(
      `端口映射：${ports.map((p) => `${p.host} → ${p.container}`).join('、')}`,
    );
  } else if (appName && APP_TEMPLATES[appName]) {
    // 模板默认端口
    const defaultPort = APP_TEMPLATES[appName]?.port;
    if (defaultPort) {
      params.ports = [{ host: defaultPort, container: defaultPort }];
      summary.push(`端口映射：${defaultPort} → ${defaultPort}（模板默认）`);
    }
  }

  // 环境变量
  const env = extractEnv(text);
  if (env) {
    params.env = env;
    summary.push(
      `环境变量：${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('、')}`,
    );
  }

  // 内存
  const memoryLimit = extractMemory(text);
  if (memoryLimit) {
    params.memoryLimit = memoryLimit;
    summary.push(`内存限制：${memoryLimit}`);
  }

  // CPU
  const cpuLimit = extractCpu(text);
  if (cpuLimit !== undefined) {
    params.cpuLimit = cpuLimit;
    summary.push(`CPU 限制：${cpuLimit} 核`);
  }

  // 重启策略
  const restartPolicy = extractRestartPolicy(text);
  if (restartPolicy) {
    params.restartPolicy = restartPolicy;
    summary.push(`重启策略：${restartPolicy}`);
  }

  if (!params.name && !params.image) {
    warnings.push('未识别到应用名或镜像，请指明要部署的应用（如 ollama、dify）');
  }

  return { params, summary, warnings };
}

/**
 * 获取全部应用模板列表（供 UI 展示）
 */
export function listAppTemplates(): Array<{
  name: string;
  image: string;
  port: number;
  label: string;
}> {
  return Object.entries(APP_TEMPLATES).map(([name, t]) => ({
    name,
    image: t.image,
    port: t.port,
    label: t.label,
  }));
}
