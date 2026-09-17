// Kaylish Options Page Logic

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const inputClientId = document.getElementById("input-client-id");
  const inputRedirectUri = document.getElementById("input-redirect-uri");
  const btnCopyUri = document.getElementById("btn-copy-uri");
  const btnGoogleLogin = document.getElementById("btn-google-login");
  
  const inputAccessToken = document.getElementById("input-access-token");
  const btnSaveToken = document.getElementById("btn-save-token");
  
  const statusBadge = document.getElementById("status-badge");
  const statusLastSync = document.getElementById("status-last-sync");
  const statusItemCount = document.getElementById("status-item-count");
  
  const btnSyncNow = document.getElementById("btn-sync-now");
  const btnDisconnect = document.getElementById("btn-disconnect");
  
  const btnExportJson = document.getElementById("btn-export-json");
  const btnImportJson = document.getElementById("btn-import-json");
  const fileImport = document.getElementById("file-import");

  // 1. Display Chrome Identity Redirect URI
  if (typeof chrome !== "undefined" && chrome.identity && chrome.identity.getRedirectURL) {
    const redirectUri = chrome.identity.getRedirectURL();
    inputRedirectUri.value = redirectUri;
  } else {
    inputRedirectUri.value = "https://developers.google.com/oauthplayground";
  }

  // 2. Copy Redirect URI Handler
  btnCopyUri.addEventListener("click", () => {
    inputRedirectUri.select();
    navigator.clipboard.writeText(inputRedirectUri.value);
    btnCopyUri.textContent = "✅ Đã Copy!";
    setTimeout(() => { btnCopyUri.textContent = "📋 Copy"; }, 2000);
  });

  // 3. Load Saved Settings
  function loadSettings() {
    chrome.storage.sync.get({
      gdriveClientId: "",
      gdriveToken: "",
      tokenExpiry: 0,
      kaylishItems: [],
      lastSyncTime: ""
    }, (data) => {
      inputClientId.value = data.gdriveClientId || "";
      if (data.gdriveToken && Date.now() < data.tokenExpiry) {
        inputAccessToken.value = data.gdriveToken;
        statusBadge.textContent = "Đã kết nối Google Drive ✅";
        statusBadge.className = "badge badge-success";
      } else {
        statusBadge.textContent = "Chưa kết nối hoặc Hết hạn Token";
        statusBadge.className = "badge badge-warning";
      }

      statusItemCount.textContent = `${(data.kaylishItems || []).length} câu`;
      statusLastSync.textContent = data.lastSyncTime || "Chưa từng sync";
    });
  }

  // 4. Google OAuth Popup Login
  btnGoogleLogin.addEventListener("click", async () => {
    const clientId = inputClientId.value.trim();
    if (!clientId) {
      alert("Vui lòng nhập Google Client ID trước.");
      inputClientId.focus();
      return;
    }

    chrome.storage.sync.set({ gdriveClientId: clientId });

    try {
      btnGoogleLogin.textContent = "⏳ Đang kết nối Google...";
      const token = await KAYLISH_GDRIVE.requestAccessTokenViaPopup(clientId);
      inputAccessToken.value = token;
      alert("✅ Đăng nhập Google thành công! Đang tiến hành đồng bộ dữ liệu...");
      await triggerSync(token);
    } catch (err) {
      alert("⚠️ Lỗi đăng nhập Google: " + err.message + "\n\n💡 Mẹo: Hãy kiểm tra bạn đã thêm Redirect URI vào Google Cloud Console chưa.");
    } finally {
      btnGoogleLogin.textContent = "🔑 Đăng nhập với Google & Kích hoạt Sync";
      loadSettings();
    }
  });

  // 5. Save Manual Token
  btnSaveToken.addEventListener("click", async () => {
    const token = inputAccessToken.value.trim();
    if (!token) {
      alert("Vui lòng dán Token.");
      return;
    }

    await KAYLISH_GDRIVE.saveToken(token, 3600);
    alert("Đã lưu Token! Đang kiểm tra đồng bộ...");
    await triggerSync(token);
    loadSettings();
  });

  // 6. Trigger Sync Now
  btnSyncNow.addEventListener("click", async () => {
    const token = await KAYLISH_GDRIVE.getToken();
    if (!token) {
      alert("Chưa có Token hoặc Token đã hết hạn. Vui lòng bấm Đăng nhập với Google trước.");
      return;
    }
    btnSyncNow.textContent = "⏳ Đang đồng bộ...";
    await triggerSync(token);
    btnSyncNow.textContent = "🚀 Đồng bộ ngay lên Google Drive (Sync Now)";
    loadSettings();
  });

  // Core Sync Function
  async function triggerSync(token) {
    try {
      const data = await new Promise(r => chrome.storage.sync.get({ kaylishItems: [] }, r));
      let kaylishItems = data.kaylishItems || [];

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
        
        const now = new Date().toLocaleString("vi-VN");
        chrome.storage.sync.set({ kaylishItems, lastSyncTime: now }, () => {
          chrome.runtime.sendMessage({ action: "UPDATE_BADGE" });
        });
        
        await KAYLISH_GDRIVE.uploadData(token, kaylishItems);
        alert(`✅ Đồng bộ Google Drive hoàn tất! (Thêm ${newCount} câu từ Drive)`);
      } else {
        const now = new Date().toLocaleString("vi-VN");
        await KAYLISH_GDRIVE.uploadData(token, kaylishItems);
        chrome.storage.sync.set({ lastSyncTime: now });
        alert("✅ Đã tải dữ liệu lên Google Drive thành công!");
      }
    } catch (err) {
      alert("⚠️ Lỗi đồng bộ: " + err.message);
    }
  }

  // 7. Disconnect
  btnDisconnect.addEventListener("click", async () => {
    if (confirm("Bạn có chắc muốn xóa Token kết nối hiện tại?")) {
      await KAYLISH_GDRIVE.clearToken();
      inputAccessToken.value = "";
      alert("Đã đăng xuất kết nối Google Drive.");
      loadSettings();
    }
  });

  // 8. JSON Export / Import
  btnExportJson.addEventListener("click", () => {
    chrome.storage.sync.get({ kaylishItems: [] }, (data) => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data.kaylishItems, null, 2));
      const a = document.createElement("a");
      a.href = dataStr;
      a.download = `kaylish_backup_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
    });
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
          chrome.storage.sync.get({ kaylishItems: [] }, (data) => {
            let items = data.kaylishItems || [];
            const map = new Map(items.map(i => [i.text.toLowerCase(), i]));
            imported.forEach(i => {
              if (i.text && !map.has(i.text.toLowerCase())) items.push(i);
            });
            chrome.storage.sync.set({ kaylishItems: items }, () => {
              alert(`Nhập thành công ${imported.length} câu!`);
              loadSettings();
            });
          });
        }
      } catch (err) {
        alert("Lỗi đọc file JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  loadSettings();
});
