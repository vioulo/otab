// show sidebar
const clientWidth = document.body.clientWidth;
const el_sidebar = document.getElementById('sidebar');
const el_pin = document.querySelector('.svg-pin');
browser.storage.sync.get('bar_pox', function (r) {
    let bar_pox = r.bar_pox || 'left';
    el_sidebar.classList.add(`show-${bar_pox}`);
    el_pin.classList.add(`pin-${bar_pox}`)
    document.addEventListener('mousemove', (event) => {
        let tag = false;
        if (bar_pox == 'left') {
            if (event.clientX < 266 && el_sidebar.classList.contains('bar-active')) {
                return;
            }
            if (event.clientX < 7) {
                tag = true;
            }
        }
        if (bar_pox == 'right') {
            if (event.clientX > clientWidth - 266 && el_sidebar.classList.contains('bar-active')) {
                return;
            }
            if (event.clientX > clientWidth - 7) {
                tag = true;
            }
        }
        if (tag) {
            el_sidebar.classList.add('bar-active');
        } else {
            el_sidebar.classList.remove('bar-active');
        }
    });
});

// Set page title and button titles
document.title = browser.i18n.getMessage('pageTitleNewTab');
document.querySelector('.col-sub').title = browser.i18n.getMessage('btnTitleDecreaseCols');
document.querySelector('.col-plus').title = browser.i18n.getMessage('btnTitleIncreaseCols');
document.querySelector('.col-turn').title = browser.i18n.getMessage('btnTitleSwitchToList');
document.querySelector('.go-setting').title = browser.i18n.getMessage('btnTitleSettings');
document.querySelector('.svg-pin').title = browser.i18n.getMessage('btnTitlePin');

// 判断链接内容的宽度
function adjustView() {
    let count = document.querySelectorAll('a').length;
    let el_view = document.querySelector('.view');
    let view_width = 600;
    if (count >= 20) {
        view_width = 800;
    }
    if (count >= 30) {
        view_width = 850;
    }
    if (count >= 40) {
        view_width = 900;
    }
    if (count >= 50) {
        view_width = 1000;
    }
    if (count >= 60) {
        view_width = 1200;
    }
    if (count >= 70) {
        view_width = 1400;
    }
    if (count >= 80) {
        view_width = clientWidth;
    }
    if (view_width > clientWidth) {
        view_width = clientWidth;
    }

    el_view.style.width = view_width + 'px';

    if (el_view.offsetHeight >= window.innerHeight) {
        el_view.style.height = '100%';
        el_view.style.overflowY = "scroll";
    }
}

// open setting
document.querySelector('.go-setting').onclick = () => {
    browser.tabs.create({ url: "setting.html" });
}

document.querySelector('.col-turn').addEventListener('click', function () {
    if (this.classList.contains('active')) {
        this.classList.remove('active');
        document.querySelectorAll('.col-item').forEach(item => item.classList.add('hidden'));
    } else {
        this.classList.add('active');
        document.querySelectorAll('.col-item').forEach(item => item.classList.remove('hidden'));
    }
})

const default_cols = 4;

document.querySelector('.col-plus').addEventListener('click', function () {
    const view = document.querySelector('.view');
    if (view.classList.contains('view-grid')) {
        let cols = parseInt(this.dataset.cols || default_cols) + 1;
        view.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        this.dataset.cols = cols;
    } else {
        view.classList.add('view-grid');
        document.querySelectorAll('.view a').forEach(a => a.classList.add('vg-a'));
        this.dataset.cols = default_cols;
    }
})

document.querySelector('.col-sub').addEventListener('click', function () {
    const view = document.querySelector('.view');
    if (!view.classList.contains('view-grid')) {
        return;
    }
    const colPlus = document.querySelector('.col-plus');
    let cols = parseInt(colPlus.dataset.cols || default_cols) - 1;
    if (cols <= default_cols) {
        view.classList.remove('view-grid');
        document.querySelectorAll('.view a').forEach(a => a.classList.remove('vg-a'));
        view.style.gridTemplateColumns = '';
        return;
    } else {
        view.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        colPlus.dataset.cols = cols;
    }
})

// 加载自定义 CSS
browser.storage.sync.get('otab-cus-css', function (r) {
    let css = r['otab-cus-css'] || '';
    if (!css) {
        return;
    }
    let styleElement = document.createElement('style');
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
});

// pins
document.querySelector('.svg-pin').addEventListener('click', function () {
    const view = document.querySelector('.view');
    const id = view.getAttribute('tb_id');
    if (!id) {
        return;
    }
    const tag = 'otab_pin';
    browser.storage.sync.get(tag, function (r) {
        if (r[tag] != id) {
            browser.storage.sync.set({ [tag]: id });
            document.querySelector('.sp-t').classList.add('active');
        } else {
            browser.storage.sync.set({ [tag]: 0 });
            document.querySelector('.sp-t').classList.remove('active');
        }
    });
});

// show pin link
browser.storage.sync.get('otab_pin', function (r) {
    const el_link = document.querySelector('.view');
    const folderId = r['otab_pin'] || 0;
    if (!folderId) {
        el_link.innerHTML = '<div class="empty-link">' + browser.i18n.getMessage('noPinnedFolder') + '</div>';
    } else {
        document.querySelector('.sp-t').classList.add('active');
        el_link.setAttribute('tb_id', r['otab_pin']);
        adjustFolderAndInsert(folderId);
    }
});
