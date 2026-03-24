/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiContext from "../aiContext.js";
import type * as aiTools from "../aiTools.js";
import type * as auth from "../auth.js";
import type * as budget from "../budget.js";
import type * as chats from "../chats.js";
import type * as conflicts from "../conflicts.js";
import type * as features from "../features.js";
import type * as projectGeneration from "../projectGeneration.js";
import type * as projects from "../projects.js";
import type * as scheduling from "../scheduling.js";
import type * as tasks from "../tasks.js";
import type * as wbsPersistence from "../wbsPersistence.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiContext: typeof aiContext;
  aiTools: typeof aiTools;
  auth: typeof auth;
  budget: typeof budget;
  chats: typeof chats;
  conflicts: typeof conflicts;
  features: typeof features;
  projectGeneration: typeof projectGeneration;
  projects: typeof projects;
  scheduling: typeof scheduling;
  tasks: typeof tasks;
  wbsPersistence: typeof wbsPersistence;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
