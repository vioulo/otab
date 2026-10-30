'use strict';

const test = require('node:test');
const assert = require('node:assert');

const PinStore = require('../js/pinstore.js');

// Firefox / Chrome 的 storage.sync 单项配额
const QUOTA_BYTES_PER_ITEM = 8192;

// 模拟浏览器的 runtime.lastError：只在回调执行期间存在
global.chrome = { runtime: { lastError: null } };

function withLastError(err, fn) {
  global.chrome.runtime.lastError = err;
  try {
    fn();
  } finally {
    global.chrome.runtime.lastError = null;
  }
}

// 一个会强制执行单项配额的假 storage area
function createFakeStorage(initial = {}) {
  const data = Object.assign({}, initial);

  return {
    data,

    get(keys, cb) {
      let result;
      if (keys === null || keys === undefined) {
        result = Object.assign({}, data);
      } else if (typeof keys === 'string') {
        result = {};
        if (keys in data) result[keys] = data[keys];
      } else {
        result = {};
        keys.forEach((k) => {
          if (k in data) result[k] = data[k];
        });
      }
      setTimeout(() => cb(result), 0);
    },

    set(items, cb) {
      for (const [key, value] of Object.entries(items)) {
        const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
        if (size > QUOTA_BYTES_PER_ITEM) {
          withLastError(
            { message: `QUOTA_BYTES_PER_ITEM quota exceeded for "${key}" (${size} bytes)` },
            () => cb && cb()
          );
          return;
        }
      }
      Object.assign(data, items);
      withLastError(null, () => cb && cb());
    },

    remove(keys, cb) {
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete data[k]);
      withLastError(null, () => cb && cb());
    },
  };
}

function makePage(i) {
  return {
    url: `https://www.google.com/search?q=hello+world+${i}&hl=zh-CN`,
    title: `Google 搜索 - hello world ${i} - 中文结果页`,
    pinnedAt: 1760000000000 + i,
  };
}

function makeData(count, groups = 1) {
  const pages = [];
  for (let i = 0; i < count; i++) pages.push(makePage(i));

  const per = Math.ceil(count / groups);
  const list = [];
  for (let g = 0; g < groups; g++) {
    list.push({
      id: g === 0 ? 'default' : 'id_g' + g,
      name: g === 0 ? '默认分组' : '分组 ' + g,
      expanded: g % 2 === 0,
      pages: pages.slice(per * g, per * (g + 1)),
    });
  }
  return { groups: list };
}

function setup(initial = {}) {
  const area = createFakeStorage(initial);
  PinStore.setStorageArea(area);
  return area;
}

test('没有任何数据时返回空分组结构', (t, done) => {
  setup();
  PinStore.read((err, data) => {
    assert.ifError(err);
    assert.ok(data);
    assert.deepStrictEqual(data.groups, []);
    done();
  });
});

test('写入后能原样读回分组、图钉与展开状态', (t, done) => {
  setup();
  const data = makeData(5, 2);

  PinStore.write(data, (err) => {
    assert.ifError(err);
    PinStore.read((readErr, loaded) => {
      assert.ifError(readErr);
      assert.strictEqual(loaded.groups.length, 2);
      assert.strictEqual(loaded.groups[0].expanded, true);
      assert.strictEqual(loaded.groups[1].expanded, false);
      assert.strictEqual(loaded.groups[0].pages.length, 3);
      assert.strictEqual(loaded.groups[1].pages.length, 2);
      assert.deepStrictEqual(loaded.groups[0].pages[0], data.groups[0].pages[0]);
      done();
    });
  });
});

test('60 条图钉写入后每个 storage item 都不超过单项配额', (t, done) => {
  const area = setup();

  PinStore.write(makeData(60), (err) => {
    assert.ifError(err);

    for (const [key, value] of Object.entries(area.data)) {
      const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
      assert.ok(
        size <= QUOTA_BYTES_PER_ITEM,
        `item "${key}" 体积 ${size} 字节，超过配额 ${QUOTA_BYTES_PER_ITEM}`
      );
    }

    PinStore.read((readErr, loaded) => {
      assert.ifError(readErr);
      const total = loaded.groups.reduce((acc, g) => acc + g.pages.length, 0);
      assert.strictEqual(total, 60);
      done();
    });
  });
});

test('超长 URL 的单条图钉也能单独成块，不会撑爆配额', (t, done) => {
  setup();
  const huge = {
    url: 'https://example.com/' + 'x'.repeat(3000),
    title: '超长地址',
    pinnedAt: 1760000000000,
  };

  PinStore.write({ groups: [{ id: 'default', name: '默认分组', expanded: true, pages: [huge] }] }, (err) => {
    assert.ifError(err);
    PinStore.read((readErr, loaded) => {
      assert.ifError(readErr);
      assert.strictEqual(loaded.groups[0].pages.length, 1);
      assert.strictEqual(loaded.groups[0].pages[0].url, huge.url);
      done();
    });
  });
});

