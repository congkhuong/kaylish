/**
 * Kaylish Google Drive Sync Helper (Google Drive API v3)
 * Stores 'kaylish_data.json' visibly in user's main Google Drive
 */

const KAYLISH_GDRIVE = {
  SCOPES: 'https://www.googleapis.com/auth/drive.file',
  FILE_NAME: 'kaylish_data.json',
  
  // Check if access token is saved and still valid
  getToken() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get({ gdriveToken: '', tokenExpiry: 0 }, (data) => {
          if (data.gdriveToken && Date.now() < data.tokenExpiry) {
            resolve(data.gdriveToken);
          } else {
            resolve(null);
          }
        });
      } else {
        const token = localStorage.getItem('kaylish_gdrive_token');
        const expiry = parseInt(localStorage.getItem('kaylish_gdrive_expiry') || '0', 10);
        if (token && Date.now() < expiry) {
          resolve(token);
        } else {
          resolve(null);
        }
      }
    });
  },

  saveToken(token, expiresInSeconds = 3600) {
    const expiry = Date.now() + (expiresInSeconds * 1000) - 60000; // 1 min buffer
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ gdriveToken: token, tokenExpiry: expiry }, resolve);
      } else {
        localStorage.setItem('kaylish_gdrive_token', token);
        localStorage.setItem('kaylish_gdrive_expiry', expiry.toString());
        resolve();
      }
    });
  },

  clearToken() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.remove(['gdriveToken', 'tokenExpiry'], resolve);
      } else {
        localStorage.removeItem('kaylish_gdrive_token');
        localStorage.removeItem('kaylish_gdrive_expiry');
        resolve();
      }
    });
  },

  // Native Chrome Extension Auth Flow (Manifest V3)
  requestAccessTokenViaChromeIdentity(clientId) {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.launchWebAuthFlow) {
        const redirectUri = chrome.identity.getRedirectURL();
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(clientId)}&` +
          `response_type=token&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent(this.SCOPES)}`;

        chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!redirectUrl) {
            return reject(new Error("Đã hủy đăng nhập Google."));
          }
          try {
            const url = new URL(redirectUrl);
            const hash = url.hash.startsWith('#') ? url.hash.substring(1) : url.hash;
            const params = new URLSearchParams(hash);
            const token = params.get("access_token");
            const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
            if (token) {
              this.saveToken(token, expiresIn);
              resolve(token);
            } else {
              reject(new Error("Không tìm thấy token trong phản hồi."));
            }
          } catch (e) {
            reject(new Error("Lỗi đọc token: " + e.message));
          }
        });
      } else {
        reject(new Error("chrome.identity API không hỗ trợ ở môi trường này."));
      }
    });
  },

  // Google Identity Services (GIS) 1-Click Login for Web/Mobile
  requestAccessTokenViaPopup(clientId) {
    if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.launchWebAuthFlow) {
      return this.requestAccessTokenViaChromeIdentity(clientId);
    }
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        return reject(new Error("Google Identity SDK chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng."));
      }

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: this.SCOPES,
        callback: (response) => {
          if (response.error) {
            return reject(new Error("Lỗi đăng nhập Google: " + response.error));
          }
          if (response.access_token) {
            const expiresIn = response.expires_in || 3600;
            this.saveToken(response.access_token, expiresIn);
            resolve(response.access_token);
          }
        },
      });

      client.requestAccessToken({ prompt: 'select_account' });
    });
  },

  // Search for existing kaylish_data.json in main Drive folder
  async findFileId(token) {
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=name='" + this.FILE_NAME + "' and trashed=false",
      {
        headers: { Authorization: "Bearer " + token }
      }
    );
    if (res.status === 401 || res.status === 403) {
      await KAYLISH_GDRIVE.clearToken();
      throw new Error("Phiên làm việc hết hạn hoặc cần cấp lại quyền. Vui lòng bấm 'Đăng nhập với Google'.");
    }
    if (!res.ok) throw new Error("Search file error: " + res.statusText);
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  },

  // Download items from Google Drive
  async downloadData(token) {
    const fileId = await KAYLISH_GDRIVE.findFileId(token);
    if (!fileId) return null;

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (res.status === 401 || res.status === 403) {
      await KAYLISH_GDRIVE.clearToken();
      throw new Error("Phiên làm việc hết hạn. Vui lòng bấm 'Đăng nhập với Google'.");
    }
    if (!res.ok) throw new Error("Download error: " + res.statusText);
    return await res.json();
  },

  // Upload/Save items to Google Drive (create or update visible file)
  async uploadData(token, kaylishItems) {
    const fileId = await KAYLISH_GDRIVE.findFileId(token);
    const content = JSON.stringify(kaylishItems, null, 2);

    const metadata = {
      name: KAYLISH_GDRIVE.FILE_NAME,
      mimeType: "application/json"
    };

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    form.append("file", new Blob([content], { type: "application/json" }));

    let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    let method = "POST";

    if (fileId) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
      method = "PATCH";
    }

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });

    if (res.status === 401 || res.status === 403) {
      await KAYLISH_GDRIVE.clearToken();
      throw new Error("Phiên làm việc hết hạn. Vui lòng bấm 'Đăng nhập với Google'.");
    }
    if (!res.ok) throw new Error("Upload error: " + res.statusText);
    return await res.json();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = KAYLISH_GDRIVE;
}
