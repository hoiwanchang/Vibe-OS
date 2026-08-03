/**
 * Vitest 全局 setup
 *
 * CI 容器（debian:trixie-slim）默认以 root 运行，而服务层有
 * "禁止以 root 运行" 的安全红线（system-init.service 读取
 * process.getuid()）。本地开发以普通用户运行不受影响，但 CI
 * 会触发 403 FORBIDDEN 导致测试失败。
 *
 * 此处将 root 环境下的 getuid 打桩为普通用户，使测试结果与
 * 运行者身份无关。需要显式测试 root 行为的用例可自行覆盖
 * process.getuid（见 system-init.test.ts）。
 */
if (typeof process.getuid === 'function' && process.getuid() === 0) {
  process.getuid = () => 1000;
}
