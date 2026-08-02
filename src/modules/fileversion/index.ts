/**
 * 模块：文件版本控制
 */
import fileversionRoutes from './fileversion.routes.js';

export { fileversionRoutes };
export type {
  VersionPolicyMode,
  VersionPolicyConfig,
  VersionEntry,
  VersionListResult,
  VersionRestoreResult,
  VersionDeleteResult,
} from './fileversion.types.js';
