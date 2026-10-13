const assert = require('node:assert/strict');

async function main() {
  const { createImagePreviewCache } = await import('../public/src/engines/canvas2d-core/perf/imagePreviewCache.js');
  const originals = { Image: global.Image, createImageBitmap: global.createImageBitmap, document: global.document };
  const loads = [], bitmaps = [];
  class FakeImage {
    naturalWidth = 2048;
    naturalHeight = 1024;
    set src(value) { this.source = value; if (value) loads.push(this); }
  }
  const bitmap = (width, height) => ({ width, height, closed: false, close() { this.closed = true; } });
  global.Image = FakeImage;
  global.createImageBitmap = async (_image, options) => {
    const value = bitmap(options.resizeWidth, options.resizeHeight);
    bitmaps.push(value);
    return value;
  };
  const tick = () => new Promise(resolve => setTimeout(resolve, 5));
  const item = { id: 'image', width: 256, height: 128 };
  let cache = createImagePreviewCache();
  try {
    const events = [];
    const helpers = { onImageResourceStateChange: (...args) => events.push(args) };
    const a = cache.request('a', item, helpers);
    assert.equal(cache.request('a', item, helpers), a, 'duplicate requests must share a decode');
    cache.request('b', { ...item, id: 'b' }, helpers);
    cache.request('c', { ...item, id: 'c' }, helpers);
    await tick();
    assert.equal(loads.length, 2, 'decode concurrency must be bounded');
    loads[0].onload();
    await tick();
    assert.equal(loads.length, 3, 'completion must resume the queue');
    assert.equal(a.naturalWidth, 2048, 'preview must preserve original metadata');
    assert.equal(a.image.width, 256);
    assert.equal(a.image.height, 128);
    assert.equal(loads[0].source, '', 'full-resolution source must be released');
    assert.equal(events.filter(e => e[0] === 'image').length, 1);
    const oldPixels = a.image;
    assert.equal(cache.request('a', { ...item, width: 512 }), a, 'upgrade must retain previous valid pixels');
    loads[1].onload(); loads[2].onload();
    await tick();
    loads[3].onload();
    await tick();
    const upgraded = cache.request('a', { ...item, width: 512 });
    assert.equal(upgraded.image.width, 512, 'higher-quality entry must satisfy smaller requests without another decode');
    assert.equal(oldPixels.closed, true, 'completed upgrade must release redundant smaller pixels');
    const cropped = cache.request('crop', { ...item, crop: { w: .25, h: .5 } });
    await tick(); loads.at(-1).onload(); await tick();
    assert.equal(cropped.image.width, 1024, 'crop must reserve enough pixels for the visible region');
    cache.retainSources(new Set(['a']));
    assert.equal(cropped.image.closed, true, 'removed resources must be released');
    cache.trimToBytes(0);
    assert.equal(cache.getStats().byteSize, 0);
    assert(bitmaps.every(image => image.closed), 'eviction must close all bitmap resources');

    const medium = cache.request('medium', { ...item, width: 350 });
    assert.equal(medium.edge, 384, 'preview tiers should avoid unnecessary power-of-two over-allocation');
    cache.clear();

    let finishBitmap;
    global.createImageBitmap = () => new Promise(resolve => { finishBitmap = resolve; });
    cache.request('stale', item, helpers);
    await tick(); loads.at(-1).onload(); await tick();
    cache.clear();
    cache.request('new', item, helpers);
    const stale = bitmap(256, 128);
    finishBitmap(stale);
    await tick();
    assert(stale.closed, 'late completion after clear must release its bitmap');
    assert(!events.some(e => e[1] === 'ready' && e[2] > 0), 'stale completion must not notify a new board');
    assert.equal(cache.getStats().size, 1, 'stale completion must not repopulate the cache');
    cache.clear(); await tick();
    assert.equal(cache.getStats().decoding, 0, 'clear must cancel in-flight image loads');

    global.createImageBitmap = async () => { throw new Error('unsupported bitmap format'); };
    global.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
    const fallback = cache.request('fallback', item, helpers);
    await tick(); loads.at(-1).onload(); await tick();
    assert(fallback.ready, 'bitmap failure must fall back to a canvas');
    const failure = cache.request('bad', item, helpers);
    await tick(); loads.at(-1).onerror(); await tick();
    assert.equal(failure.status, 'error');
    assert.equal(failure.listeners.size, 0);
    cache.request('bad', item, helpers);
    assert.equal(failure.listeners.size, 0, 'failed entries must not retain dead callbacks');
    cache.clear();
    assert.equal(fallback.image.width, 0, 'fallback canvas memory must be released');
    console.log('[check-image-preview-cache] concurrency, quality, cancellation, reentry and release passed');
  } finally {
    cache.clear();
    Object.assign(global, originals);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
