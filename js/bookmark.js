const PINNED_BOARD_ID = 'otab-pinned';
const tmpFolder = {
    id: 'no-fo',
    title: '缓存区',
};

// 渲染侧边栏置顶的图钉板
function renderPinnedBoardSidebar(el_box) {
    (browser.storage || chrome.storage).sync.get(['tmpinData', 'otab_pin'], function(r) {
        const data = r.tmpinData;
        const total = (data && Array.isArray(data.groups))
            ? data.groups.reduce((acc, g) => acc + (Array.isArray(g.pages) ? g.pages.length : 0), 0)
            : 0;

        let el_pinned = document.createElement('div');
        el_pinned.className = 'b-it b-it-pinned';
        el_pinned.setAttribute('tb_id', PINNED_BOARD_ID);
        el_pinned.onclick = () => {
            fillBookmark(PINNED_BOARD_ID);
        };

        if (r['otab_pin'] === PINNED_BOARD_ID) {
            el_pinned.classList.add('b-active');
        }

        let el_uc = `<div class="url-count">${total}</div>`;
        let title = `<div class="b-title">${(browser.i18n || chrome.i18n).getMessage('pinnedBoard') || '📌 图钉板'}</div>${el_uc}`;
        el_pinned.innerHTML = title;
        el_box.prepend(el_pinned);
    });
}

// 读取书签内容
browser.bookmarks.getSubTree("toolbar_____").then(async (tree) => {
    let toolbar = tree[0].children;
    const el_box = document.querySelector('.box');
    if (!toolbar) {
        el_box.innerText = (browser.i18n || chrome.i18n).getMessage('noBookmarks');
        return;
    }
    let folder = [];
    let tmpTag = false;
    toolbar.forEach(e => {
        if (e.type == 'folder') {
            folder.push(e);
        } else {
            tmpTag = true;
        }
    });
    if (tmpTag) {
        folder.push(tmpFolder);
    }

    let promises = folder.map(e => {
        return browser.bookmarks.getChildren(e.id).then(children => {
            let urlCount = children.filter(b => b.type === 'bookmark').length;
            return { e, urlCount };
        }).catch(() => {
            let urlCount = 0;
            if (e.id === 'no-fo') {
                urlCount = toolbar.filter(b => b.type === 'bookmark').length;
            }
            return { e, urlCount };
        });
    });

    Promise.all(promises).then(results => {
        results.forEach(({ e, urlCount }) => {
            let el_folder = document.createElement('div');
            el_folder.className = 'b-it';
            el_folder.setAttribute('tb_id', e.id);
            el_folder.onclick = () => {
                fillBookmark(e.id);
            };

            let el_uc = `<div class="url-count">${urlCount}</div>`;
            let title = `<div class="b-title">${e.title}</div>${el_uc}`;
            el_folder.innerHTML = title;
            el_box.appendChild(el_folder);
        });

        // 在侧边栏顶部加入图钉板
        renderPinnedBoardSidebar(el_box);
    });
}).catch((error) => {
    console.error(error);
});

// 监听图钉数据变化，实时联动侧边栏与主视图
(browser.storage || chrome.storage).onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync' && changes['tmpinData']) {
        const pinCountEl = document.querySelector(`div[tb_id="${PINNED_BOARD_ID}"] .url-count`);
        const data = changes['tmpinData'].newValue;
        const total = (data && Array.isArray(data.groups))
            ? data.groups.reduce((acc, g) => acc + (Array.isArray(g.pages) ? g.pages.length : 0), 0)
            : 0;
        if (pinCountEl) pinCountEl.textContent = total;

        const currentView = document.querySelector('.view');
        if (currentView && currentView.getAttribute('tb_id') === PINNED_BOARD_ID) {
            adjustFolderAndInsert(PINNED_BOARD_ID);
        }
    }
});

