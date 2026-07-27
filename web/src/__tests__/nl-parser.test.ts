/**
 * 自然语言指令解析器 — 单元测试
 */
import { describe, it, expect } from 'vitest';
import { listAppTemplates, parseDeployCommand } from '../utils/nl-parser';

describe('parseDeployCommand — 应用识别', () => {
  it('应识别模板应用并填充默认镜像与端口', () => {
    const result = parseDeployCommand('部署 ollama');
    expect(result.params.name).toBe('ollama');
    expect(result.params.image).toBe('ollama/ollama:latest');
    expect(result.params.ports).toEqual([{ host: 11434, container: 11434 }]);
    expect(result.warnings).toHaveLength(0);
  });

  it('应支持中文别名（大模型 → ollama）', () => {
    const result = parseDeployCommand('帮我部署一个大模型服务');
    expect(result.params.name).toBe('ollama');
  });

  it('应支持中文别名（语音识别 → whisper）', () => {
    const result = parseDeployCommand('部署语音识别');
    expect(result.params.name).toBe('whisper');
  });

  it('无法识别应用时应给出警告', () => {
    const result = parseDeployCommand('随便跑点什么');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('空指令应返回空警告提示', () => {
    const result = parseDeployCommand('   ');
    expect(result.warnings).toContain('指令为空');
  });
});

describe('parseDeployCommand — 镜像', () => {
  it('显式镜像应覆盖模板默认值', () => {
    const result = parseDeployCommand('部署 ollama 镜像 myrepo/ollama:v2');
    expect(result.params.image).toBe('myrepo/ollama:v2');
    expect(result.summary.some((s) => s.includes('myrepo/ollama:v2'))).toBe(true);
  });

  it('无模板时仅有镜像也可执行', () => {
    const result = parseDeployCommand('image custom/app:1.0');
    expect(result.params.image).toBe('custom/app:1.0');
    expect(result.warnings).toHaveLength(0);
  });
});

describe('parseDeployCommand — 端口', () => {
  it('应解析 host:container 映射', () => {
    const result = parseDeployCommand('部署 dify 映射 5001:5001');
    expect(result.params.ports).toEqual([{ host: 5001, container: 5001 }]);
  });

  it('应解析箭头映射 8080->80', () => {
    const result = parseDeployCommand('部署 dify 端口 8080->80');
    expect(result.params.ports).toEqual([{ host: 8080, container: 80 }]);
  });

  it('应解析中文"映射到"', () => {
    const result = parseDeployCommand('部署 dify 9000 映射到 80');
    expect(result.params.ports).toEqual([{ host: 9000, container: 80 }]);
  });

  it('单端口应映射为同名端口', () => {
    const result = parseDeployCommand('部署 whisper 端口 9000');
    expect(result.params.ports).toEqual([{ host: 9000, container: 9000 }]);
  });

  it('非法端口应被忽略', () => {
    const result = parseDeployCommand('部署 dify 映射 99999:80');
    // 99999 超出范围，不产生端口映射，但模板默认端口兜底
    expect(result.params.ports).toEqual([{ host: 5001, container: 5001 }]);
  });
});

describe('parseDeployCommand — 环境变量', () => {
  it('应解析 KEY=VALUE', () => {
    const result = parseDeployCommand('部署 whisper MODELS=base');
    expect(result.params.env).toEqual({ MODELS: 'base' });
  });

  it('应解析带引号的值与多个变量', () => {
    const result = parseDeployCommand(
      '部署 dify SECRET="my secret" DEBUG=true',
    );
    expect(result.params.env).toEqual({ SECRET: 'my secret', DEBUG: 'true' });
  });
});

describe('parseDeployCommand — 资源限制', () => {
  it('应解析内存限制（中文）', () => {
    const result = parseDeployCommand('部署 ollama 内存 4g');
    expect(result.params.memoryLimit).toBe('4g');
  });

  it('应解析内存限制（英文带 b 后缀）', () => {
    const result = parseDeployCommand('deploy ollama memory 512mb');
    expect(result.params.memoryLimit).toBe('512m');
  });

  it('应解析 CPU 核数', () => {
    expect(parseDeployCommand('部署 ollama CPU 2').params.cpuLimit).toBe(2);
    expect(parseDeployCommand('部署 ollama 限制 1.5 核').params.cpuLimit).toBe(1.5);
  });
});

describe('parseDeployCommand — 重启策略', () => {
  it('应解析各类重启策略表述', () => {
    expect(parseDeployCommand('部署 ollama 总是重启').params.restartPolicy).toBe('always');
    expect(parseDeployCommand('部署 ollama unless-stopped').params.restartPolicy).toBe('unless-stopped');
    expect(parseDeployCommand('部署 ollama 失败时重启').params.restartPolicy).toBe('on-failure');
    expect(parseDeployCommand('部署 ollama 不重启').params.restartPolicy).toBe('no');
  });
});

describe('parseDeployCommand — 综合指令', () => {
  it('应完整解析复合指令', () => {
    const result = parseDeployCommand(
      '部署 ollama，端口 11434，内存限制 4g，CPU 4 核，总是重启，环境变量 OLLAMA_HOST=0.0.0.0',
    );
    expect(result.params).toMatchObject({
      name: 'ollama',
      image: 'ollama/ollama:latest',
      memoryLimit: '4g',
      cpuLimit: 4,
      restartPolicy: 'always',
      env: { OLLAMA_HOST: '0.0.0.0' },
    });
    expect(result.summary.length).toBeGreaterThanOrEqual(5);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('listAppTemplates', () => {
  it('应返回非空模板列表且字段完整', () => {
    const templates = listAppTemplates();
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.image).toContain('/');
      expect(t.port).toBeGreaterThan(0);
      expect(t.label).toBeTruthy();
    }
  });
});
