/**
 * 用户与权限状态仓库
 * 用户列表、创建用户、Tailscale ACL 策略编辑
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { tailscaleApi, userApi } from '@/api';
import type { CreateUserRequest, ManagedUser } from '@/api/types';

/** ACL 规则条目（可视化编辑模型） */
export interface AclRule {
  id: number;
  action: 'accept' | 'deny';
  src: string[];
  dst: string[];
}

/** ACL 策略（Tailscale 格式子集） */
export interface AclPolicy {
  acls: Array<{ action: string; src: string[]; dst: string[] }>;
  hosts?: Record<string, string>;
}

export const useUsersStore = defineStore('users', () => {
  const users = ref<ManagedUser[]>([]);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  /** ACL 规则列表（可视化编辑状态） */
  const aclRules = ref<AclRule[]>([
    { id: 1, action: 'accept', src: ['*'], dst: ['*:*'] },
  ]);
  const aclHosts = ref<Array<{ name: string; ip: string }>>([]);
  /** ACL 是否有未保存修改 */
  const aclDirty = ref(false);
  const aclPushing = ref(false);

  let nextRuleId = 100;

  /** 拉取用户列表 */
  async function fetchUsers(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const res = await userApi.list();
      users.value = res.users;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 创建用户（后端自动创建 /data/{uid}/ 目录） */
  async function createUser(payload: CreateUserRequest): Promise<void> {
    await userApi.create(payload);
    await fetchUsers();
  }

  /** 添加 ACL 规则 */
  function addAclRule(): void {
    aclRules.value.push({ id: nextRuleId++, action: 'accept', src: ['*'], dst: ['*:*'] });
    aclDirty.value = true;
  }

  /** 删除 ACL 规则 */
  function removeAclRule(id: number): void {
    aclRules.value = aclRules.value.filter((r) => r.id !== id);
    aclDirty.value = true;
  }

  /** 标记 ACL 已修改 */
  function markAclDirty(): void {
    aclDirty.value = true;
  }

  /** 将可视化规则序列化为 Tailscale ACL 策略 */
  function buildAclPolicy(): AclPolicy {
    const policy: AclPolicy = {
      acls: aclRules.value.map((r) => ({
        action: r.action,
        src: r.src.filter((s) => s.trim() !== ''),
        dst: r.dst.filter((d) => d.trim() !== ''),
      })),
    };
    const hosts: Record<string, string> = {};
    for (const h of aclHosts.value) {
      if (h.name.trim() && h.ip.trim()) hosts[h.name.trim()] = h.ip.trim();
    }
    if (Object.keys(hosts).length > 0) policy.hosts = hosts;
    return policy;
  }

  /** 下发 ACL 策略到后端 */
  async function pushAcl(): Promise<void> {
    aclPushing.value = true;
    try {
      await tailscaleApi.pushAcl(
        buildAclPolicy() as unknown as Record<string, unknown>,
      );
      aclDirty.value = false;
    } finally {
      aclPushing.value = false;
    }
  }

  return {
    users,
    loading,
    lastError,
    aclRules,
    aclHosts,
    aclDirty,
    aclPushing,
    fetchUsers,
    createUser,
    addAclRule,
    removeAclRule,
    markAclDirty,
    buildAclPolicy,
    pushAcl,
  };
});
