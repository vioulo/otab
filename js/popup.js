(function() {
  const STORAGE_KEY = PinStore.KEY_INDEX;
  const CHUNK_PREFIX = PinStore.KEY_CHUNK_PREFIX;
  const MAX_PAGES = 60;
  const MAX_GROUPS = 6;
  let modalCallback = null;

  function getMessage(key) {
    try {
      return (browser.i18n || chrome.i18n).getMessage(key) || key;
    } catch (e) {
      return key;
    }
  }

  function updateI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = getMessage(key);
    });

    document.querySelectorAll('[title^="__MSG_"]').forEach(el => {
      const title = el.getAttribute('title');
      const keyMatch = title.match(/__MSG_(.*?)__/);
      if (keyMatch) {
        const key = keyMatch[1];
        el.setAttribute('title', getMessage(key) || key);
      }
    });
  }

  function showModal(options) {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const messageEl = document.getElementById('modalMessage');
    const inputEl = document.getElementById('modalInput');
    const cancelBtn = document.getElementById('modalCancel');
    const confirmBtn = document.getElementById('modalConfirm');
    const closeBtn = document.getElementById('modalClose');

    titleEl.textContent = options.title || getMessage('notice') || 'Notice';
    messageEl.textContent = options.message || '';

    if (options.input) {
      inputEl.value = options.defaultValue || '';
      inputEl.placeholder = options.placeholder || getMessage('groupName') || 'Group name';
      inputEl.style.display = 'block';
      setTimeout(() => inputEl.focus(), 50);
    } else {
      inputEl.style.display = 'none';
    }

    cancelBtn.style.display = options.showCancel ? 'block' : 'none';

    modalCallback = options.callback || null;

    function handleClose() {
      overlay.style.display = 'none';
      if (modalCallback) {
        modalCallback(options.input ? null : false);
      }
    }

    function handleConfirm() {
      overlay.style.display = 'none';
      if (modalCallback) {
        modalCallback(options.input ? inputEl.value : true);
      }
    }

    closeBtn.onclick = handleClose;
    cancelBtn.onclick = handleClose;
    confirmBtn.onclick = handleConfirm;

    overlay.onclick = function(e) {
      if (e.target === overlay) {
        handleClose();
      }
    };

    overlay.style.display = 'flex';
  }

  function showAlert(message, title) {
    return new Promise((resolve) => {
      showModal({
        title: title || getMessage('notice') || 'Notice',
        message: message,
        showCancel: false,
        callback: resolve
      });
    });
  }

  function showConfirm(message, title) {
    return new Promise((resolve) => {
      showModal({
        title: title || getMessage('confirm') || 'Confirm',
        message: message,
        showCancel: true,
        callback: resolve
      });
    });
  }

  function showPrompt(message, defaultValue, placeholder, title) {
    return new Promise((resolve) => {
      showModal({
        title: title || getMessage('input') || 'Input',
        message: message,
        input: true,
        showCancel: true,
        defaultValue: defaultValue,
        placeholder: placeholder,
        callback: resolve
      });
    });
  }

  function getData(callback) {
    PinStore.read(function(err, data) {
      if (err) {
        showSyncError(err);
        callback(err, null);
        return;
      }
      if (!data || !Array.isArray(data.groups) || data.groups.length === 0) {
        data = {
          groups: [
            {
              id: 'default',
              name: getMessage('defaultGroup') || 'Default',
              pages: [],
              expanded: true
            }
          ]
        };
      }
      callback(null, data);
    });
  }

  function saveData(data, callback) {
    PinStore.write(data, function(err) {
      if (err) {
        showSyncError(err);
      }
      if (callback) callback(err);
    });
  }

  // 同步写入失败时给出提示，不再静默吞掉
  function showSyncError(err) {
    showAlert(
      (getMessage('syncFailed') || 'Sync failed') + (err && err.message ? '\n' + err.message : ''),
      getMessage('warning') || 'Warning'
    );
  }

  function getTotalPages(data) {
    return data.groups.reduce((acc, g) => acc + (Array.isArray(g.pages) ? g.pages.length : 0), 0);
  }

  function updateLimitBadge(data) {
    const badge = document.getElementById('limitBadge');
    if (!badge) return;
    const total = getTotalPages(data);
    badge.textContent = `${total}/${MAX_PAGES}`;
    if (total >= MAX_PAGES) {
      badge.style.color = '#e53e3e';
      badge.style.fontWeight = 'bold';
    } else {
      badge.style.color = '';
      badge.style.fontWeight = '';
    }
  }

  function getFaviconUrl(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
        return `${urlObj.origin}/favicon.ico`;
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function getDomainName(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (e) {
      return '';
    }
  }

  function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function renderGroups(data) {
    updateLimitBadge(data);
    const groupsContainer = document.getElementById('groupsContainer');
    const emptyState = document.getElementById('emptyState');

    const totalPages = getTotalPages(data);

    if (totalPages === 0 && data.groups.length <= 1) {
      groupsContainer.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    // 保持 flex，容器上的 gap 才是分组之间的上下间距
    groupsContainer.style.display = 'flex';
    emptyState.style.display = 'none';
    groupsContainer.innerHTML = '';

    data.groups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'group-item';
      groupEl.dataset.groupId = group.id;

      const groupHeader = document.createElement('div');
      groupHeader.className = 'group-header';
      groupHeader.dataset.groupId = group.id;
      groupHeader.onclick = function() {
        toggleGroup(group.id);
      };

      groupHeader.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
      });

      groupHeader.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
      });

      groupHeader.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');

        try {
          const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
          const targetGroupId = group.id;
          if (draggedData.groupId !== targetGroupId) {
            movePage(draggedData.groupId, draggedData.pageIndex, targetGroupId, 0);
          }
        } catch (err) {}
      });

      const titleWrap = document.createElement('div');
      titleWrap.className = 'group-title-wrap';

      const groupTitle = document.createElement('span');
      groupTitle.className = 'group-title';
      groupTitle.textContent = group.name;

      const groupCount = document.createElement('span');
      groupCount.className = 'group-count';
      groupCount.textContent = `(${group.pages ? group.pages.length : 0})`;

      titleWrap.appendChild(groupTitle);
      titleWrap.appendChild(groupCount);

      const groupActions = document.createElement('div');
      groupActions.className = 'group-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'group-action-btn';
      editBtn.innerHTML = '✏️';
      editBtn.title = getMessage('editGroup') || 'Edit group';
      editBtn.onclick = function(e) {
        e.stopPropagation();
        editGroup(group.id);
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'group-action-btn delete';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.title = getMessage('deleteGroup') || 'Delete group';
      deleteBtn.onclick = function(e) {
        e.stopPropagation();
        deleteGroup(group.id);
      };

      const openAllBtn = document.createElement('button');
      openAllBtn.className = 'group-action-btn open-all';
      openAllBtn.innerHTML = '📂';
      openAllBtn.title = getMessage('openAllLinks') || 'Open all links';
      openAllBtn.onclick = function(e) {
        e.stopPropagation();
        openAllLinks(group.id);
      };

      groupActions.appendChild(editBtn);
      if (group.id !== 'default') {
        groupActions.appendChild(deleteBtn);
      }
      if (group.pages && group.pages.length > 0) {
        groupActions.appendChild(openAllBtn);
      }

      groupHeader.appendChild(titleWrap);
      groupHeader.appendChild(groupActions);

      const groupList = document.createElement('div');
      groupList.className = 'group-list';
      groupList.dataset.groupId = group.id;

      groupList.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
      });

      groupList.addEventListener('dragleave', function(e) {
        if (e.target === this) {
          this.classList.remove('drag-over');
        }
      });

      groupList.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');

        try {
          const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
          const targetGroupId = group.id;
          if (draggedData.groupId !== targetGroupId) {
            movePage(draggedData.groupId, draggedData.pageIndex, targetGroupId, group.pages.length);
          }
        } catch (err) {}
      });

      if (group.expanded !== false) {
        renderGroupPages(group, groupList);
      } else {
        groupList.style.display = 'none';
      }

      groupEl.appendChild(groupHeader);
      groupEl.appendChild(groupList);
      groupsContainer.appendChild(groupEl);
    });
  }

  function renderGroupPages(group, container) {
    container.innerHTML = '';

    if (!group.pages || group.pages.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '8px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--pop-subtext)';
      emptyMsg.style.fontSize = '11px';
      emptyMsg.textContent = getMessage('noPagesInGroup') || 'No pages in this group';
      container.appendChild(emptyMsg);
      return;
    }

    group.pages.forEach((page, index) => {
      const pageEl = document.createElement('div');
      pageEl.className = 'pinned-item';
      pageEl.draggable = true;
      pageEl.dataset.groupId = group.id;
      pageEl.dataset.pageIndex = index;

      pageEl.addEventListener('dragstart', function(e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
          groupId: group.id,
          pageIndex: index
        }));
        this.classList.add('dragging');
      });

      pageEl.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => {
          el.classList.remove('drag-over');
        });
      });

      pageEl.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
      });

      pageEl.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
      });

      pageEl.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');

        try {
          const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
          const targetGroupId = group.id;
          const targetIndex = index;

          if (draggedData.groupId !== targetGroupId || draggedData.pageIndex !== targetIndex) {
            movePage(draggedData.groupId, draggedData.pageIndex, targetGroupId, targetIndex);
          }
        } catch (err) {}
      });

      const favicon = document.createElement('div');
      favicon.className = 'pinned-favicon';
      const faviconUrl = getFaviconUrl(page.url);
      const hostFirstChar = (getDomainName(page.url).charAt(0) || page.title?.charAt(0) || '#').toUpperCase();

      if (faviconUrl) {
        const img = document.createElement('img');
        img.src = faviconUrl;
        img.alt = '';
        img.onerror = function() {
          this.remove();
          const fallback = document.createElement('span');
          fallback.className = 'fallback-icon';
          fallback.textContent = hostFirstChar;
          favicon.appendChild(fallback);
        };
        favicon.appendChild(img);
      } else {
        const fallback = document.createElement('span');
        fallback.className = 'fallback-icon';
        fallback.textContent = hostFirstChar;
        favicon.appendChild(fallback);
      }

      const info = document.createElement('div');
      info.className = 'pinned-info';

      const title = document.createElement('div');
      title.className = 'pinned-title';
      title.textContent = page.title || getDomainName(page.url) || page.url;

      const url = document.createElement('div');
      url.className = 'pinned-url';
      url.textContent = page.url;

      info.appendChild(title);
      info.appendChild(url);

      const actions = document.createElement('div');
      actions.className = 'pinned-actions';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'action-btn delete';
      deleteBtn.innerHTML = '×';
      deleteBtn.title = getMessage('deleteButtonTooltip') || 'Delete';
      deleteBtn.onclick = function(e) {
        e.stopPropagation();
        deletePage(group.id, index);
      };

      actions.appendChild(deleteBtn);

      pageEl.appendChild(favicon);
      pageEl.appendChild(info);
      pageEl.appendChild(actions);

      pageEl.onclick = function() {
        const tabsApi = (browser.tabs || chrome.tabs);
        tabsApi.create({ url: page.url });
        window.close();
      };

      container.appendChild(pageEl);
    });
  }

  function toggleGroup(groupId) {
    getData(function(err, data) {
      if (err) return;
      const group = data.groups.find(g => g.id === groupId);
      if (group) {
        group.expanded = (group.expanded === false) ? true : false;
        saveData(data, function(saveErr) {
          if (!saveErr) renderGroups(data);
        });
      }
    });
  }

  async function addGroup() {
    getData(async function(err, data) {
      if (err) return;
      if (data.groups.length >= MAX_GROUPS) {
        await showAlert(
          getMessage('maxGroupsReached') || 'Maximum 6 groups allowed',
          getMessage('warning') || 'Notice'
        );
        return;
      }

      const name = await showPrompt(
        '',
        '',
        getMessage('groupName') || 'Group name',
        getMessage('newGroup') || 'New Group'
      );
      if (!name || !name.trim()) return;

      data.groups.push({
        id: generateId(),
        name: name.trim(),
        pages: [],
        expanded: true
      });

      saveData(data, function(saveErr) {
        if (!saveErr) renderGroups(data);
      });
    });
  }

  async function editGroup(groupId) {
    getData(function(err, data) {
      if (err) return;
      const group = data.groups.find(g => g.id === groupId);
      if (group) {
        showPrompt(
          '',
          group.name,
          getMessage('groupName') || 'Group name',
          getMessage('editGroup') || 'Edit Group'
        ).then(function(name) {
          if (name && name.trim()) {
            group.name = name.trim();
            saveData(data, function(saveErr) {
              if (!saveErr) renderGroups(data);
            });
          }
        });
      }
    });
  }

  async function deleteGroup(groupId) {
    if (groupId === 'default') {
      await showAlert(
        getMessage('cannotDeleteDefaultGroup') || 'Cannot delete default group',
        getMessage('warning') || 'Warning'
      );
      return;
    }

    const confirmed = await showConfirm(
      getMessage('confirmDeleteGroup') || 'Are you sure you want to delete this group? All pages will be moved to Default group.',
      getMessage('deleteGroup') || 'Delete Group'
    );
    if (!confirmed) return;

    getData(function(err, data) {
      if (err) return;
      const groupIndex = data.groups.findIndex(g => g.id === groupId);
      if (groupIndex !== -1) {
        const deletedGroup = data.groups[groupIndex];
        const defaultGroup = data.groups.find(g => g.id === 'default') || data.groups[0];

        if (defaultGroup && Array.isArray(deletedGroup.pages)) {
          defaultGroup.pages = defaultGroup.pages.concat(deletedGroup.pages);
        }

        data.groups.splice(groupIndex, 1);
        saveData(data, function(saveErr) {
          if (!saveErr) renderGroups(data);
        });
      }
    });
  }

  function deletePage(groupId, pageIndex) {
    getData(function(err, data) {
      if (err) return;
      const group = data.groups.find(g => g.id === groupId);
      if (group && Array.isArray(group.pages)) {
        group.pages.splice(pageIndex, 1);
        saveData(data, function(saveErr) {
          if (!saveErr) renderGroups(data);
        });
      }
    });
  }

  function movePage(sourceGroupId, sourceIndex, targetGroupId, targetIndex) {
    getData(function(err, data) {
      if (err) return;
      const sourceGroup = data.groups.find(g => g.id === sourceGroupId);
      const targetGroup = data.groups.find(g => g.id === targetGroupId);

      if (sourceGroup && targetGroup && sourceGroup.pages && targetGroup.pages) {
        const page = sourceGroup.pages.splice(sourceIndex, 1)[0];
        if (page) {
          targetGroup.pages.splice(targetIndex, 0, page);
          saveData(data, function(saveErr) {
            if (!saveErr) renderGroups(data);
          });
        }
      }
    });
  }

  function openAllLinks(groupId) {
    getData(function(err, data) {
      if (err) return;
      const group = data.groups.find(g => g.id === groupId);
      if (group && group.pages && group.pages.length > 0) {
        const tabsApi = (browser.tabs || chrome.tabs);
        group.pages.forEach(page => {
          tabsApi.create({ url: page.url, active: false });
        });
        window.close();
      }
    });
  }

  async function pinCurrentPage() {
    const tabsApi = (browser.tabs || chrome.tabs);
    tabsApi.query({ active: true, currentWindow: true }, async function(tabs) {
      if (!tabs || tabs.length === 0) return;

      const tab = tabs[0];
      const url = tab.url;

      if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('moz-extension://')) {
        await showAlert(
          getMessage('cannotPinSpecialPage') || 'Cannot pin special browser pages',
          getMessage('warning') || 'Warning'
        );
        return;
      }

      getData(async function(err, data) {
        if (err) return;
        const total = getTotalPages(data);
        if (total >= MAX_PAGES) {
          await showAlert(
            getMessage('maxPagesReached') || 'Pinned links limit reached (maximum 60)',
            getMessage('warning') || 'Notice'
          );
          return;
        }

        const exists = data.groups.some(group =>
          group.pages && group.pages.some(page => page.url === url)
        );

        if (exists) {
          await showAlert(
            getMessage('alreadyPinned') || 'This page is already pinned',
            getMessage('notice') || 'Notice'
          );
          return;
        }

        let defaultGroup = data.groups.find(g => g.id === 'default') || data.groups[0];
        if (defaultGroup) {
          if (!Array.isArray(defaultGroup.pages)) {
            defaultGroup.pages = [];
          }
          defaultGroup.pages.unshift({
            url: url,
            title: tab.title || url,
            pinnedAt: Date.now()
          });
        }

        saveData(data, function(saveErr) {
          if (!saveErr) renderGroups(data);
        });
      });
    });
  }

  function loadData() {
    getData(function(err, data) {
      if (err) return;
      renderGroups(data);
    });
  }

  function init() {
    updateI18n();
    loadData();

    const pinBtn = document.getElementById('pinBtn');
    if (pinBtn) {
      pinBtn.onclick = pinCurrentPage;
      // 按钮只有图标，无障碍名称用完整文案
      pinBtn.setAttribute('aria-label', getMessage('pinButton') || 'Pin');
    }

    const addGroupBtn = document.getElementById('addGroupBtn');
    if (addGroupBtn) addGroupBtn.onclick = addGroup;

    const storageApi = (browser.storage || chrome.storage);
    if (storageApi && storageApi.onChanged) {
      storageApi.onChanged.addListener(function(changes, namespace) {
        if (namespace !== 'sync') return;
        // 索引与分块都可能变，任一变动都要重新加载
        const touched = Object.keys(changes).some(function(key) {
          return key === STORAGE_KEY || key.indexOf(CHUNK_PREFIX) === 0;
        });
        if (touched) {
          loadData();
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
