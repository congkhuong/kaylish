// Kaylish Extension Popup Logic

document.addEventListener("DOMContentLoaded", () => {
  // Application State
  let kaylishItems = [];
  let currentTab = "active"; // "active" | "archived"
  let blurMode = true;
  let selectedSpeed = 1.0;
  let selectedVoiceName = "";
  let searchQuery = "";
  let currentlyPlayingId = null;
  let loopActiveId = null;
  let speechUtterance = null;

  // DOM Elements
  const selectVoice = document.getElementById("select-voice");
  const speedBtns = document.querySelectorAll(".speed-btn");
  const toggleBlur = document.getElementById("toggle-blur");
  const inputSearch = document.getElementById("input-search");
  const formAdd = document.getElementById("form-add");
  const inputText = document.getElementById("input-text");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const badgeActive = document.getElementById("badge-active");
  const badgeArchived = document.getElementById("badge-archived");
  const itemsList = document.getElementById("items-list");
  const emptyState = document.getElementById("empty-state");
  const btnExport = document.getElementById("btn-export");
  const btnImport = document.getElementById("btn-import");
  const fileImport = document.getElementById("file-import");
  const btnClearAll = document.getElementById("btn-clear-all");

  // Initialize Speech Synthesis Voices
  function initVoices() {
    if (!("speechSynthesis" in window)) return;
    
    let voices = window.speechSynthesis.getVoices();

    function populateVoiceList() {
      voices = window.speechSynthesis.getVoices();
      selectVoice.innerHTML = "";

      // Filter for English voices primarily
      const englishVoices = voices.filter(v => v.lang.startsWith("en"));
      const voiceList = englishVoices.length > 0 ? englishVoices : voices;

      voiceList.forEach(voice => {
        const option = document.createElement("option");
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        if (voice.default || voice.name.includes("Google") || voice.name.includes("Natural")) {
          option.selected = true;
        }
        selectVoice.appendChild(option);
      });

      // Restore saved voice preference
      chrome.storage.sync.get({ preferredVoice: "" }, (data) => {
        if (data.preferredVoice && selectVoice.querySelector(`option[value="${CSS.escape(data.preferredVoice)}"]`)) {
          selectVoice.value = data.preferredVoice;
          selectedVoiceName = data.preferredVoice;
        } else if (selectVoice.value) {
          selectedVoiceName = selectVoice.value;
        }
      });
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = populateVoiceList;
    }
  }

  // Load Data & Settings from Chrome Storage
  function loadInitialData() {
    chrome.storage.sync.get({
      kaylishItems: [],
      blurMode: true,
      selectedSpeed: 1.0
    }, (data) => {
      kaylishItems = data.kaylishItems || [];
      blurMode = data.blurMode !== undefined ? data.blurMode : true;
      selectedSpeed = data.selectedSpeed || 1.0;

      // Update UI elements from settings
      toggleBlur.checked = blurMode;
      speedBtns.forEach(btn => {
        if (parseFloat(btn.dataset.speed) === selectedSpeed) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });

      render();
    });
  }

  // Save items state to storage and notify background service worker
  function saveData() {
    chrome.storage.sync.set({ kaylishItems }, () => {
      chrome.runtime.sendMessage({ action: "UPDATE_BADGE" });
      render();
    });
  }

  // Render UI
  function render() {
    // 1. Update Tab Badges
    const activeItems = kaylishItems.filter(i => i.status === "active");
    const archivedItems = kaylishItems.filter(i => i.status === "archived");

    badgeActive.textContent = activeItems.length;
    badgeArchived.textContent = archivedItems.length;

    // 2. Filter items based on tab & search query
    let targetList = currentTab === "active" ? activeItems : archivedItems;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      targetList = targetList.filter(i => 
        i.text.toLowerCase().includes(q) || 
        (i.translation && i.translation.toLowerCase().includes(q))
      );
    }

    // 3. Render list or empty state
    itemsList.innerHTML = "";
    if (targetList.length === 0) {
      emptyState.style.display = "flex";
      itemsList.style.display = "none";
    } else {
      emptyState.style.display = "none";
      itemsList.style.display = "flex";

      targetList.forEach(item => {
        const card = createItemCard(item);
        itemsList.appendChild(card);
      });
    }
  }

  // Create HTML Element for Item Card
  function createItemCard(item) {
    const card = document.createElement("div");
    card.className = `item-card ${currentlyPlayingId === item.id ? "is-playing" : ""}`;
    card.dataset.id = item.id;

    const isBlurred = blurMode;

    card.innerHTML = `
      <div class="item-text-container" title="${isBlurred ? 'Bấm để toggle ẩn/hiện chữ' : ''}">
        <p class="item-text ${isBlurred ? 'blurred' : ''}">${escapeHtml(item.text)}</p>
        ${item.translation ? `<p class="item-translation">${escapeHtml(item.translation)}</p>` : ''}
      </div>
      <div class="item-meta">
        <div class="item-info">
          <span class="play-count-badge" title="Số lần đã nghe">🎧 ${item.playCount || 0}</span>
          ${item.sourceTitle ? `<span title="${escapeHtml(item.sourceUrl)}">${truncate(item.sourceTitle, 20)}</span>` : ''}
        </div>
        <div class="item-actions">
          <button class="btn-action btn-play ${currentlyPlayingId === item.id ? 'playing' : ''}" data-id="${item.id}">
            ${currentlyPlayingId === item.id ? '⏹️ Dừng' : '▶️ Nghe'}
          </button>
          <button class="btn-action btn-loop ${loopActiveId === item.id ? 'active' : ''}" data-id="${item.id}" title="Lặp lại 3 lần">
            🔁 Lặp
          </button>
          <button class="btn-action btn-edit" data-id="${item.id}" title="Thêm/Sửa bản dịch">
            ✏️
          </button>
          <button class="btn-action btn-toggle-status" data-id="${item.id}" title="${item.status === 'active' ? 'Đánh dấu thuộc (Archive)' : 'Đưa lại danh sách Cần nghe'}">
            ${item.status === 'active' ? '✅' : '↩️'}
          </button>
          <button class="btn-action btn-delete" data-id="${item.id}" title="Xóa câu này">
            🗑️
          </button>
        </div>
      </div>
    `;

    // Event Listeners for Card
    const textEl = card.querySelector(".item-text");
    card.querySelector(".item-text-container").addEventListener("click", () => {
      textEl.classList.toggle("blurred");
    });

    // Play Button
    card.querySelector(".btn-play").addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlay(item.id, item.text);
    });

    // Loop Button
    card.querySelector(".btn-loop").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleLoop(item.id, item.text);
    });

    // Edit Button
    card.querySelector(".btn-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      editTranslation(item);
    });

    // Toggle Status (Archive/Active)
    card.querySelector(".btn-toggle-status").addEventListener("click", (e) => {
      e.stopPropagation();
      item.status = item.status === "active" ? "archived" : "active";
      item.updatedAt = new Date().toISOString();
      saveData();
    });

    // Delete Button
    card.querySelector(".btn-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Xóa câu: "${item.text}"?`)) {
        kaylishItems = kaylishItems.filter(i => i.id !== item.id);
        if (currentlyPlayingId === item.id) stopSpeech();
        saveData();
      }
    });

    return card;
  }

  // Web Speech API Playback Handler
  function playSpeech(text, onEndCallback = null) {
    if (!("speechSynthesis" in window)) return;
    
    window.speechSynthesis.cancel(); // Stop ongoing speech

    speechUtterance = new SpeechSynthesisUtterance(text);
    speechUtterance.rate = selectedSpeed;

    if (selectedVoiceName) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === selectedVoiceName);
      if (voice) speechUtterance.voice = voice;
    }

    speechUtterance.onend = () => {
      if (onEndCallback) {
        onEndCallback();
      } else {
        currentlyPlayingId = null;
        render();
      }
    };

    speechUtterance.onerror = (err) => {
      console.error("Speech error:", err);
      currentlyPlayingId = null;
      loopActiveId = null;
      render();
    };

    window.speechSynthesis.speak(speechUtterance);
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    currentlyPlayingId = null;
    loopActiveId = null;
    render();
  }

  function togglePlay(id, text) {
    if (currentlyPlayingId === id) {
      stopSpeech();
    } else {
      currentlyPlayingId = id;
      loopActiveId = null;
      incrementPlayCount(id);
      render();
      playSpeech(text);
    }
  }

  function toggleLoop(id, text) {
    if (loopActiveId === id) {
      stopSpeech();
    } else {
      loopActiveId = id;
      currentlyPlayingId = id;
      let count = 0;

      const runLoop = () => {
        if (loopActiveId !== id) return;
        count++;
        incrementPlayCount(id);
        render();

        playSpeech(text, () => {
          if (count < 3 && loopActiveId === id) {
            setTimeout(runLoop, 600); // 600ms gap between loops
          } else {
            currentlyPlayingId = null;
            loopActiveId = null;
            render();
          }
        });
      };

      runLoop();
    }
  }

  function incrementPlayCount(id) {
    const item = kaylishItems.find(i => i.id === id);
    if (item) {
      item.playCount = (item.playCount || 0) + 1;
      chrome.storage.sync.set({ kaylishItems });
    }
  }

  function editTranslation(item) {
    const newTranslation = prompt("Nhập bản dịch hoặc ghi chú cho câu này:", item.translation || "");
    if (newTranslation !== null) {
      item.translation = newTranslation.trim();
      item.updatedAt = new Date().toISOString();
      saveData();
    }
  }

  // Global Event Listeners
  selectVoice.addEventListener("change", () => {
    selectedVoiceName = selectVoice.value;
    chrome.storage.sync.set({ preferredVoice: selectedVoiceName });
  });

  speedBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      speedBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedSpeed = parseFloat(btn.dataset.speed);
      chrome.storage.sync.set({ selectedSpeed });
    });
  });

  toggleBlur.addEventListener("change", () => {
    blurMode = toggleBlur.checked;
    chrome.storage.sync.set({ blurMode });
    render();
  });

  inputSearch.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    render();
  });

  formAdd.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = inputText.value.trim();
    if (!text) return;

    chrome.runtime.sendMessage({
      action: "SAVE_SENTENCE",
      text: text,
      sourceUrl: "",
      sourceTitle: "Nhập tay"
    }, (response) => {
      inputText.value = "";
      if (response && response.item) {
        kaylishItems.unshift(response.item);
        render();
      }
    });
  });

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      render();
    });
  });

  // Export JSON Backup
  btnExport.addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(kaylishItems, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `kaylish_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  // Import JSON Backup
  btnImport.addEventListener("click", () => {
    fileImport.click();
  });

  fileImport.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedItems = JSON.parse(event.target.result);
        if (Array.isArray(importedItems)) {
          if (confirm(`Nhập ${importedItems.length} câu vào danh sách hiện tại?`)) {
            // Merge deduplicated
            const existingMap = new Map(kaylishItems.map(i => [i.text.toLowerCase(), i]));
            importedItems.forEach(item => {
              if (item.text && !existingMap.has(item.text.toLowerCase())) {
                kaylishItems.push(item);
              }
            });
            saveData();
            alert("Nhập dữ liệu thành công!");
          }
        } else {
          alert("File JSON không hợp lệ.");
        }
      } catch (err) {
        alert("Lỗi đọc file JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Google Drive Sync Button Handler (with Client ID & Token support)
  const btnGDriveSync = document.getElementById("btn-gdrive-sync");
  const btnSettings = document.getElementById("btn-settings");
  const syncStatusLabel = document.getElementById("sync-status-label");

  btnSettings.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options/options.html"));
    }
  });

  btnGDriveSync.addEventListener("click", async () => {
    let token = await KAYLISH_GDRIVE.getToken();
    
    // If no valid token, try login using saved Client ID
    if (!token) {
      const data = await new Promise(r => chrome.storage.sync.get({ gdriveClientId: "" }, r));
      let clientId = data.gdriveClientId;

      if (!clientId) {
        clientId = prompt("Nhập Google OAuth Client ID của bạn (Dạng: xxx.apps.googleusercontent.com):", "");
        if (clientId && clientId.trim()) {
          clientId = clientId.trim();
          chrome.storage.sync.set({ gdriveClientId: clientId });
        } else {
          return;
        }
      }

      // Trigger 1-Click Google Login Popup
      try {
        syncStatusLabel.textContent = "Đang đăng nhập...";
        token = await KAYLISH_GDRIVE.requestAccessTokenViaPopup(clientId);
      } catch (err) {
        alert("Lỗi đăng nhập Google: " + err.message);
        syncStatusLabel.textContent = "Lỗi Auth";
        return;
      }
    }

    // Perform Drive Sync
    syncStatusLabel.textContent = "Đang sync...";
    try {
      const remoteItems = await KAYLISH_GDRIVE.downloadData(token);
      if (remoteItems && Array.isArray(remoteItems)) {
        const localMap = new Map(kaylishItems.map(i => [i.text.toLowerCase(), i]));
        let newCount = 0;
        remoteItems.forEach(item => {
          if (!localMap.has(item.text.toLowerCase())) {
            kaylishItems.push(item);
            newCount++;
          }
        });
        saveData();
        await KAYLISH_GDRIVE.uploadData(token, kaylishItems);
        syncStatusLabel.textContent = "Synced ✅";
        alert(`✅ Đã đồng bộ Google Drive thành công! (Thêm ${newCount} câu mới)`);
      } else {
        await KAYLISH_GDRIVE.uploadData(token, kaylishItems);
        syncStatusLabel.textContent = "Synced ✅";
        alert("✅ Đã đẩy dữ liệu lên Google Drive!");
      }
    } catch (err) {
      console.error("Sync error:", err);
      syncStatusLabel.textContent = "Lỗi Sync";
      if (confirm("⚠️ Xảy ra lỗi đồng bộ hoặc hết hạn phiên. Bạn có muốn Đăng nhập lại không?")) {
        await KAYLISH_GDRIVE.clearToken();
        btnGDriveSync.click();
      }
    }
  });

  // Utility Functions
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.innerText = text;
    return div.innerHTML;
  }

  function truncate(str, maxLength) {
    if (!str) return "";
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength) + "...";
  }

  // Start initialization
  initVoices();
  loadInitialData();
});
