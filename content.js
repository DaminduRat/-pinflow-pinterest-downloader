// SVG Icon definitions
const downloadSVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
`;

const spinnerSVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="pinflow-spin">
    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)"></circle>
    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
  </svg>
`;

const successSVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`;

// Check if image URL belongs to Pinterest pin assets
const isPinImageUrl = (url) => {
  if (!url) return false;
  return url.includes('i.pinimg.com') && (
    url.includes('/236x/') ||
    url.includes('/474x/') ||
    url.includes('/564x/') ||
    url.includes('/736x/') ||
    url.includes('/originals/')
  );
};

// Find the appropriate card container for positioning the button
function findTargetContainer(img) {
  // 1. Try standard Pinterest pin container
  let container = img.closest('[data-test-id="pin"]');
  if (container) return container;

  // 2. Try link wrappers pointing to pins
  container = img.closest('a[href*="/pin/"]');
  if (container) return container;

  // 3. For detail pages, climb up and look for a styled relative/absolute parent container
  let parent = img.parentElement;
  let depth = 0;
  while (parent && parent.tagName !== 'BODY' && depth < 5) {
    const style = window.getComputedStyle(parent);
    if (parent.tagName === 'DIV' && (style.position === 'relative' || style.position === 'absolute')) {
      // Avoid containers that span the whole screen or have no size
      if (parent.offsetWidth > 100 && parent.offsetHeight > 100) {
        return parent;
      }
    }
    parent = parent.parentElement;
    depth++;
  }

  // Fallback to parent
  return img.parentElement;
}

// Extract a descriptive title for the image to use as filename
function getPinTitle(img, container) {
  // 1. Try to get image alt text
  let title = img.getAttribute('alt') || img.alt || '';
  
  // 2. If it's a generic word, search container for heading elements
  const genericTerms = /^(image|pin|photo|picture|pinterest|avatar|profile|user)$/i;
  if (!title || genericTerms.test(title.trim())) {
    const textEl = container.querySelector('h1') || container.querySelector('h2') || container.querySelector('h3') || container.querySelector('[data-test-id="pin-title"]');
    if (textEl && textEl.textContent) {
      title = textEl.textContent;
    }
  }
  
  return title.trim();
}

// Add download button to a container
function injectDownloadButton(img) {
  if (!img || img.classList.contains('pinflow-processed-img')) return;
  img.classList.add('pinflow-processed-img');

  const container = findTargetContainer(img);
  if (!container || container.querySelector('.pinflow-download-btn')) return;

  // Ensure the container has relative position so absolute button aligns correctly
  const style = window.getComputedStyle(container);
  if (style.position === 'static') {
    container.style.position = 'relative';
  }
  container.classList.add('pinflow-card-wrapper');

  // Create button
  const btn = document.createElement('button');
  btn.className = 'pinflow-download-btn';
  btn.setAttribute('title', 'Download original quality');
  btn.innerHTML = downloadSVG;

  // Handle download click event
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent double clicking while downloading
    if (btn.classList.contains('downloading') || btn.classList.contains('success')) {
      return;
    }

    const currentSrc = img.src || img.getAttribute('src');
    if (!currentSrc) return;

    const pinTitle = getPinTitle(img, container);

    btn.classList.add('downloading');
    btn.innerHTML = spinnerSVG;

    // Send message to service worker with the image URL and extracted title
    chrome.runtime.sendMessage({ 
      action: 'downloadImage', 
      url: currentSrc,
      title: pinTitle 
    }, (response) => {
      btn.classList.remove('downloading');
      
      if (response && response.success) {
        btn.classList.add('success');
        btn.innerHTML = successSVG;

        // Reset button after 2.5 seconds
        setTimeout(() => {
          btn.classList.remove('success');
          btn.innerHTML = downloadSVG;
        }, 2500);
      } else {
        // Reset to default on error/cancellation
        btn.innerHTML = downloadSVG;
      }
    });
  });

  container.appendChild(btn);
}

// Scan the page for images and process them
function scanImages() {
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    const src = img.src || img.getAttribute('src');
    if (isPinImageUrl(src)) {
      // Only process images with reasonable dimensions to avoid tiny avatars
      if (img.offsetWidth > 100 || img.offsetHeight > 100 || (!img.offsetWidth && !img.offsetHeight)) {
        injectDownloadButton(img);
      }
    }
  });
}

// Set up MutationObserver to handle dynamically loaded content
const observer = new MutationObserver((mutations) => {
  let hasImageChanges = false;
  
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      // Check if image tags were added
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'IMG' || node.querySelector('img')) {
            hasImageChanges = true;
            break;
          }
        }
      }
    } else if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
      if (mutation.target.tagName === 'IMG') {
        hasImageChanges = true;
        break;
      }
    }
    if (hasImageChanges) break;
  }

  if (hasImageChanges) {
    scanImages();
  }
});

// Start observer
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['src']
});

// Run initial scan
scanImages();

// Run scan periodically as a fallback for dynamic virtualization updates
setInterval(scanImages, 1500);

// Initialize button visibility based on settings
chrome.storage.local.get({ enableButtons: true }, (settings) => {
  document.body.classList.toggle('pinflow-disabled', !settings.enableButtons);
});

// Listen for settings changes to show/hide buttons live
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enableButtons) {
    document.body.classList.toggle('pinflow-disabled', !changes.enableButtons.newValue);
  }
});
