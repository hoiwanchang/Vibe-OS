/**
 * 模块：全文搜索
 */
export { default as searchRoutes } from './search.routes.js';
export * as searchService from './search.service.js';
export type {
  SearchResultItem,
  SearchResults,
  SearchParams,
  IndexStatus,
  ReindexResult,
} from './search.types.js';
