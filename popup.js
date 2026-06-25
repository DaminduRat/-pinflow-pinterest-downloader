document.addEventListener('DOMContentLoaded', () => {
  const toggleEnable = document.getElementById('toggle-enable');
  const toggleSubfolder = document.getElementById('toggle-subfolder');
  const counterEl = document.getElementById('download-counter');

  // Load saved preferences and stats
  chrome.storage.local.get({
    downloadCount: 0,
    enableButtons: true,
    useSubfolder: true
  }, (settings) => {
    // Populate toggles
    toggleEnable.checked = settings.enableButtons;
    toggleSubfolder.checked = settings.useSubfolder;

    // Animate the counter
    animateCounter(settings.downloadCount);
  });

  // Handle Enable toggle change
  toggleEnable.addEventListener('change', () => {
    const isEnabled = toggleEnable.checked;
    chrome.storage.local.set({ enableButtons: isEnabled });
  });

  // Handle Subfolder toggle change
  toggleSubfolder.addEventListener('change', () => {
    const useSubfolder = toggleSubfolder.checked;
    chrome.storage.local.set({ useSubfolder: useSubfolder });
  });

  // Number count up animation with cubic ease-out
  function animateCounter(targetValue) {
    if (targetValue === 0) {
      counterEl.textContent = '0';
      return;
    }

    const duration = 750; // ms
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Cubic ease-out
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.floor(easeProgress * targetValue);

      counterEl.textContent = currentValue;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        counterEl.textContent = targetValue;
      }
    }

    requestAnimationFrame(update);
  }
});
