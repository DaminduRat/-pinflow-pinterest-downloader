// Active downloads map: downloadId -> { url, fallbackUrl, filename }
const activeDownloads = new Map();

// Helper to extract image hash and extension
function parsePinterestUrl(url) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/');
    const filename = pathParts[pathParts.length - 1];
    const dotIndex = filename.lastIndexOf('.');
    
    if (dotIndex !== -1) {
      return {
        hash: filename.substring(0, dotIndex),
        ext: filename.substring(dotIndex + 1)
      };
    }
    return { hash: 'image', ext: 'jpg' };
  } catch (e) {
    return { hash: 'image', ext: 'jpg' };
  }
}

// Convert low-res URL to Pinterest original high-res URL
function getOriginalUrl(url) {
  // Typical patterns: i.pinimg.com/236x/... or /564x/... or /736x/...
  // We replace the size indicator with 'originals'
  return url.replace(/\/(?:236|474|564|736)x\//, '/originals/');
}

// Clean and format a title to make it a safe filename
function formatFilename(title, hash, ext) {
  if (title) {
    let safeTitle = title
      .replace(/[\\\/:\*\?"<>\|]/g, '') // Remove invalid filename characters
      .replace(/\s+/g, '_')             // Replace spaces/whitespace with underscores
      .replace(/__+/g, '_')             // De-duplicate multiple underscores
      .replace(/^_+|_+$/g, '')          // Trim leading/trailing underscores
      .trim();
      
    if (safeTitle.length > 0) {
      // Limit filename length to 100 characters to avoid OS limit errors
      return `${safeTitle.substring(0, 100)}.${ext}`;
    }
  }
  return `pin_${hash}.${ext}`;
}

// Listen for download requests from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadImage') {
    const srcUrl = message.url;
    const title = message.title;
    const originalUrl = getOriginalUrl(srcUrl);
    const { hash, ext } = parsePinterestUrl(srcUrl);

    // Retrieve preferences dynamically
    chrome.storage.local.get({ useSubfolder: true }, (settings) => {
      const cleanFilename = formatFilename(title, hash, ext);
      const filename = settings.useSubfolder ? `PinFlow/${cleanFilename}` : cleanFilename;

      // Start download with original URL
      chrome.downloads.download({
        url: originalUrl,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("Download failed to initiate:", chrome.runtime.lastError);
          // Fallback directly
          startFallbackDownload(srcUrl, filename);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          // Register the download for monitoring and fallback
          activeDownloads.set(downloadId, {
            url: originalUrl,
            fallbackUrl: srcUrl,
            filename: filename
          });
          sendResponse({ success: true, downloadId });
        }
      });
    });

    return true; // Keep message channel open for asynchronous response
  }
});

// Helper to start fallback download
function startFallbackDownload(url, filename) {
  chrome.downloads.download({
    url: url,
    filename: filename,
    conflictAction: 'uniquify',
    saveAs: false
  }, (downloadId) => {
    if (downloadId) {
      activeDownloads.set(downloadId, { url, filename });
    }
  });
}

// Monitor download changes for errors and success
chrome.downloads.onChanged.addListener((delta) => {
  if (activeDownloads.has(delta.id)) {
    const downloadInfo = activeDownloads.get(delta.id);

    if (delta.state && delta.state.current === 'complete') {
      // Successfully downloaded! Increment stats
      chrome.storage.local.get({ downloadCount: 0 }, (result) => {
        chrome.storage.local.set({ downloadCount: result.downloadCount + 1 });
      });
      activeDownloads.delete(delta.id);
    } else if (delta.error && delta.error.current) {
      const errorMsg = delta.error.current;
      console.warn(`Download ${delta.id} failed: ${errorMsg}`);
      
      // Do NOT trigger fallback if the user manually canceled the download picker
      if (errorMsg !== 'USER_CANCELED' && downloadInfo.fallbackUrl && downloadInfo.url !== downloadInfo.fallbackUrl) {
        console.log(`Retrying with fallback URL: ${downloadInfo.fallbackUrl}`);
        startFallbackDownload(downloadInfo.fallbackUrl, downloadInfo.filename);
      }
      activeDownloads.delete(delta.id);
    }
  }
});
