// Kaylish Mobile App Logic with Google Drive Sync & Web Speech API

document.addEventListener("DOMContentLoaded", () => {
  // Application State
  let kaylishItems = [];
  let currentTab = "active";
  let blurMode = true;
  let selectedSpeed = 1.0;
  let selectedVoiceName = "";
  let currentlyPlayingId = null;
  let loopActiveId = null;
  let speechUtterance = null;
  let gdriveToken = "";

  // DOM Elements
  const btnGDriveSync = document.getElementById("btn-gdrive-sync");
  const syncStatusLabel = document.getElementById("sync-status-label");
  const syncBanner = document.getElementById("sync-banner");
  const syncBannerText = document.getElementById("sync-banner-text");
  const btnCloseBanner = document.getElementById("btn-close-banner");
  
  const statActive = document.getElementById("stat-active");
  const statListened = document.getElementById("stat-listened");
  const statArchived = document.getElementById("stat-archived");
  
  const selectVoice = document.getElementById("select-voice");
  const speedBtns = document.querySelectorAll(".speed-btn");
  const toggleBlur = document.getElementById("toggle-blur");
  
  const formAdd = document.getElementById("form-add");
  const inputText = document.getElementById("input-text");
  
  const tabBtns = document.querySelectorAll(".tab-btn");
  const badgeActive = document.getElementById("badge-active");
  const badgeArchived = document.getElementById("badge-archived");
  const itemsList = document.getElementById("items-list");
  const emptyState = document.getElementById("empty-state");
  
  const btnSettings = document.getElementById("btn-settings");
  const modalSettings = document.getElementById("modal-settings");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const inputGDriveToken = document.getElementById("input-gdrive-token");
  const btnSaveGDriveToken = document.getElementById("btn-save-gdrive-token");
  const btnExportJson = document.getElementById("btn-export-json");
  const btnImportJson = document.getElementById("btn-import-json");
  const fileImport = document.getElementById("file-import");

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration error:', err);
    });
  }

  // Load Initial Data from LocalStorage & Check GDrive Token
  async function init() {
    const localData = localStorage.getItem("kaylish_items");
    if (localData) {
      try {
        kaylishItems = JSON.parse(localData);
      } catch (e) {
        kaylishItems = [];
      }
    }

    gdriveToken = await KAYLISH_GDRIVE.getToken() || "";
    if (gdriveToken) {
      inputGDriveToken.value = gdriveToken;
      syncStatusLabel.textContent = "Sync Ready";
    }

    initVoices();
    render();

    // Auto sync with Google Drive if Token exists
    if (gdriveToken) {
      syncWithGoogleDrive();
    }
  }

  // Speech Synthesis Voices
  function initVoices() {
    if (!("speechSynthesis" in window)) return;
    
    function populateVoices() {
      const voices = window.speechSynthesis.getVoices();
      selectVoice.innerHTML = "";
      const englishVoices = voices.filter(v => v.lang.startsWith("en"));
      const list = englishVoices.length > 0 ? englishVoices : voices;

      list.forEach(v => {
        const option = document.createElement("option");
        option.value = v.name;
        option.textContent = `${v.name} (${v.lang})`;
        if (v.default || v.name.includes("Google") || v.name.includes("Samantha")) {
          option.selected = true;
        }
        selectVoice.appendChild(option);
      });
      if (selectVoice.value) selectedVoiceName = selectVoice.value;
    }

    populateVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = populateVoices;
    }
  }

  // Save State
  function saveData() {
    localStorage.setItem("kaylish_items", JSON.stringify(kaylishItems));
    render();
    
    // Trigger Google Drive upload if token available
    if (gdriveToken) {
      KAYLISH_GDRIVE.uploadData(gdriveToken, kaylishItems).catch(err => {
        console.error("GDrive Auto-Upload error:", err);
      });
    }
  }

  // Google Drive Sync Engine
  async function syncWithGoogleDrive() {
    if (!gdriveToken) {
      modalSettings.style.display = "flex";
      return;
    }

    syncStatusLabel.textContent = "Đang sync...";
    showBanner("☁️ Đang kết nối Google Drive...");

    try {
      const remoteItems = await KAYLISH_GDRIVE.downloadData(gdriveToken);
      if (remoteItems && Array.isArray(remoteItems)) {
        // Merge items deduplicating by text
        const localMap = new Map(kaylishItems.map(i => [i.text.toLowerCase(), i]));
        let newCount = 0;

        remoteItems.forEach(item => {
          if (!localMap.has(item.text.toLowerCase())) {
            kaylishItems.push(item);
            newCount++;
          }
        });

        localStorage.setItem("kaylish_items", JSON.stringify(kaylishItems));
        render();

        // Also upload merged set to ensure drive is up-to-date
        await KAYLISH_GDRIVE.uploadData(gdriveToken, kaylishItems);
        
        syncStatusLabel.textContent = "Synced ✅";
        showBanner(`✅ Đã đồng bộ Google Drive thành công! (${newCount} câu mới)`);
      } else {
        // No remote file yet, upload local
        await KAYLISH_GDRIVE.uploadData(gdriveToken, kaylishItems);
        syncStatusLabel.textContent = "Synced ✅";
        showBanner("✅ Đã tải dữ liệu lên Google Drive!");
      }
    } catch (err) {
      console.error("Sync error:", err);
      syncStatusLabel.textContent = "Lỗi Sync";
      showBanner("⚠️ Lỗi đồng bộ: " + err.message + ". Vui lòng kiểm tra lại Token.");
    }
  }

  // Render Mobile UI
  function render() {
    const activeItems = kaylishItems.filter(i => i.status === "active");
    const archivedItems = kaylishItems.filter(i => i.status === "archived");

    // Stats
    statActive.textContent = activeItems.length;
    statArchived.textContent = archivedItems.length;
    const totalListens = kaylishItems.reduce((acc, curr) => acc + (curr.playCount || 0), 0);
    statListened.textContent = totalListens;

    // Badges
    badgeActive.textContent = activeItems.length;
    badgeArchived.textContent = archivedItems.length;

    // List
    const targetList = currentTab === "active" ? activeItems : archivedItems;
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

  // Create Item Card Element
  function createItemCard(item) {
    const card = document.createElement("div");
    card.className = `item-card ${currentlyPlayingId === item.id ? "is-playing" : ""}`;
    card.dataset.id = item.id;

    const isBlurred = blurMode;

    card.innerHTML = `
      <div class="item-text-container">
        <p class="item-text ${isBlurred ? 'blurred' : ''}">${escapeHtml(item.text)}</p>
        ${item.translation ? `<p class="item-translation">${escapeHtml(item.translation)}</p>` : ''}
      </div>
      <div class="item-actions">
        <div class="action-group">
          <button class="btn-action btn-play ${currentlyPlayingId === item.id ? 'playing' : ''}">
            ${currentlyPlayingId === item.id ? '⏹️ Dừng' : '▶️ Nghe'}
          </button>
          <button class="btn-action btn-loop ${loopActiveId === item.id ? 'active' : ''}" title="Lặp 3 lần">
            🔁 Lặp 3x
          </button>
        </div>
        <div class="action-group">
          <button class="btn-action btn-toggle-status">
            ${item.status === 'active' ? '✅ Thuộc' : '↩️ Nghe lại'}
          </button>
          <button class="btn-action btn-delete">
            🗑️
          </button>
        </div>
      </div>
    `;

    const textEl = card.querySelector(".item-text");
    card.querySelector(".item-text-container").addEventListener("click", () => {
      textEl.classList.toggle("blurred");
    });

    card.querySelector(".btn-play").addEventListener("click", () => {
      togglePlay(item.id, item.text);
    });

    card.querySelector(".btn-loop").addEventListener("click", () => {
      toggleLoop(item.id, item.text);
    });

    card.querySelector(".btn-toggle-status").addEventListener("click", () => {
      item.status = item.status === "active" ? "archived" : "active";
      item.updatedAt = new Date().toISOString();
      saveData();
    });

    card.querySelector(".btn-delete").addEventListener("click", () => {
      if (confirm(`Xóa câu: "${item.text}"?`)) {
        kaylishItems = kaylishItems.filter(i => i.id !== item.id);
        if (currentlyPlayingId === item.id) stopSpeech();
        saveData();
      }
    });

    return card;
  }

  // Audio Handler
  function playSpeech(text, onEndCallback = null) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    speechUtterance = new SpeechSynthesisUtterance(text);
    speechUtterance.rate = selectedSpeed;

    if (selectedVoiceName) {
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find(voice => voice.name === selectedVoiceName);
      if (v) speechUtterance.voice = v;
    }

    speechUtterance.onend = () => {
      if (onEndCallback) onEndCallback();
      else {
        currentlyPlayingId = null;
        render();
      }
    };

    speechUtterance.onerror = () => {
      currentlyPlayingId = null;
      loopActiveId = null;
      render();
    };

    window.speechSynthesis.speak(speechUtterance);
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    currentlyPlayingId = null;
    loopActiveId = null;
    render();
  }

  function togglePlay(id, text) {
    if (currentlyPlayingId === id) stopSpeech();
    else {
      currentlyPlayingId = id;
      loopActiveId = null;
      incrementPlayCount(id);
      render();
      playSpeech(text);
    }
  }

  function toggleLoop(id, text) {
    if (loopActiveId === id) stopSpeech();
    else {
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
            setTimeout(runLoop, 600);
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
      localStorage.setItem("kaylish_items", JSON.stringify(kaylishItems));
    }
  }

  function showBanner(msg) {
    syncBannerText.textContent = msg;
    syncBanner.style.display = "flex";
  }

  // Event Listeners
  btnGDriveSync.addEventListener("click", () => {
    syncWithGoogleDrive();
  });

  btnCloseBanner.addEventListener("click", () => {
    syncBanner.style.display = "none";
  });

  selectVoice.addEventListener("change", () => {
    selectedVoiceName = selectVoice.value;
  });

  speedBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      speedBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedSpeed = parseFloat(btn.dataset.speed);
    });
  });

  toggleBlur.addEventListener("change", () => {
    blurMode = toggleBlur.checked;
    render();
  });

  formAdd.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = inputText.value.trim();
    if (!text) return;

    const newItem = {
      id: "kay_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
      text: text,
      translation: "",
      sourceUrl: "",
      sourceTitle: "Thêm từ điện thoại",
      status: "active",
      playCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    kaylishItems.unshift(newItem);
    inputText.value = "";
    saveData();
  });

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      render();
    });
  });

  const inputGDriveClientId = document.getElementById("input-gdrive-clientid");
  const btnSaveGDriveClientId = document.getElementById("btn-save-gdrive-clientid");

  // Load saved Client ID if available
  const savedClientId = localStorage.getItem("kaylish_gdrive_client_id") || "";
  if (savedClientId && inputGDriveClientId) {
    inputGDriveClientId.value = savedClientId;
  }

  btnSaveGDriveClientId.addEventListener("click", async () => {
    const clientId = inputGDriveClientId.value.trim();
    if (!clientId) {
      alert("Vui lòng nhập Google Client ID.");
      return;
    }

    localStorage.setItem("kaylish_gdrive_client_id", clientId);
    try {
      showBanner("🔑 Đang mở cửa sổ đăng nhập Google...");
      gdriveToken = await KAYLISH_GDRIVE.requestAccessTokenViaPopup(clientId);
      inputGDriveToken.value = gdriveToken;
      modalSettings.style.display = "none";
      alert("✅ Đăng nhập Google thành công! Đang đồng bộ...");
      syncWithGoogleDrive();
    } catch (err) {
      alert("Lỗi đăng nhập: " + err.message);
    }
  });

  btnCloseModal.addEventListener("click", () => {
    modalSettings.style.display = "none";
  });

  btnSaveGDriveToken.addEventListener("click", () => {
    const token = inputGDriveToken.value.trim();
    if (token) {
      gdriveToken = token;
      KAYLISH_GDRIVE.saveToken(token);
      alert("Đã lưu Google OAuth Token! Đang thực hiện Sync...");
      modalSettings.style.display = "none";
      syncWithGoogleDrive();
    } else {
      KAYLISH_GDRIVE.clearToken();
      gdriveToken = "";
      alert("Đã xóa Token Google Drive.");
    }
  });

  btnExportJson.addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(kaylishItems, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = `kaylish_mobile_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  });

  btnImportJson.addEventListener("click", () => {
    fileImport.click();
  });

  fileImport.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          const map = new Map(kaylishItems.map(i => [i.text.toLowerCase(), i]));
          imported.forEach(i => {
            if (i.text && !map.has(i.text.toLowerCase())) kaylishItems.push(i);
          });
          saveData();
          alert("Nhập dữ liệu thành công!");
          modalSettings.style.display = "none";
        }
      } catch (err) {
        alert("Lỗi đọc JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.innerText = text;
    return div.innerHTML;
  }

  init();
});
