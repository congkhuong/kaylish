// Kaylish Content Script - Handles Toast Notifications

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SHOW_TOAST") {
    showKaylishToast(request.message);
    sendResponse({ status: "OK" });
  }
});

function showKaylishToast(message) {
  let existingToast = document.querySelector(".kaylish-toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.className = "kaylish-toast";
  toast.innerHTML = `
    <div class="kaylish-toast-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="22"></line>
      </svg>
    </div>
    <div class="kaylish-toast-text">${escapeHtml(message)}</div>
  `;

  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("kaylish-toast-show");
  });

  setTimeout(() => {
    toast.classList.remove("kaylish-toast-show");
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}
