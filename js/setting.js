// 侧边栏位置
browser.storage.sync.get('bar_pox', function (r) {
    let bar_pox = r.bar_pox || 'left';
    document.querySelector(`.bar-${bar_pox}`).classList.add('st-bar-act');
});

document.querySelectorAll('.bar-it').forEach(item => {
    item.addEventListener('click', function () {
        document.querySelectorAll('.bar-it').forEach(i => i.classList.remove('st-bar-act'));
        this.classList.add('st-bar-act');
        browser.storage.sync.set({ 'bar_pox': this.getAttribute('pox') });
    });
});

// 自定义 CSS
browser.storage.sync.get('otab-cus-css', function (r) {
    document.getElementById('cus-css').value = r['otab-cus-css'] || '';
});

document.querySelector('.cc-cfm').addEventListener('click', function (e) {
    browser.storage.sync.set({ 'otab-cus-css': document.getElementById('cus-css').value });
    showTooltip(e.clientX, e.clientY, 'ok');
});
