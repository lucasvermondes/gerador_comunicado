const canvas = document.getElementById('preview');
    const ctx = canvas.getContext('2d');

    const fields = {
      titulo: document.getElementById('titulo'),
      imagemSelect: document.getElementById('imagemSelect'),
      imagemCustom: document.getElementById('imagemCustom'),
      textoRich: document.getElementById('textoRich'),
      localidade: document.getElementById('localidade'),
      localidadeCustom: document.getElementById('localidadeCustom'),
      evento: document.getElementById('evento'),
      servicosAfetados: document.getElementById('servicosAfetados'),
      inicio: document.getElementById('inicio'),
      fim: document.getElementById('fim'),
      mudancaNumero: document.getElementById('mudancaNumero'),
      rfc: document.getElementById('rfc'),
      filenamePreview: document.getElementById('filenamePreview')
    };

    const customUploadWrap = document.getElementById('customUploadWrap');
    const customLocalidadeWrap = document.getElementById('customLocalidadeWrap');
    const btnDownload = document.getElementById('btnDownload');
    const btnReset = document.getElementById('btnReset');
    const btnParagraph = document.getElementById('btnParagraph');
    const btnClearFormatting = document.getElementById('btnClearFormatting');

    const imageCatalog = Array.isArray(window.COMUNICADO_IMAGES) ? window.COMUNICADO_IMAGES : [];
    let customImage = null;

    function populateImageSelect() {
      fields.imagemSelect.innerHTML = '';
      imageCatalog.forEach((img, index) => {
        const option = document.createElement('option');
        option.value = img.id;
        option.textContent = img.label;
        if (index === 0) option.selected = true;
        fields.imagemSelect.appendChild(option);
      });
      const uploadOption = document.createElement('option');
      uploadOption.value = '__upload__';
      uploadOption.textContent = 'Outro (upload de imagem)';
      fields.imagemSelect.appendChild(uploadOption);
    }

    function getImageSource() {
      if (fields.imagemSelect.value === '__upload__') return customImage;
      const selected = imageCatalog.find(img => img.id === fields.imagemSelect.value);
      return selected ? selected.src : null;
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        if (!src) return reject(new Error('Imagem não definida.'));
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Falha ao carregar imagem: ' + src));
        img.src = src;
      });
    }

    function getTodayParts() {
      const now = new Date();
      const yyyy = now.getFullYear();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      return { yyyy, mm, dd };
    }

    function sanitizePart(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function buildFileName(displayMode = false) {
      const { yyyy, mm, dd } = getTodayParts();
      const titulo = sanitizePart(fields.titulo.value || 'Sem título');
      const rfc = sanitizePart(fields.rfc.value || 'RFC');
      const datePart = displayMode ? `${yyyy}/${mm}/${dd}` : `${yyyy}-${mm}-${dd}`;
      return `${datePart} - ${rfc} - ${titulo}`;
    }

    function updateFilenamePreview() {
      fields.filenamePreview.textContent = buildFileName(true) + '.png';
    }

    function getLocalidadeValue() {
      if (fields.localidade.value === '__custom__') return fields.localidadeCustom.value.trim();
      return fields.localidade.value.trim();
    }

    // --- FUNÇÕES DE SEGURANÇA PARA TEXTO EM MOBILE ---
    // Transforma espaços puros em Non-Breaking Spaces (\u00A0). 
    // Isso impede que navegadores Webkit (iOS/Safari) engulam larguras de espaço.
    function applySafeSpacing(text) {
      return String(text).replace(/ /g, '\u00A0');
    }

    function measureTextSafe(text) {
      if (!text) return 0;
      return ctx.measureText(applySafeSpacing(text)).width;
    }
    // --------------------------------------------------

    function parseRichLines(editor) {
      function parseNode(node, inherited = { bold: false, italic: false, underline: false }) {
        const parts = [];
        if (node.nodeType === Node.TEXT_NODE) {
          // Limpa caracteres invisíveis soltos que teclados mobile costumam gerar
          const text = node.textContent.replace(/\u00a0/g, ' ').replace(/\u200b/g, '').replace(/\n/g, ' ');
          if (text) parts.push({ text, ...inherited });
          return parts;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return parts;
        const tag = node.tagName.toLowerCase();
        const style = {
          bold: inherited.bold || tag === 'b' || tag === 'strong',
          italic: inherited.italic || tag === 'i' || tag === 'em',
          underline: inherited.underline || tag === 'u'
        };
        if (tag === 'br') {
          parts.push({ lineBreak: true });
          return parts;
        }
        for (const child of node.childNodes) parts.push(...parseNode(child, style));
        if (['div', 'p'].includes(tag)) parts.push({ lineBreak: true });
        return parts;
      }
      const raw = [];
      for (const child of editor.childNodes) raw.push(...parseNode(child));
      const lines = [];
      let current = [];
      raw.forEach(part => {
        if (part.lineBreak) {
          lines.push(current);
          current = [];
        } else {
          current.push(part);
        }
      });
      if (current.length || !lines.length) lines.push(current);
      return lines.filter((line, idx, arr) => idx < arr.length - 1 || line.length || arr.length === 1);
    }

    function getWordsFromSegment(segment) {
      return segment.text.split(/(\s+)/).filter(token => token.length > 0).map(token => ({
        text: token,
        bold: segment.bold,
        italic: segment.italic,
        underline: segment.underline
      }));
    }

    function setFont(size, style = {}) {
      const fontParts = [];
      if (style.italic) fontParts.push('italic');
      fontParts.push(style.bold ? '700' : '400');
      fontParts.push(`${size}px`);
      fontParts.push('Calibri, Arial, Helvetica, sans-serif');
      ctx.font = fontParts.join(' ');
      ctx.fillStyle = '#111';
    }

    function wrapRichLines(lines, maxWidth, fontSize) {
      const wrapped = [];
      lines.forEach(lineSegments => {
        const words = lineSegments.flatMap(getWordsFromSegment);
        if (!words.length) { wrapped.push([]); return; }
        let currentLine = [];
        let lineWidth = 0;
        words.forEach(word => {
          setFont(fontSize, word);
          const width = measureTextSafe(word.text);
          if (lineWidth + width > maxWidth && currentLine.length && !/^\s+$/.test(word.text)) {
            wrapped.push(currentLine);
            currentLine = [];
            lineWidth = 0;
          }
          currentLine.push({ ...word, width });
          lineWidth += width;
        });
        wrapped.push(currentLine);
      });
      return wrapped;
    }

    function estimateRichHeight(fontSize, maxWidth) {
      const lines = parseRichLines(fields.textoRich);
      const wrapped = wrapRichLines(lines, maxWidth, fontSize);
      const lineHeight = Math.round(fontSize * 1.34);
      let height = 0;
      wrapped.forEach(line => { height += line.length ? lineHeight : Math.round(fontSize * 0.55); });
      return { wrapped, height, lineHeight };
    }

    function wrapPlainText(text, maxWidth, font) {
      ctx.font = font;
      const words = String(text || '').split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      const lines = [];
      let line = '';
      words.forEach(word => {
        const test = line ? `${line} ${word}` : word;
        if (measureTextSafe(test) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      if (line) lines.push(line);
      return lines;
    }

    function getInfoItems() {
      const items = [];
      const localidade = getLocalidadeValue();
      const evento = fields.evento.value.trim();
      const servicosAfetados = fields.servicosAfetados.value.trim();
      const inicio = fields.inicio.value.trim();
      const fim = fields.fim.value.trim();
      const mudancaNumero = fields.mudancaNumero.value.trim();
      if (localidade) items.push({ label: 'Localidade:', value: localidade });
      if (evento) items.push({ label: 'Evento:', value: evento });
      if (servicosAfetados) items.push({ label: 'Serviços afetados:', value: servicosAfetados });
      if (inicio) items.push({ label: 'Início:', value: inicio });
      if (fim) items.push({ label: 'Fim:', value: fim });
      if (mudancaNumero) items.push({ label: 'Mudança número:', value: mudancaNumero });
      return items;
    }

    function estimateInfoHeight(maxWidth, fontSize) {
      const lineHeight = Math.round(fontSize * 1.34);
      const gapAfterItem = 10;
      let total = 0;
      const items = getInfoItems();
      items.forEach(item => {
        ctx.font = `700 ${fontSize}px Calibri, Arial, sans-serif`;
        const labelWidth = measureTextSafe(item.label + ' ');
        const limitWidth = Math.max(10, maxWidth - labelWidth);
        const lines = wrapPlainText(item.value, limitWidth, `${fontSize}px Calibri, Arial, sans-serif`);
        total += Math.max(1, lines.length) * lineHeight + gapAfterItem;
      });
      return { items, height: total, lineHeight, gapAfterItem };
    }

    function chooseLayout() {
      let fontSize = 17;
      let chosen = null;
      while (fontSize >= 11) {
        const rich = estimateRichHeight(fontSize, 430);
        const info = estimateInfoHeight(430, fontSize);
        const startY = 250;
        const infoStartY = startY + rich.height + 18;
        const footerY = Math.max(620, infoStartY + info.height + 24);
        const canvasHeight = footerY + 46;
        if (canvasHeight <= 940 || fontSize === 11) {
          chosen = { fontSize, rich, info, startY, infoStartY, footerY, canvasHeight };
          break;
        }
        fontSize -= 1;
      }
      return chosen;
    }

    // --- FUNÇÃO COM FONTE FIXA, 3 LINHAS E CENTRALIZAÇÃO VERTICAL CORRIGIDA ---
function drawWrappedHeader(text, xStart, headerHeight, maxWidth) {
  const MAX_FONT = 16;
  const MIN_FONT = 11;
  const MAX_LINES = 3;

  let chosen = null;

  for (let fontSize = MAX_FONT; fontSize >= MIN_FONT; fontSize--) {
    const lineHeight = Math.round(fontSize * 1.28);
    ctx.font = `700 ${fontSize}px Calibri, Arial, sans-serif`;

    let lines = [];
    const paragraphs = String(text || '').split('\n');

    for (let p of paragraphs) {
      const words = p.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
        continue;
      }

      let currentLine = '';
      for (let word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (measureTextSafe(testLine) > maxWidth) {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            lines.push(word);
            currentLine = '';
          }
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }

    if (lines.length <= MAX_LINES) {
      chosen = { lines, fontSize, lineHeight };
      break;
    }
  }

  // Fallback extremo: força 3 linhas com reticências
  if (!chosen) {
    const fontSize = MIN_FONT;
    const lineHeight = Math.round(fontSize * 1.28);
    ctx.font = `700 ${fontSize}px Calibri, Arial, sans-serif`;

    let lines = [];
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let currentLine = '';

    for (let word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (measureTextSafe(testLine) > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
        if (lines.length === MAX_LINES) break;
      } else {
        currentLine = testLine;
      }
    }
    if (lines.length < MAX_LINES && currentLine) {
      lines.push(currentLine);
    }

    if (lines.length === MAX_LINES) {
      lines[MAX_LINES - 1] =
        lines[MAX_LINES - 1].replace(/\s+\S*$/, '') + '...';
    }

    chosen = { lines, fontSize, lineHeight };
  }

  const { lines, fontSize, lineHeight } = chosen;

  // ---- Centralização vertical perfeita ----
  const totalTextHeight = lines.length * lineHeight;
  let currentY =
    (headerHeight - totalTextHeight) / 2 + lineHeight / 2;

  const centerX = xStart + maxWidth / 2;

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fontSize}px Calibri, Arial, sans-serif`;

  lines.forEach(line => {
    if (line) {
      ctx.fillText(applySafeSpacing(line), centerX, currentY, maxWidth);
    }
    currentY += lineHeight;
  });
}

    function drawRichText(wrappedLines, x, y, lineHeight, fontSize) {
      let currentY = y;
      wrappedLines.forEach(line => {
        let currentX = x;
        if (!line.length) { currentY += Math.round(fontSize * 0.55); return; }

        let runs = [];
        let currentRun = null;

        line.forEach(part => {
          if (!currentRun) {
            currentRun = { ...part };
          } else if (currentRun.bold === part.bold && currentRun.italic === part.italic && currentRun.underline === part.underline) {
            currentRun.text += part.text;
          } else {
            runs.push(currentRun);
            currentRun = { ...part };
          }
        });
        if (currentRun) runs.push(currentRun);

        runs.forEach(run => {
          setFont(fontSize, run);

          const runWidth = measureTextSafe(run.text);
          ctx.fillText(applySafeSpacing(run.text), currentX, currentY);

          if (run.underline && run.text.trim()) {
            const underlineY = currentY + Math.max(2, Math.round(fontSize * 0.10));
            ctx.beginPath();
            ctx.lineWidth = Math.max(1, Math.round(fontSize * 0.06));
            ctx.strokeStyle = '#111';
            ctx.moveTo(currentX, underlineY);
            ctx.lineTo(currentX + runWidth, underlineY);
            ctx.stroke();
          }
          currentX += runWidth;
        });
        currentY += lineHeight;
      });
      return currentY;
    }

    function drawInfoItems(items, x, y, maxWidth, fontSize, lineHeight, gapAfterItem) {
  let currentY = y;

  items.forEach(item => {
    ctx.fillStyle = '#111';

    // --- Rótulo ---
    ctx.font = `700 ${fontSize}px Calibri, Arial, sans-serif`;
    const labelText = item.label + ' ';
    const labelWidth = measureTextSafe(labelText);
    ctx.fillText(applySafeSpacing(labelText), x, currentY);

    // --- Valor ---
    ctx.font = `400 ${fontSize}px Calibri, Arial, sans-serif`;
    const valueLines = wrapPlainText(
      item.value,
      maxWidth - labelWidth,
      ctx.font
    );

    // Primeira linha → na frente do rótulo
    if (valueLines.length) {
      ctx.fillText(
        applySafeSpacing(valueLines[0]),
        x + labelWidth,
        currentY
      );
    }

    // Demais linhas → abaixo, alinhadas à esquerda
    for (let i = 1; i < valueLines.length; i++) {
      currentY += lineHeight;
      ctx.fillText(
        applySafeSpacing(valueLines[i]),
        x,
        currentY
      );
    }

    currentY += lineHeight + gapAfterItem;
  });

  return currentY;
}

    async function render() {
      updateFilenamePreview();
      const layout = chooseLayout();
      canvas.width = 500;
      canvas.height = Math.ceil(layout.canvasHeight);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ececec';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#300382';
      ctx.fillRect(0, 0, canvas.width, 62);

      try {
        const logo = await loadImage('./assets/header.svg');
        ctx.drawImage(logo, 0, 0, 215, 62);
      } catch (e) {
        // Fallback
      }

      drawWrappedHeader(fields.titulo.value, 230, 62, 250);

      const imgBox = { x: 138, y: 76, w: 230, h: 150 };

      const src = getImageSource();
      if (src) {
        try {
          const img = await loadImage(src);

          const imgRatio = img.width / img.height;
          const boxRatio = imgBox.w / imgBox.h;

          let drawW, drawH;

          if (imgRatio > boxRatio) {
            drawW = imgBox.w;
            drawH = imgBox.w / imgRatio;
          } else {
            drawH = imgBox.h;
            drawW = imgBox.h * imgRatio;
          }

          const drawX = imgBox.x + (imgBox.w - drawW) / 2;
          const drawY = imgBox.y + (imgBox.h - drawH) / 2;

          ctx.drawImage(img, drawX, drawY, drawW, drawH);

        } catch (err) {
          ctx.fillStyle = '#f3f3f3';
          ctx.fillRect(imgBox.x, imgBox.y, imgBox.w, imgBox.h);
          ctx.strokeStyle = '#b5b5b5';
          ctx.strokeRect(imgBox.x, imgBox.y, imgBox.w, imgBox.h);
          ctx.fillStyle = '#666';
          ctx.font = '400 14px Calibri, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Imagem não encontrada', imgBox.x + imgBox.w / 2, imgBox.y + 72);
        }
      }

      // ======= A CORREÇÃO ESTÁ AQUI =======
      // Força o alinhamento à esquerda antes de desenhar os textos!
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      // ====================================

      drawRichText(layout.rich.wrapped, 36, layout.startY, layout.rich.lineHeight, layout.fontSize);
      drawInfoItems(layout.info.items, 36, layout.infoStartY, 430, layout.fontSize, layout.info.lineHeight, layout.info.gapAfterItem);

      const footerY = Math.ceil(layout.footerY);
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.font = '400 12px Calibri, Arial, sans-serif';
      ctx.fillText(applySafeSpacing('Para suporte, ligue para 2222 ou 0800 042 1195 ou envie um e-mail para'), 250, footerY);
      ctx.fillStyle = '#4A22A9';
      ctx.font = '400 16px Calibri, Arial, sans-serif';
      ctx.fillText(applySafeSpacing('helpdesk-sa@vallourec.com'), 250, footerY + 20);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#4A22A9';
      ctx.fillRect(16, footerY + 28, 468, 8);
    }

    async function downloadPng() {
      await render();
      const link = document.createElement('a');
      link.download = buildFileName(false) + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    function toggleLocalidadeCustom() {
      customLocalidadeWrap.classList.toggle('hidden', fields.localidade.value !== '__custom__');
    }

    function toggleImageUpload() {
      customUploadWrap.classList.toggle('hidden', fields.imagemSelect.value !== '__upload__');
    }

    function resetDefaults() {
      fields.titulo.value = '';
      if (imageCatalog.length) fields.imagemSelect.value = imageCatalog[0].id;
      fields.imagemCustom.value = '';
      customImage = null;
      fields.textoRich.innerHTML = '';
      fields.localidade.value = '';
      fields.localidadeCustom.value = '';
      fields.evento.value = '';
      fields.servicosAfetados.value = '';
      fields.inicio.value = '';
      fields.fim.value = '';
      fields.mudancaNumero.value = '';
      fields.rfc.value = '';
      toggleLocalidadeCustom();
      toggleImageUpload();
      render();
    }

    document.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.addEventListener('click', () => {
        fields.textoRich.focus();
        document.execCommand(btn.dataset.cmd, false, null);
        render();
      });
    });
    btnParagraph.addEventListener('click', () => {
      fields.textoRich.focus();
      document.execCommand('insertHTML', false, '<div><br></div>');
      render();
    });
    btnClearFormatting.addEventListener('click', () => {
      fields.textoRich.focus();
      document.execCommand('removeFormat', false, null);
      render();
    });

    [fields.titulo, fields.evento, fields.servicosAfetados, fields.inicio, fields.fim, fields.mudancaNumero, fields.rfc, fields.localidadeCustom].forEach(el => {
      el.addEventListener('input', render);
      el.addEventListener('change', render);
    });

    fields.textoRich.addEventListener('input', render);
    fields.textoRich.addEventListener('keyup', render);
    fields.textoRich.addEventListener('paste', () => setTimeout(render, 0));

    fields.localidade.addEventListener('change', () => {
      toggleLocalidadeCustom();
      render();
    });
    fields.imagemSelect.addEventListener('change', () => {
      toggleImageUpload();
      render();
    });
    fields.imagemCustom.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        customImage = null;
        render();
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        customImage = evt.target.result;
        render();
      };
      reader.readAsDataURL(file);
    });

    btnDownload.addEventListener('click', downloadPng);
    btnReset.addEventListener('click', resetDefaults);

    populateImageSelect();
    toggleLocalidadeCustom();
    toggleImageUpload();
    render();

    // Desabilita o clique com o botão direito no site todo
    document.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
const LOGIN_ANSWER = 'sa - service desk';

const loginOverlay = document.getElementById('loginOverlay');
const btnLogin = document.getElementById('btnLogin');
const loginIdInput = document.getElementById('loginId');
const loginAnswerInput = document.getElementById('loginAnswer');
const loginError = document.getElementById('loginError');

// Mostra usuário conectado
function showUser(id) {
  const badge = document.querySelector('.badge');
  if (badge) {
    badge.textContent += ` • Usuário: ${id}`;
  }
}

// Verifica se já está autenticado
function checkLogin() {
  const savedId = sessionStorage.getItem('tcs_user');
  if (savedId) {
    loginOverlay.style.display = 'none';
    showUser(savedId);
  }
}

btnLogin.addEventListener('click', () => {
  const id = loginIdInput.value.trim();
  const answer = loginAnswerInput.value.trim().toLowerCase();

  if (!/^\d+$/.test(id)) {
    loginError.textContent = 'ID TCS deve conter apenas números.';
    return;
  }

  if (answer !== LOGIN_ANSWER) {
    loginError.textContent = 'Resposta incorreta.';
    return;
  }

  sessionStorage.setItem('tcs_user', id);
  loginOverlay.style.display = 'none';
  showUser(id);
});

checkLogin();
``
