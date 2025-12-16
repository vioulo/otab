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

$('.col-turn').on('click', function () {
    if ($(this).hasClass('active')) {
        $(this).removeClass('active');
        $('.col-item').addClass('hidden');
    } else {
        $(this).addClass('active');
        $('.col-item').removeClass('hidden');
    }
})

const default_cols = 4;

$('.col-plus').on('click', function () {
    if ($('.view').hasClass('view-grid')) {
        let cols = $(this).data('cols') + 1;
        $('.view').css('grid-template-columns', `repeat(${cols}, 1fr)`);
        $(this).data('cols', cols);
    } else {
        $('.view').addClass('view-grid');
        $('.view a').addClass('vg-a');
        $(this).data('cols', default_cols);
    }
})

$('.col-sub').on('click', function () {
    if (!$('.view').hasClass('view-grid')) {
        return;
    }
    let cols = $('.col-plus').data('cols') - 1;
    if (cols <= default_cols) {
        $('.view').removeClass('view-grid');
        $('.view a').removeClass('vg-a');
        $('.view').css('grid-template-columns', '');
        return;
    } else {
        $('.view').css('grid-template-columns', `repeat(${cols}, 1fr)`);
        $('.col-plus').data('cols', cols);
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
$('.svg-pin').on('click', function () {
    const id = $('.view').attr('tb_id');
    if (!id) {
        return;
    }
    const tag = 'otab_pin';
    browser.storage.sync.get(tag, function (r) {
        if (r[tag] != id) {
            browser.storage.sync.set({ [tag]: id });
            $('.sp-t').addClass('active');
        } else {
            browser.storage.sync.set({ [tag]: 0 });
            $('.sp-t').removeClass('active');
        }
    });
});

// show pin link
browser.storage.sync.get('otab_pin', function (r) {
    const el_link = document.querySelector('.view');
    const folderId = r['otab_pin'] || 0;
    if (!folderId) {
        el_link.innerHTML = '<div class="empty-link">⭕️ 您还未固定文件夹</div>';
    } else {
        $('.sp-t').addClass('active');
        $('.view').attr('tb_id', r['otab_pin']);
        adjustFolderAndInsert(folderId);
    }
});