/**
 * 模块：SSD 缓存管理 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn(),
  executeCommandStrict: vi.fn(),
}));

import { executeCommand, executeCommandStrict } from '../../../system/command-executor.js';
import * as service from '../ssd-cache.service.js';

const mockExec = vi.mocked(executeCommand);
const mockExecStrict = vi.mocked(executeCommandStrict);

describe('SSD 缓存管理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ---------- createCache ---------- */

  describe('createCache', () => {
    it('应成功创建 SSD 缓存', async () => {
      // lvs 检查 LV 存在
      mockExec.mockResolvedValueOnce({ stdout: 'lv_data\n', stderr: '', exitCode: 0 });
      // lvs 检查无缓存
      mockExec.mockResolvedValueOnce({ stdout: '-wi-a-----\n', stderr: '', exitCode: 0 });
      // pvs 获取 SSD 大小
      mockExecStrict.mockResolvedValueOnce({ stdout: '1000000000\n', stderr: '', exitCode: 0 });
      // lvcreate 创建 cache pool
      mockExecStrict.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      // lvconvert 关联缓存
      mockExecStrict.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.createCache({
        ssdDevice: '/dev/sdb',
        poolDevice: '/dev/vg0/lv_data',
        mode: 'readwrite',
      });

      expect(result.name).toBe('vg0/lv_data');
      expect(result.mode).toBe('readwrite');
      expect(mockExecStrict).toHaveBeenCalledWith('lvcreate', expect.arrayContaining(['--type', 'cache-pool']));
      expect(mockExecStrict).toHaveBeenCalledWith('lvconvert', expect.arrayContaining(['--type', 'cache']));
    });

    it('LV 不存在时应抛出 404', async () => {
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 5 });

      await expect(
        service.createCache({ ssdDevice: '/dev/sdb', poolDevice: '/dev/vg0/lv_x', mode: 'read' }),
      ).rejects.toThrow('不存在');
    });

    it('已有缓存时应抛出 409', async () => {
      mockExec.mockResolvedValueOnce({ stdout: 'lv_data\n', stderr: '', exitCode: 0 });
      mockExec.mockResolvedValueOnce({ stdout: 'Cwi-a-----\n', stderr: '', exitCode: 0 });

      await expect(
        service.createCache({ ssdDevice: '/dev/sdb', poolDevice: '/dev/vg0/lv_data', mode: 'read' }),
      ).rejects.toThrow('已配置缓存');
    });

    it('无效 LV 路径应抛出 400', async () => {
      await expect(
        service.createCache({ ssdDevice: '/dev/sdb', poolDevice: 'invalid', mode: 'read' }),
      ).rejects.toThrow('无效的 LV 路径');
    });
  });

  /* ---------- removeCache ---------- */

  describe('removeCache', () => {
    it('应成功移除缓存', async () => {
      mockExec.mockResolvedValueOnce({ stdout: 'lv_data\n', stderr: '', exitCode: 0 });
      mockExecStrict.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.removeCache('vg0/lv_data');
      expect(result.name).toBe('vg0/lv_data');
      expect(mockExecStrict).toHaveBeenCalledWith('lvconvert', ['--uncache', 'vg0/lv_data']);
    });

    it('LV 不存在时应抛出 404', async () => {
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 5 });

      await expect(service.removeCache('vg0/lv_x')).rejects.toThrow('不存在');
    });
  });

  /* ---------- getStatusList ---------- */

  describe('getStatusList', () => {
    it('无缓存时应返回空数组', async () => {
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const list = await service.getStatusList();
      expect(list).toEqual([]);
    });

    it('应解析缓存状态列表', async () => {
      // lvs 返回缓存 LV
      mockExec.mockResolvedValueOnce({
        stdout: '  lv_data vg0 Cwi-a-C--- 1000000000 lv_data_cache\n',
        stderr: '',
        exitCode: 0,
      });
      // dmsetup status
      mockExec.mockResolvedValueOnce({
        stdout: '0 2000000 cache 8 100/5000 128 500/2000 100 200 50 30 0\n',
        stderr: '',
        exitCode: 0,
      });
      // pvs 查询 PV
      mockExec.mockResolvedValueOnce({
        stdout: '  /dev/sdb\n',
        stderr: '',
        exitCode: 0,
      });
      // smartctl
      mockExec.mockResolvedValueOnce({
        stdout: '194 Temperature_Celsius 0x0022 030 040 000 Old_age Always - 30\n231 Media_Wearout_Indicator 0x0032 095 100 000 Old_age Always - 95\n',
        stderr: '',
        exitCode: 0,
      });

      const list = await service.getStatusList();
      expect(list.length).toBe(1);
      expect(list[0]!.name).toBe('vg0/lv_data');
      expect(list[0]!.temperature).toBe(30);
      expect(list[0]!.lifePercent).toBe(95);
    });
  });

  /* ---------- getCacheDetail ---------- */

  describe('getCacheDetail', () => {
    it('缓存不存在时应抛出 404', async () => {
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await expect(service.getCacheDetail('vg0/lv_x')).rejects.toThrow('不存在');
    });
  });
});
