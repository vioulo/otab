/**
 * 图钉数据的存储层。
 *
 * 全部数据都落在 storage.sync 里（随 Firefox Sync 跨设备同步），
 * 但按分组拆成多个 item 存放 —— storage.sync 单个 item 上限 8192 字节，
 * 把所有图钉塞进一个键会在条目变多后写不进去，而且写入失败是静默的。
 *
 * 存储布局：
 *   tmpinData                 索引，体积很小
 *                             { v: 2, groups: [{ id, name, expanded, chunks }] }
 *   tmpinPages:<groupId>:<n>  第 n 块图钉，形如 [[url, title, pinnedAt], ...]
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.PinStore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY_INDEX = 'tmpinData';
  const KEY_CHUNK_PREFIX = 'tmpinPages:';
  // 单项配额 8192 字节，留一半余量
  const CHUNK_MAX_BYTES = 4096;
  const FORMAT_VERSION = 2;

  let storageArea = null;

  // ---------- 环境 ----------

  function setStorageArea(area) {
    storageArea = area;
  }

  function getStorageArea() {
    if (storageArea) return storageArea;
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.sync) {
      return browser.storage.sync;
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      return chrome.storage.sync;
    }
    return null;
  }

  // 读取最近一次 API 调用的错误，浏览器只在回调执行期间提供它
  function lastError() {
    const runtimes = [];
    if (typeof browser !== 'undefined' && browser.runtime) runtimes.push(browser.runtime);
    if (typeof chrome !== 'undefined' && chrome.runtime) runtimes.push(chrome.runtime);

    for (const runtime of runtimes) {
      if (runtime.lastError) {
        return new Error(runtime.lastError.message || String(runtime.lastError));
      }
    }
    return null;
  }

  function byteLength(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    return unescape(encodeURIComponent(str)).length;
  }

  // ---------- 编解码 ----------

  function encodePage(page) {
    return [
      String(page.url || ''),
      String(page.title || ''),
      Number(page.pinnedAt) || 0,
    ];
  }

  function decodePage(tuple) {
    return {
      url: tuple[0] || '',
      title: tuple[1] || '',
      pinnedAt: tuple[2] || 0,
    };
  }

  // 把一组图钉切成若干块，保证每块序列化后不超过 maxBytes
  function chunkPages(pages, maxBytes) {
    const limit = maxBytes || CHUNK_MAX_BYTES;
    const chunks = [];
    let current = [];
    let size = 2; // '[]'

    for (const page of pages) {
      const tuple = encodePage(page);
      // 多算一个逗号，宁可保守也别超配额
      const tupleSize = byteLength(JSON.stringify(tuple)) + 1;

      if (tupleSize + 1 > limit) {
        throw new Error('单条图钉数据超过存储块配额');
      }
      if (current.length > 0 && size + tupleSize > limit) {
        chunks.push(current);
        current = [];
        size = 2;
      }
      current.push(tuple);
      size += tupleSize;
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
  }

  // 内存结构 -> 存储布局
  function buildLayout(data) {
    const groups = [];
    const chunks = {};
    const list = data && Array.isArray(data.groups) ? data.groups : [];

    for (const group of list) {
      const pages = Array.isArray(group.pages) ? group.pages : [];
      const blocks = chunkPages(pages);

      groups.push({
        id: String(group.id),
        name: String(group.name || ''),
        expanded: group.expanded !== false,
        chunks: blocks.length,
      });

      blocks.forEach((items, i) => {
        chunks[KEY_CHUNK_PREFIX + group.id + ':' + i] = items;
      });
    }

    return { index: { v: FORMAT_VERSION, groups }, chunks };
  }

  function parseIndex(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.v !== FORMAT_VERSION) return null;
    if (!Array.isArray(raw.groups)) return null;
    return raw;
  }

  // 旧版把所有图钉直接塞在 tmpinData.groups[].pages 里
  function isLegacyFormat(raw) {
    return !!raw && typeof raw === 'object' && Array.isArray(raw.groups) && !Object.prototype.hasOwnProperty.call(raw, 'v');
  }

  function fromLegacy(raw) {
    const list = raw && Array.isArray(raw.groups) ? raw.groups : [];
    return {
      groups: list.map((group) => ({
        id: String(group.id || ''),
        name: String(group.name || ''),
        expanded: group.expanded !== false,
        pages: (Array.isArray(group.pages) ? group.pages : []).map((page) => ({
          url: String(page.url || ''),
          title: String(page.title || ''),
          pinnedAt: Number(page.pinnedAt) || 0,
        })),
      })),
    };
  }

  // 存储布局 -> 内存结构
  function fromStorage(index, all) {
    const groups = index.groups.map((group) => {
      const pages = [];
      for (let i = 0; i < (group.chunks || 0); i++) {
        const items = all[KEY_CHUNK_PREFIX + group.id + ':' + i];
        if (Array.isArray(items)) {
          for (const tuple of items) pages.push(decodePage(tuple));
        }
      }
      return {
        id: group.id,
        name: group.name,
        expanded: group.expanded !== false,
        pages,
      };
    });
    return { groups };
  }

  // 找出这次写入后不再需要的旧分块键
  function computeStaleKeys(prevIndex, layout) {
    if (!prevIndex || !Array.isArray(prevIndex.groups)) return [];

    const nextChunks = {};
    for (const group of layout.index.groups) {
      nextChunks[group.id] = group.chunks;
    }

    const stale = [];
    for (const group of prevIndex.groups) {
      const count = nextChunks[group.id];
      if (count === undefined) {
        // 分组被删除，它的所有分块都要清掉
        for (let i = 0; i < (group.chunks || 0); i++) {
          stale.push(KEY_CHUNK_PREFIX + group.id + ':' + i);
        }
      } else {
        for (let i = count; i < (group.chunks || 0); i++) {
          stale.push(KEY_CHUNK_PREFIX + group.id + ':' + i);
        }
      }
    }
    return stale;
  }

  // ---------- 读写 ----------

  /**
   * 读取全部图钉数据。
   * @param {function(Error|null, Object|null)} cb
   */
  function read(cb) {
    const area = getStorageArea();
    if (!area) {
      cb(new Error('storage.sync 不可用'), null);
      return;
    }

    area.get(null, function (result) {
      const err = lastError();
      if (err) {
        cb(err, null);
        return;
      }

      const all = result || {};
      const raw = all[KEY_INDEX];
      const index = parseIndex(raw);

      if (index) {
        cb(null, fromStorage(index, all));
        return;
      }

      if (isLegacyFormat(raw)) {
        // 旧格式首次读取时顺手迁移成新布局
        const migrated = fromLegacy(raw);
        write(migrated, function (writeErr) {
          // 迁移失败也要把旧数据交回去，界面不至于空白
          cb(writeErr || null, migrated);
        });
        return;
      }

      if (raw !== undefined && raw !== null) {
        cb(new Error('无法识别的图钉存储格式'), null);
        return;
      }

      cb(null, { groups: [] });
    });
  }

  /**
   * 写入全部图钉数据。
   * @param {Object} data
   * @param {function(Error|null)} cb
   */
  function write(data, cb) {
    const area = getStorageArea();
    if (!area) {
      cb(new Error('storage.sync 不可用'));
      return;
    }

    let layout;
    try {
      layout = buildLayout(data);
    } catch (err) {
      cb(err);
      return;
    }

    area.get(KEY_INDEX, function (result) {
      const err = lastError();
      if (err) {
        cb(err);
        return;
      }

      const prevIndex = parseIndex((result || {})[KEY_INDEX]);
      const stale = computeStaleKeys(prevIndex, layout);

      const payload = Object.assign({}, layout.chunks);
      payload[KEY_INDEX] = layout.index;

      area.set(payload, function () {
        const setErr = lastError();
        if (setErr) {
          cb(setErr);
          return;
        }

        if (stale.length === 0) {
          cb(null);
          return;
        }

        area.remove(stale, function () {
          cb(lastError() || null);
        });
      });
    });
  }

  return {
    KEY_INDEX,
    KEY_CHUNK_PREFIX,
    CHUNK_MAX_BYTES,
    FORMAT_VERSION,
    setStorageArea,
    getStorageArea,
    read,
    write,
  };
});
