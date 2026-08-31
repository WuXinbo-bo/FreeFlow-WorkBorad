import {
  buildSceneIndex,
  invalidateSceneIndex,
  querySceneIndex,
  resolveSceneIndex,
} from "./scene/sceneIndex.js";

export function buildHitTestSpatialIndex(items, options = {}) {
  return buildSceneIndex(items, options);
}

export function resolveHitTestSpatialIndex(items, options = {}) {
  return resolveSceneIndex(items, options);
}

export function invalidateHitTestSpatialIndex(items) {
  return invalidateSceneIndex(items);
}

export function queryHitTestSpatialIndex(index, bounds) {
  return querySceneIndex(index, bounds);
}