test('超过单块配额的单条图钉会明确失败', (t, done) => {
  setup();
  const huge = {
    url: 'https://example.com/' + 'x'.repeat(5000),
    title: '超长地址',
    pinnedAt: 1760000000000,
  };

  PinStore.write({ groups: [{ id: 'default', name: '默认分组', pages: [huge] }] }, (err) => {
    assert.ok(err);
    assert.match(err.message, /超过存储块配额/);
    done();
  });
});

test('未知索引格式不会被当作旧格式覆盖', (t, done) => {
  const unknown = { v: 3, groups: [{ id: 'default', pages: [['url']] }], marker: 'keep' };
  const area = setup({ tmpinData: unknown });

  PinStore.read((err) => {
    assert.ok(err);
    assert.deepStrictEqual(area.data.tmpinData, unknown);
    done();
  });
});

test('删除分组后清掉该分组遗留的分块键', (t, done) => {
  const area = setup();

  PinStore.write(makeData(40, 2), (err) => {
    assert.ifError(err);
    const before = Object.keys(area.data).filter((k) => k.startsWith('tmpinPages:'));
    assert.ok(before.length > 0, '预期写入后存在分块键');

    const trimmed = makeData(40, 2);
    trimmed.groups.pop();
    trimmed.groups[0].pages = trimmed.groups[0].pages.slice(0, 2);

    PinStore.write(trimmed, (writeErr) => {
      assert.ifError(writeErr);
      const after = Object.keys(area.data).filter((k) => k.startsWith('tmpinPages:'));
      assert.deepStrictEqual(after, ['tmpinPages:default:0']);
      done();
    });
  });
});

test('旧格式数据首次读取时自动迁移为新布局', (t, done) => {
  const legacy = {
    groups: [
      {
        id: 'default',
        name: '默认分组',
        expanded: true,
        pages: [{ url: 'https://example.com/a', title: 'A', pinnedAt: 1760000000000 }],
      },
    ],
  };
  const area = setup({ tmpinData: legacy });

  PinStore.read((err, loaded) => {
    assert.ifError(err);
    assert.strictEqual(loaded.groups[0].pages.length, 1);
    assert.strictEqual(loaded.groups[0].pages[0].url, 'https://example.com/a');

    assert.strictEqual(area.data.tmpinData.v, 2, '索引应升级为新格式');
    assert.ok(Array.isArray(area.data['tmpinPages:default:0']), '分块键应已写入');
    done();
  });
});

test('写入失败时把错误传给回调，而不是静默吞掉', (t, done) => {
  const area = setup();
  area.set = (items, cb) => {
    withLastError({ message: 'QUOTA_BYTES_PER_ITEM quota exceeded' }, () => cb && cb());
  };

  PinStore.write(makeData(3), (err) => {
    assert.ok(err, '预期回调收到错误');
    assert.match(err.message, /QUOTA_BYTES_PER_ITEM/);
    done();
  });
});

test('读取失败时把错误传给回调', (t, done) => {
  const area = setup();
  area.get = (keys, cb) => {
    withLastError({ message: '读取失败' }, () => cb({}));
  };

  PinStore.read((err) => {
    assert.ok(err, '预期回调收到错误');
    assert.match(err.message, /读取失败/);
    done();
  });
});

test('分组 id 不会与其它键冲突', (t, done) => {
  setup();
  PinStore.write(makeData(3, 2), (err) => {
    assert.ifError(err);
    PinStore.read((readErr, loaded) => {
      assert.ifError(readErr);
      const ids = loaded.groups.map((g) => g.id);
      assert.strictEqual(new Set(ids).size, ids.length);
      done();
    });
  });
});

test('回归：60 条图钉塞进单个键会超配额，所以必须拆成多块', (t, done) => {
  const area = setup();
  const data = makeData(60);

  // 旧版布局：所有图钉放在 tmpinData 一个键里
  const singleKeySize = Buffer.byteLength(
    JSON.stringify({
      groups: [
        {
          id: 'default',
          name: '默认分组',
          expanded: true,
          pages: data.groups[0].pages,
        },
      ],
    }),
    'utf8'
  );
  assert.ok(
    singleKeySize > QUOTA_BYTES_PER_ITEM,
    `旧布局应为 ${singleKeySize} 字节，超过配额 ${QUOTA_BYTES_PER_ITEM}`
  );

  // 新版布局必须拆开
  PinStore.write(data, (err) => {
    assert.ifError(err);
    const chunkKeys = Object.keys(area.data).filter((k) => k.startsWith('tmpinPages:'));
    assert.ok(chunkKeys.length > 1, '预期图钉被拆到多个分块键');
    done();
  });
});
