/**
 * 网络配置状态仓库
 * 网络接口管理 / DNS 配置 / 防火墙规则 / 端口监控 / WoL
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { networkApi } from '@/api';
import type {
  DnsConfig,
  FirewallRule,
  FirewallRuleRequest,
  InterfaceConfigRequest,
  ListeningPort,
  NetInterface,
  WolDevice,
} from '@/api/types';

export const useNetworkStore = defineStore('network', () => {
  /** 网络接口列表 */
  const interfaces = ref<NetInterface[]>([]);
  /** DNS 配置 */
  const dns = ref<DnsConfig>({ servers: [], search: [] });
  /** 防火墙规则 */
  const firewallRules = ref<FirewallRule[]>([]);
  /** 监听端口 */
  const listeningPorts = ref<ListeningPort[]>([]);
  /** WoL 设备 */
  const wolDevices = ref<WolDevice[]>([]);
  /** 加载中 */
  const loading = ref(false);
  /** 最近一次错误 */
  const lastError = ref<string | null>(null);

  /** 拉取接口列表 */
  async function fetchInterfaces(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      interfaces.value = await networkApi.interfaces();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 配置接口（DHCP/静态） */
  async function updateInterface(name: string, payload: InterfaceConfigRequest): Promise<boolean> {
    try {
      await networkApi.configureInterface(name, payload);
      await fetchInterfaces();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 拉取 DNS 配置 */
  async function fetchDns(): Promise<void> {
    try {
      dns.value = await networkApi.dns();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 更新 DNS 配置 */
  async function updateDns(payload: DnsConfig): Promise<boolean> {
    try {
      dns.value = await networkApi.setDns(payload);
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 拉取防火墙规则 */
  async function fetchFirewall(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      firewallRules.value = await networkApi.firewall();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 添加防火墙规则 */
  async function addRule(payload: FirewallRuleRequest): Promise<boolean> {
    try {
      await networkApi.addFirewallRule(payload);
      await fetchFirewall();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 删除防火墙规则 */
  async function removeRule(id: string): Promise<boolean> {
    try {
      await networkApi.removeFirewallRule(id);
      await fetchFirewall();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 拉取监听端口 */
  async function fetchPorts(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      listeningPorts.value = await networkApi.ports();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 拉取 WoL 设备 */
  async function fetchWolDevices(): Promise<void> {
    try {
      wolDevices.value = await networkApi.wolDevices();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 发送 WoL 魔术包 */
  async function sendWol(mac: string, broadcast?: string): Promise<boolean> {
    try {
      await networkApi.sendWol(mac, broadcast);
      await fetchWolDevices();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  return {
    interfaces,
    dns,
    firewallRules,
    listeningPorts,
    wolDevices,
    loading,
    lastError,
    fetchInterfaces,
    updateInterface,
    fetchDns,
    updateDns,
    fetchFirewall,
    addRule,
    removeRule,
    fetchPorts,
    fetchWolDevices,
    sendWol,
  };
});
