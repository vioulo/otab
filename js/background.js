(function() {
  const STORAGE_KEY = 'tmpinData';
  const MENU_PIN = 'otab-pin';
  const MENU_UNPIN = 'otab-unpin';
  const MAX_PAGES = 60;

  function getMessage(key) {
    try {
      return (browser.i18n || chrome.i18n).getMessage(key) || key;
    } catch (e) {
      return key;
    }
  }

  function getData(callback) {
    (browser.storage || chrome.storage).sync.get([STORAGE_KEY], function(result) {
      let data = result[STORAGE_KEY];
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
      callback(data);
    });
  }

  function saveData(data, callback) {
    (browser.storage || chrome.storage).sync.set({ [STORAGE_KEY]: data }, function() {
      if (callback) callback();
    });
  }

  function getTotalPages(data) {
    return data.groups.reduce((acc, g) => acc + (Array.isArray(g.pages) ? g.pages.length : 0), 0);
  }

  function isPinned(url, data) {
    return data.groups.some(group =>
      group.pages && group.pages.some(page => page.url === url)
    );
  }

  function createMenus() {
    const api = (browser.contextMenus || chrome.contextMenus);
    if (!api) return;

    api.removeAll(() => {
      api.create({
        id: MENU_PIN,
        title: getMessage('contextMenuPin') || 'Pin page to Otab',
        contexts: ['page', 'link']
      });

      api.create({
        id: MENU_UNPIN,
        title: getMessage('contextMenuUnpin') || 'Unpin from Otab',
        contexts: ['page', 'link']
      });
    });
  }

  function updateMenuVisibility(tab) {
    if (!tab || !tab.url) return;
    const api = (browser.contextMenus || chrome.contextMenus);
    if (!api) return;

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://')) {
      try {
        api.update(MENU_PIN, { visible: false });
        api.update(MENU_UNPIN, { visible: false });
      } catch (e) {}
      return;
    }

    getData(function(data) {
      const pinned = isPinned(tab.url, data);
      try {
        api.update(MENU_PIN, { visible: !pinned });
        api.update(MENU_UNPIN, { visible: pinned });
      } catch (e) {}
    });
  }

  function pinPage(url, title, callback) {
    if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('moz-extension://')) {
      if (callback) callback(false, 'special');
      return;
    }

    getData(function(data) {
      if (isPinned(url, data)) {
        if (callback) callback(false, 'alreadyPinned');
        return;
      }

      const total = getTotalPages(data);
      if (total >= MAX_PAGES) {
        if (callback) callback(false, 'limitReached');
        return;
      }

      let defaultGroup = data.groups.find(g => g.id === 'default');
      if (!defaultGroup) {
        defaultGroup = data.groups[0];
      }

      if (defaultGroup) {
        if (!Array.isArray(defaultGroup.pages)) {
          defaultGroup.pages = [];
        }
        defaultGroup.pages.unshift({
          url: url,
          title: title || url,
          pinnedAt: Date.now()
        });
      }

      saveData(data, function() {
        if (callback) callback(true, 'success');
      });
    });
  }

  function unpinPage(url, callback) {
    getData(function(data) {
      let found = false;

      data.groups.forEach(group => {
        if (Array.isArray(group.pages)) {
          const index = group.pages.findIndex(page => page.url === url);
          if (index !== -1) {
            group.pages.splice(index, 1);
            found = true;
          }
        }
      });

      if (!found) {
        if (callback) callback(false);
        return;
      }

      saveData(data, function() {
        if (callback) callback(true);
      });
    });
  }

  function showNotification(title, message) {
    const notifyApi = (browser.notifications || chrome.notifications);
    if (notifyApi) {
      notifyApi.create({
        type: 'basic',
        iconUrl: 'imgs/icons/icon48.png',
        title: title || getMessage('extensionName') || 'Otab',
        message: message
      });
    }
  }

  function handleMenuClick(info, tab) {
    if (!tab && !info.linkUrl) return;

    if (info.menuItemId === MENU_PIN) {
      const url = info.linkUrl || (tab && tab.url);
      const title = (tab && tab.title) || url;

      pinPage(url, title, function(success, reason) {
        if (success) {
          showNotification(
            getMessage('extensionName') || 'Otab',
            getMessage('pinnedSuccess') || 'Page pinned successfully'
          );
        } else if (reason === 'limitReached') {
          showNotification(
            getMessage('warning') || 'Notice',
            getMessage('maxPagesReached') || 'Pinned links limit reached (maximum 60)'
          );
        } else if (reason === 'alreadyPinned') {
          showNotification(
            getMessage('notice') || 'Notice',
            getMessage('alreadyPinned') || 'This page is already pinned'
          );
        } else if (reason === 'special') {
          showNotification(
            getMessage('warning') || 'Warning',
            getMessage('cannotPinSpecialPage') || 'Cannot pin special browser pages'
          );
        }
      });
    } else if (info.menuItemId === MENU_UNPIN) {
      const url = info.linkUrl || (tab && tab.url);

      unpinPage(url, function(success) {
        if (success) {
          showNotification(
            getMessage('extensionName') || 'Otab',
            getMessage('unpinnedSuccess') || 'Page unpinned successfully'
          );
        }
      });
    }
  }

  function init() {
    createMenus();

    const menuApi = (browser.contextMenus || chrome.contextMenus);
    if (menuApi && menuApi.onClicked) {
      menuApi.onClicked.addListener(handleMenuClick);
    }

    const tabsApi = (browser.tabs || chrome.tabs);
    if (tabsApi) {
      if (tabsApi.onActivated) {
        tabsApi.onActivated.addListener(function(activeInfo) {
          tabsApi.get(activeInfo.tabId, function(tab) {
            updateMenuVisibility(tab);
          });
        });
      }

      if (tabsApi.onUpdated) {
        tabsApi.onUpdated.addListener(function(tabId, changeInfo, tab) {
          if (changeInfo.url || changeInfo.status === 'complete') {
            updateMenuVisibility(tab);
          }
        });
      }
    }

    const runtimeApi = (browser.runtime || chrome.runtime);
    if (runtimeApi && runtimeApi.onInstalled) {
      runtimeApi.onInstalled.addListener(function() {
        createMenus();
      });
    }
  }

  init();
})();