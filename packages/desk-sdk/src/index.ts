export * from './types';
export { defineDeskApp } from './define';
export {
  DESK_ORIGINS,
  DeskRefusedError,
  assertDeskContext,
  isAllowedDeskOrigin,
  isDeskContext,
} from './guards';
export type { DeskRefusalReason } from './guards';
export const SDK_VERSION = '1.0.0';
