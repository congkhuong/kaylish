// Kaylish Service Worker (Manifest V3)

// Create context menu item on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-kaylish",
    title: "Thêm '%s' vào Kaylish",
    contexts: ["selection"]
  });
  updateBadgeCount();
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "add-to-kaylish" && info.selectionText) {
    const selectedText = info.selectionText.trim();
    if (!selectedText) return;

    saveSentence(selectedText, tab ? tab.url : "", tab ? tab.title : "")
      .then((item) => {
        updateBadgeCount();
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: "SHOW_TOAST",
            message: `Đã lưu vào Kaylish: "${truncate(selectedText, 30)}"`
          }).catch(() => {
            // Content script might not be injected in special pages (e.g. chrome://)
          });
        }
      });
  }
});

// Listen to message from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "UPDATE_BADGE") {
    updateBadgeCount();
    sendResponse({ status: "OK" });
  } else if (request.action === "SAVE_SENTENCE") {
    saveSentence(request.text, request.sourceUrl, request.sourceTitle)
      .then((item) => {
        updateBadgeCount();
        sendResponse({ status: "SUCCESS", item });
      });
    return true; // async response
  }
});

// Helper: Save sentence to storage
function saveSentence(text, sourceUrl = "", sourceTitle = "") {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ kaylishItems: [] }, (data) => {
      const items = data.kaylishItems || [];
      const newItem = {
        id: "kay_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
        text: text,
        translation: "",
        sourceUrl: sourceUrl,
        sourceTitle: sourceTitle,
        status: "active", // "active" | "archived"
        playCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Check for duplicates
      const existsIndex = items.findIndex(i => i.text.toLowerCase() === text.toLowerCase());
      if (existsIndex >= 0) {
        // Reactivate if archived
        items[existsIndex].status = "active";
        items[existsIndex].updatedAt = new Date().toISOString();
      } else {
        items.unshift(newItem);
      }

      chrome.storage.sync.set({ kaylishItems: items }, () => {
        resolve(newItem);
      });
    });
  });
}

// Helper: Update Badge Count showing active items
function updateBadgeCount() {
  chrome.storage.sync.get({ kaylishItems: [] }, (data) => {
    const items = data.kaylishItems || [];
    const activeCount = items.filter(i => i.status === "active").length;
    
    if (activeCount > 0) {
      chrome.action.setBadgeText({ text: activeCount > 99 ? "99+" : String(activeCount) });
      chrome.action.setBadgeBackgroundColor({ color: "#6366F1" }); // Indigo badge
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  });
}

function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}