// 判断文件夹 id 并填充数据
function adjustFolderAndInsert(folderId) {
    if (folderId === PINNED_BOARD_ID) {
        (browser.storage || chrome.storage).sync.get('tmpinData', function (r) {
            let data = r.tmpinData;
            let el_view = document.querySelector('.view');
            el_view.innerHTML = '';
            if (!data || !Array.isArray(data.groups) || data.groups.length === 0) {
                el_view.innerHTML = `<div class="empty-link">${(browser.i18n || chrome.i18n).getMessage('emptyState') || '还没有钉住的页面'}</div>`;
                adjustView();
                return;
            }

            let hasAny = false;
            data.groups.forEach(group => {
                if (Array.isArray(group.pages) && group.pages.length > 0) {
                    hasAny = true;
                    group.pages.forEach(p => {
                        insertLinkElement({
                            id: 'pin_' + p.url,
                            url: p.url,
                            title: p.title || p.url
                        });
                    });
                }
            });

            if (!hasAny) {
                el_view.innerHTML = `<div class="empty-link">${(browser.i18n || chrome.i18n).getMessage('emptyState') || '还没有钉住的页面'}</div>`;
            }
            adjustView();
        });
    } else if (folderId == tmpFolder.id) {
        browser.bookmarks.getSubTree("toolbar_____").then(async (tree) => {
            let toolbar = tree[0].children;
            toolbar.forEach(e => {
                if (e.type == 'bookmark') {
                    insertLinkElement(e);
                }
            });
            adjustView();
        });
    } else {
        browser.bookmarks.getChildren(folderId).then((children) => {
            children.forEach((b) => {
                if (b.type == 'bookmark') {
                    insertLinkElement(b);
                }
            });
            adjustView();
        });
    }
}

