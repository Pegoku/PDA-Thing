if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

(function () {
  const form = document.getElementById('add-form');
  const resultEl = document.getElementById('result');
  const codeEl = document.getElementById('code');
  const qttyEl = document.getElementById('qtty');
  const modeLabel = document.getElementById('mode-label');
  const saveBtn = document.getElementById('save-btn');
  const sendAllBtn = document.getElementById('send-all-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const bufferWrapper = document.querySelector('.buffer-table-wrapper');
  const bufferTbody = document.getElementById('buffer-tbody');
  const fullscreenBanner = document.getElementById('fullscreen-banner');
  const fullscreenBtn = document.getElementById('enter-fullscreen-btn');
  const popupEl = document.getElementById('popup-message');
  const rootStyle = document.documentElement.style;

  const MAX_CODE_LENGTH = 6;
  const buffer = [];
  let editingIndex = null;
  let isSending = false;
  let shouldScrollToBottom = false;
  let fullscreenAttempted = false;
  let popupTimer = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return char;
      }
    });
  }

  form.onsubmit = function (e) {
    e.preventDefault();
    qttyEl.blur();
  };

  function normalizeCodeValue(value) {
    const sanitized = String(value || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!sanitized) return '';
    return sanitized.slice(-MAX_CODE_LENGTH);
  }

  function syncCodeField(value) {
    const normalized = normalizeCodeValue(value);
    if (codeEl.value !== normalized) {
      codeEl.value = normalized;
    }
    return normalized;
  }

  function updateViewportMetrics() {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    if (height) {
      rootStyle.setProperty('--app-height', `${Math.round(height)}px`);
    }

    let offset = 0;
    if (viewport) {
      const baseHeight = window.innerHeight || height;
      offset = Math.max(0, Math.round(baseHeight - viewport.height));
    }

    rootStyle.setProperty('--keyboard-offset', `${offset}px`);

  }

  function setupViewportListeners() {
    updateViewportMetrics();
    window.addEventListener('resize', updateViewportMetrics);
    window.addEventListener('orientationchange', updateViewportMetrics);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportMetrics);
      window.visualViewport.addEventListener('scroll', updateViewportMetrics);
    }
  }

  function isStandaloneDisplay() {
    return (
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    );
  }

  function fullscreenSupported() {
    return (
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.msFullscreenEnabled ||
      false
    );
  }

  function hideFullscreenBanner() {
    if (fullscreenBanner) {
      fullscreenBanner.classList.add('hidden');
    }
  }

  function showFullscreenBanner() {
    if (fullscreenBanner && fullscreenSupported() && !isStandaloneDisplay()) {
      fullscreenBanner.classList.remove('hidden');
    }
  }

  async function requestFullscreen() {
    if (!fullscreenSupported()) {
      hideFullscreenBanner();
      return false;
    }
    if (document.fullscreenElement) {
      hideFullscreenBanner();
      return true;
    }

    const element = document.documentElement;
    const request =
      element.requestFullscreen ||
      element.webkitRequestFullscreen ||
      element.msRequestFullscreen;

    if (!request) {
      showFullscreenBanner();
      return false;
    }

    try {
      const maybePromise = request.call(element, { navigationUI: 'hide' });
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise;
      }
      hideFullscreenBanner();
      return true;
    } catch (err) {
      try {
        const retry = request.call(element);
        if (retry && typeof retry.then === 'function') {
          await retry;
        }
        hideFullscreenBanner();
        return true;
      } catch (errFallback) {
        console.warn('Fullscreen request failed', errFallback);
        showFullscreenBanner();
        return false;
      }
    }
  }

  function initFullscreen() {
    if (!fullscreenSupported() || isStandaloneDisplay()) {
      hideFullscreenBanner();
      return;
    }

    const tryAutoFullscreen = async () => {
      document.removeEventListener('pointerup', tryAutoFullscreen, true);
      fullscreenAttempted = true;
      const success = await requestFullscreen();
      if (!success) {
        showFullscreenBanner();
      }
    };

    document.addEventListener('pointerup', tryAutoFullscreen, true);

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', async () => {
        fullscreenAttempted = true;
        await requestFullscreen();
      });
    }

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        hideFullscreenBanner();
      } else if (fullscreenSupported() && !isStandaloneDisplay()) {
        showFullscreenBanner();
      }
    });

    setTimeout(() => {
      if (!document.fullscreenElement && !fullscreenAttempted) {
        showFullscreenBanner();
      }
    }, 1200);
  }


  function toQuery(params) {
    return Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }

  async function addItem(code, qtty, date) {
    const query = toQuery({ code: normalizeCodeValue(code), qtty: String(qtty).trim(), date: String(date).trim() });
    const url = `/addItem?${query}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      throw new Error(text || 'Request failed');
    }
    return res.json();
  }

  function setMode(mode) {
    modeLabel.textContent = mode === 'Editing' ? 'Editando' : 'Añadiendo';
    saveBtn.textContent = mode === 'Editing' ? 'Guardar' : 'Agregar';
  }

  function focusCodeField(selectAll) {
    if (codeEl.disabled) return;
    codeEl.focus();
    if (typeof codeEl.setSelectionRange === 'function') {
      const end = codeEl.value.length;
      const start = selectAll ? 0 : end;
      codeEl.setSelectionRange(start, end);
    }
  }

  function resetForm() {
    form.reset();
    qttyEl.value = qttyEl.value || '1';
    syncCodeField(codeEl.value);
    focusCodeField(false);
  }

  function exitEditMode() {
    editingIndex = null;
    setMode('Adding');
  }

  function setActionButtonsState() {
    const empty = buffer.length === 0;
    sendAllBtn.disabled = empty || isSending;
    clearAllBtn.disabled = empty || isSending;
    saveBtn.disabled = isSending;
    // codeEl.disabled = isSending;
    qttyEl.disabled = isSending;
  }

  function renderBuffer() {
    if (!buffer.length) {
      bufferTbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="3">Sin artículos</td>
        </tr>`;
    } else {
      bufferTbody.innerHTML = buffer
        .map(
          (item, idx) => `
            <tr data-index="${idx}">
              <td>${escapeHtml(item.code)}</td>
              <td>${item.qtty}</td>
              <td class="actions-col">
                <button type="button" data-action="edit" data-index="${idx}">Editar</button>
              </td>
            </tr>`
        )
        .join('');
    }
    setActionButtonsState();
    if (shouldScrollToBottom && bufferWrapper) {
      shouldScrollToBottom = false;
      requestAnimationFrame(() => {
        bufferWrapper.scrollTop = bufferWrapper.scrollHeight;
      });
    } else {
      shouldScrollToBottom = false;
    }
  }

  function hidePopup() {
    if (!popupEl) return;
    popupEl.classList.remove('visible');
    popupTimer = null;
    setTimeout(() => {
      if (!popupEl.classList.contains('visible')) {
        popupEl.classList.add('hidden');
      }
    }, 250);
  }

  function showPopup(message) {
    if (!popupEl || !message) return;
    popupEl.innerHTML = `<span>${escapeHtml(message)}</span>`;
    popupEl.classList.remove('hidden');
    popupEl.classList.add('visible');
    clearTimeout(popupTimer);
    popupTimer = window.setTimeout(() => {
      hidePopup();
    }, 3000);
  }

  function setResult(success, message) {
    if (!resultEl) {
      if (message) {
        const logger = success ? console.log : console.warn;
        logger(message);
      }
      return;
    }

    if (!message) {
      resultEl.textContent = '';
      resultEl.className = '';
      return;
    }

    resultEl.innerHTML = `<span class="${success ? 'ok' : 'err'}">${escapeHtml(message)}</span>`;
  }

  function enterEditMode(index) {
    const target = buffer[index];
    if (!target) return;
    editingIndex = index;
    setMode('Editing');
    codeEl.value = target.code;
    qttyEl.value = target.qtty;
    syncCodeField(codeEl.value);
    focusCodeField(true);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = syncCodeField(codeEl.value);
    const qtty = Number(qttyEl.value);

    if (!code) {
      codeEl.focus();
      return;
    }

    if (!Number.isFinite(qtty) || qtty <= 0) {
      qttyEl.focus();
      return;
    }

    if (editingIndex !== null) {
      buffer[editingIndex] = { code, qtty };
      // setResult(true, `Updated item ${code}|${qtty}`);
      exitEditMode();
    } else {
      buffer.push({ code, qtty });
      shouldScrollToBottom = true;
      // setResult(true, `Buffered ${code}|${qtty}`);
    }

    renderBuffer();
    resetForm();
  });

  bufferTbody.addEventListener('click', (event) => {
    const editButton = event.target.closest('button[data-action="edit"]');
    if (editButton) {
      const index = Number(editButton.dataset.index);
      enterEditMode(index);
      return;
    }

    const row = event.target.closest('tr[data-index]');
    if (row) {
      const index = Number(row.dataset.index);
      enterEditMode(index);
    }
  });

  codeEl.addEventListener('input', () => {
    if (codeEl.disabled) return;
    syncCodeField(codeEl.value);
  });

  function shouldCaptureGlobalInput() {
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return true;
    if (active === codeEl || active === qttyEl) return false;
    if (active.isContentEditable) return false;
    const tagName = active.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return false;
    return true;
  }

  document.addEventListener(
    'keydown',
    (event) => {
      if (isSending) return;
      if (!shouldCaptureGlobalInput()) return;

      if (event.key === 'Backspace') {
        if (codeEl.value) {
          codeEl.value = codeEl.value.slice(0, -1);
          syncCodeField(codeEl.value);
        }
        focusCodeField(false);
        event.preventDefault();
        return;
      }

      if (event.key === 'Enter') {
        if (codeEl.value && !event.repeat) {
          form.requestSubmit();
          event.preventDefault();
        }
        return;
      }

      if (
        event.key &&
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const nextValue = codeEl.value + event.key;
        syncCodeField(nextValue);
        focusCodeField(false);
        event.preventDefault();
      }
    },
    true
  );

  sendAllBtn.addEventListener('click', async () => {
    if (!buffer.length || isSending) {
      return;
    }

    isSending = true;
    setActionButtonsState();
    setResult(true, `Enviando ${buffer.length} artículo${buffer.length === 1 ? '' : 's'}...`);

    try {
      // Wait for server time before sending. currentDate will be a Number or null.
      const currentDate = await fetch('/getTime', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error('No se pudo obtener la hora del servidor');
          }
          return res.json();
        })
        .then((data) => {
          if (data && data.ok && Number.isFinite(data.serverTime)) {
            return Number(data.serverTime);
          }
          throw new Error('Respuesta inválida al obtener la hora del servidor');
        })
        .catch((err) => {
          console.warn('Error fetching server time, using local time', err);
          showPopup('No se pudo sincronizar con el servidor, pruebe mas tarde.');
          return null;
        });

      for (let i = 0; i < buffer.length; i += 1) {
        const entry = buffer[i];
        await addItem(entry.code, entry.qtty, currentDate);
      }
      const sentCount = buffer.length;
      buffer.length = 0;
      renderBuffer();
      exitEditMode();
      resetForm();
      const successMessage = `Se enviaron ${sentCount} artículo${sentCount === 1 ? '' : 's'}`;
      setResult(true, successMessage);
      showPopup(successMessage);
    } catch (err) {
      let message = String(err && err.message ? err.message : 'Error al enviar');
      try {
        const parsed = JSON.parse(message);
        if (parsed && parsed.error) {
          message = parsed.error;
        }
      } catch (_) {
        // ignore JSON parse error, keep the original message
      }
      setResult(false, `Error al enviar: ${message}`);
    } finally {
      isSending = false;
      renderBuffer();
      resetForm();
    }
  });

  clearAllBtn.addEventListener('click', () => {
    if (!buffer.length || isSending) {
      setResult(false, 'La lista ya está vacía');
      return;
    }
    buffer.length = 0;
    renderBuffer();
    exitEditMode();
    resetForm();
    const message = 'Se vació la lista de artículos';
    setResult(true, message);
    showPopup(message);
  });

  setupViewportListeners();
  renderBuffer();
  resetForm();
  initFullscreen();
})();