function fillBookmark(folderId) {
    const el_folder = document.querySelector(`div[tb_id="${folderId}"]`);
    if (el_folder) {
        el_folder.classList.add('b-active');
    }
    const el_divs = document.querySelectorAll(`div.b-it:not([tb_id="${folderId}"])`);
    el_divs.forEach((div) => {
        div.classList.remove('b-active');
    });
    const view = document.querySelector('.view');
    view.innerHTML = '';
    view.setAttribute('tb_id', folderId);
    adjustFolderAndInsert(folderId);
    (browser.storage || chrome.storage).sync.get('otab_pin', function (r) {
        if (r['otab_pin'] == folderId) {
            document.querySelector('.sp-t').classList.add('active');
        } else {
            document.querySelector('.sp-t').classList.remove('active');
        }
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function insertLinkElement(link) {
    let el_view = document.querySelector('.view');
    let a_class = '';
    if (el_view.classList.contains('view-grid')) {
        a_class = 'vg-a';
    }

    let faviconUrl = '';
    let firstChar = '#';

    try {
        const urlObj = new URL(link.url);
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
            faviconUrl = `${urlObj.origin}/favicon.ico`;
            const cleanHost = urlObj.hostname.replace(/^www\./, '');
            firstChar = (cleanHost.charAt(0) || link.title?.charAt(0) || '#').toUpperCase();
        } else {
            firstChar = (link.title?.charAt(0) || '#').toUpperCase();
        }
    } catch (e) {
        firstChar = (link.title?.charAt(0) || '#').toUpperCase();
    }

    const titleText = escapeHtml(link.title || link.url || '');
    const escapedUrl = escapeHtml(link.url || '#');

    let iconHtml = '';
    if (faviconUrl) {
        iconHtml = `<img src="${faviconUrl}" width="16" height="16" alt="" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';" /><span class="fallback-icon">${firstChar}</span>`;
    } else {
        iconHtml = `<span class="fallback-icon" style="display:inline-flex;">${firstChar}</span>`;
    }

    let el_a = `<a class="${a_class}" href="${escapedUrl}" tb_id="${link.id}" title="${titleText}">${iconHtml}${titleText}</a>`;
    el_view.insertAdjacentHTML('beforeend', el_a);
}

// 记录链接的点击次数
function goLink(link_id) {
    (browser.runtime || chrome.runtime).sendMessage({
        type: 'linkClick',
        link_id: link_id,
    });
}

/// --- ContextMenu Start ---
const ContextMenu = function (options) {
    let instance;

    function createMenu() {
        const ul = document.createElement("ul");
        ul.classList.add("custom-context-menu");
        const { menus } = options;
        if (menus && menus.length > 0) {
            for (let menu of menus) {
                const li = document.createElement("li");
                li.textContent = menu.name;
                li.onclick = menu.onClick;
                ul.appendChild(li);
            }
        }
        const body = document.querySelector("body");
        body.appendChild(ul);
        return ul;
    }

    return {
        getInstance: function () {
            if (!instance) {
                instance = createMenu();
            }
            return instance;
        },
    };
};

const contextMenu = ContextMenu({
    menus: [
        {
            name: (browser.i18n || chrome.i18n).getMessage('openInNewTab'),
            onClick: function (e) {
                window.open(window.cur_link.url, '_blank');
            },
        },
        {
            name: (browser.i18n || chrome.i18n).getMessage('openInNewWindow'),
            onClick: function (e) {
                (browser.windows || chrome.windows).create({ url: window.cur_link.url });
            },
        },
        {
            name: (browser.i18n || chrome.i18n).getMessage('copyLink'),
            onClick: function (e) {
                navigator.clipboard.writeText(window.cur_link.url).then(() => {
                    showTooltip(e.clientX, e.clientY, (browser.i18n || chrome.i18n).getMessage('ok'));
                }).catch(err => {
                    console.error('复制失败: ', err);
                });
            }
        },
        {
            name: (browser.i18n || chrome.i18n).getMessage('delete'),
            onClick: function (e) {
                let id = window.cur_link.id;
                let url = window.cur_link.url;
                if (confirm((browser.i18n || chrome.i18n).getMessage('confirmDelete'))) {
                    try {
                        const targetEl = document.querySelector(`a[tb_id="${id}"]`);
                        if (targetEl) targetEl.remove();

                        if (id && id.startsWith('pin_')) {
                            // 从图钉存储中删除
                            (browser.storage || chrome.storage).sync.get('tmpinData', function(r) {
                                let data = r.tmpinData;
                                if (data && Array.isArray(data.groups)) {
                                    data.groups.forEach(g => {
                                        if (Array.isArray(g.pages)) {
                                            g.pages = g.pages.filter(p => p.url !== url);
                                        }
                                    });
                                    (browser.storage || chrome.storage).sync.set({ tmpinData: data });
                                }
                            });
                        } else {
                            browser.bookmarks.remove(id);
                        }
                    } catch (error) {
                        alert((browser.i18n || chrome.i18n).getMessage('deleteFailed'));
                        console.error(error);
                    }
                }
            },
        },
    ],
});

function showMenu(e, targetA) {
    e.preventDefault();
    const linkEl = targetA || e.target.closest("a[tb_id]");
    if (!linkEl) return;
    window.cur_link = {
        id: linkEl.getAttribute("tb_id"),
        url: linkEl.href
    };
    let h_top = e.clientY;
    let h_left = e.clientX;
    if (window.innerHeight - h_top < 100) {
        h_top = e.clientY - 100;
    }
    if (window.innerWidth - e.clientX < 120) {
        h_left = window.innerWidth - 120;
    }
    const menus = contextMenu.getInstance();
    menus.style.top = `${h_top}px`;
    menus.style.left = `${h_left}px`;
    menus.classList.remove("hidden");
}

function hideMenu(event) {
    window.cur_link = {};
    const menus = contextMenu.getInstance();
    menus.classList.add("hidden");
}

document.addEventListener("click", hideMenu);
document.addEventListener("contextmenu", function (e) {
    const linkEl = e.target.closest("a[tb_id]");
    if (linkEl) {
        showMenu(e, linkEl);
    } else {
        hideMenu();
    }
});
/// --- ContextMenu End ---
