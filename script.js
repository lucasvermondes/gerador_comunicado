document.addEventListener('DOMContentLoaded', () => {
  /* ==========================
     IDIOMA (PT / EN)
  ========================== */
  let currentLang = sessionStorage.getItem('lang') || 'pt';

  const i18n = {
    pt: {
      evento: 'Evento:',
      servicos: 'Serviços afetados:',
      localidade: 'Localidade:',
      inicio: 'Início:',
      fim: 'Fim:',
      mudanca: 'Mudança número:',
      suporte: 'Para suporte, ligue para 2222 ou 0800 042 1195 ou envie um e-mail para',
    },
    en: {
      evento: 'Event:',
      servicos: 'Affected services:',
      localidade: 'Location:',
      inicio: 'Start:',
      fim: 'End:',
      mudanca: 'Change number:',
      suporte: 'For support, call 2222 or 0800 042 1195 or send an email to',
    }
  };

  function t(key) {
    return (i18n[currentLang] && i18n[currentLang][key]) || key;
  }

  // Suporte a SELECT de idioma (se existir)
  const langSelect = document.getElementById('langSelect');
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', () => {
      currentLang = langSelect.value;
      sessionStorage.setItem('lang', currentLang);
      render();
    });
  }

  // Suporte a TOGGLE de idioma (se existir)
  const langToggle = document.getElementById('langToggle');
  if (langToggle) {
    langToggle.checked = currentLang === 'en';
    langToggle.addEventListener('change', () => {
      currentLang = langToggle.checked ? 'en' : 'pt';
      sessionStorage.setItem('lang', currentLang);
      render();
    });
  }

  /* ==========================
     REFS DE DOM
  ========================== */
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

  /* ==========================
     UTILIDADES
  ========================== */
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
    if (fields.filenamePreview) {
      fields.filenamePreview.textContent = buildFileName(true) + '.png';
    }
  }

  function getLocalidadeValue() {
    if (fields.localidade.value === '__custom__') return fields.localidadeCustom.value.trim();
    return fields.localidade.value.trim();
  }

  // Segurança de espaços no iOS/Safari
  function applySafeSpacing(text) {
    return String(text).replace(/ /g, '\u00A0');
  }

  function measureTextSafe(text) {
    if (!text) return 0;
    return ctx.measureText(applySafeSpacing(text)).width;
  }

  /* ==========================
     IMAGENS
  ========================== */
  function populateImageSelect() {
    if (!fields.imagemSelect) return;
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
    if (!fields.imagemSelect) return null;
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

  /* ==========================
     PARSER RICH TEXT (com listas e cor)
  ========================== */
  function parseRichLines(editor) {
    function parseNode(
      node,
      inherited = { bold: false, italic: false, underline: false, color: null, indentLevel: 0 }
    ) {
      const parts = [];

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent
          .replace(/\u00a0/g, ' ')
          .replace(/\u200b/g, '')
          .replace(/\n/g, ' ');
        if (text) parts.push({ text, ...inherited });
        return parts;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return parts;

      const el = /** @type {HTMLElement} */ (node);
      const tag = el.tagName.toLowerCase();

      // Herança de estilo
      const style = {
        bold: inherited.bold || tag === 'b' || tag === 'strong',
        italic: inherited.italic || tag === 'i' || tag === 'em',
        underline: inherited.underline || tag === 'u',
        color: inherited.color,
        indentLevel: inherited.indentLevel || 0
      };

      // Cor via style inline ou <font color="">
      // (execCommand('foreColor') costuma gerar <font color="..."> ou <span style="color:...">)
      if (el.style && el.style.color) {
        style.color = el.style.color;
      } else if (tag === 'font' && el.getAttribute('color')) {
        style.color = el.getAttribute('color');
      }

      // Listas: aumenta nível de indent dentro de UL/OL
      if (tag === 'ul' || tag === 'ol') {
        for (const child of el.childNodes) {
          parts.push(...parseNode(child, { ...style, indentLevel: (style.indentLevel || 0) + 1 }));
        }
        return parts;
      }

      // <li>: gera "• " + conteúdo + quebra de linha
      if (tag === 'li') {
        const level = style.indentLevel || 0;
        // Indent visual (NBSP) conforme nível (2 NBSP por nível)
        const indent = '\u00A0'.repeat(Math.max(0, level) * 2);
        if (indent) parts.push({ text: indent, ...style });

        // Bullet
        parts.push({ text: '• ', ...style });

        // Conteúdo do item
        for (const child of el.childNodes) {
          parts.push(...parseNode(child, style));
        }
        // Fim do item de lista = quebra de linha
        parts.push({ lineBreak: true });
        return parts;
      }

      if (tag === 'br') {
        parts.push({ lineBreak: true });
        return parts;
      }

      // Fluxo padrão
      for (const child of el.childNodes) parts.push(...parseNode(child, style));
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
    return segment.text
      .split(/(\s+)/)
      .filter(token => token.length > 0)
      .map(token => ({
        text: token,
        bold: segment.bold,
        italic: segment.italic,
        underline: segment.underline,
        color: segment.color || null
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

  /* ==========================
     ITENS DE INFORMAÇÃO
  ========================== */
  function getInfoItems() {
    const items = [];
    const localidade = getLocalidadeValue();
    const evento = fields.evento.value.trim();
    const servicosAfetados = fields.servicosAfetados.value.trim();
    const inicio = fields.inicio.value.trim();
    const fim = fields.fim.value.trim();
    const mudancaNumero = fields.mudancaNumero.value.trim();
    if (localidade) items.push({ label: t('localidade'), value: localidade });
    if (evento) items.push({ label: t('evento'), value: evento });
    if (servicosAfetados) items.push({ label: t('servicos'), value: servicosAfetados });
    if (inicio) items.push({ label: t('inicio'), value: inicio });
    if (fim) items.push({ label: t('fim'), value: fim });
    if (mudancaNumero) items.push({ label: t('mudanca'), value: mudancaNumero });
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

  /* ==========================
     LAYOUT & DESENHO
  ========================== */
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

  // Cabeçalho com ajuste automático de fonte e 3 linhas máx.
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
        lines[MAX_LINES - 1] = lines[MAX_LINES - 1].replace(/\s+\S*$/, '') + '...';
      }

      chosen = { lines, fontSize, lineHeight };
    }

    const { lines, fontSize, lineHeight } = chosen;

    const totalTextHeight = lines.length * lineHeight;
    let currentY = (headerHeight - totalTextHeight) / 2 + lineHeight / 2;
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

      // Agrupa runs com mesmo estilo
      let runs = [];
      let currentRun = null;

      line.forEach(part => {
        if (!currentRun) {
          currentRun = { ...part };
        } else if (
          currentRun.bold === part.bold &&
          currentRun.italic === part.italic &&
          currentRun.underline === part.underline &&
          (currentRun.color || null) === (part.color || null)
        ) {
          currentRun.text += part.text;
        } else {
          runs.push(currentRun);
          currentRun = { ...part };
        }
      });
      if (currentRun) runs.push(currentRun);

      runs.forEach(run => {
        setFont(fontSize, run);

        // Aplica cor do run (se houver)
        ctx.fillStyle = run.color || '#111';

        const runWidth = measureTextSafe(run.text);
        ctx.fillText(applySafeSpacing(run.text), currentX, currentY);

        if (run.underline && run.text.trim()) {
          const underlineY = currentY + Math.max(2, Math.round(fontSize * 0.10));
          ctx.beginPath();
          ctx.lineWidth = Math.max(1, Math.round(fontSize * 0.06));
          ctx.strokeStyle = run.color || '#111';
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

  // Ajuste solicitado: primeira linha na frente do rótulo; demais abaixo, alinhadas à esquerda
  function drawInfoItems(items, x, y, maxWidth, fontSize, lineHeight, gapAfterItem) {
    let currentY = y;

    items.forEach(item => {
      ctx.fillStyle = '#111';

      // Rótulo
      ctx.font = `700 ${fontSize}px Calibri, Arial, sans-serif`;
      const labelText = item.label + ' ';
      const labelWidth = measureTextSafe(labelText);
      ctx.fillText(applySafeSpacing(labelText), x, currentY);

      // Valor
      ctx.font = `400 ${fontSize}px Calibri, Arial, sans-serif`;
      const valueLines = wrapPlainText(item.value, Math.max(10, maxWidth - labelWidth), ctx.font);

      // Primeira linha na frente do rótulo
      if (valueLines.length) {
        ctx.fillText(applySafeSpacing(valueLines[0]), x + labelWidth, currentY);
      }

      // Demais linhas abaixo, alinhadas à esquerda (na coluna x)
      for (let i = 1; i < valueLines.length; i++) {
        currentY += lineHeight;
        ctx.fillText(applySafeSpacing(valueLines[i]), x, currentY);
      }

      currentY += lineHeight + gapAfterItem;
    });

    return currentY;
  }

  /* ==========================
     RENDER PRINCIPAL
  ========================== */
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
      // Sem logo, segue o baile
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

    // Textos à esquerda (para descrição e info)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    drawRichText(layout.rich.wrapped, 36, layout.startY, layout.rich.lineHeight, layout.fontSize);
    drawInfoItems(layout.info.items, 36, layout.infoStartY, 430, layout.fontSize, layout.info.lineHeight, layout.info.gapAfterItem);

    const footerY = Math.ceil(layout.footerY);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.font = '400 12px Calibri, Arial, sans-serif';
    ctx.fillText(applySafeSpacing(t('suporte')), 250, footerY);

    ctx.fillStyle = '#4A22A9';
    ctx.font = '400 16px Calibri, Arial, sans-serif';
    ctx.fillText(applySafeSpacing('helpdesk-sa@vallourec.com'), 250, footerY + 20);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4A22A9';
    ctx.fillRect(16, footerY + 28, 468, 8);
  }

  /* ==========================
     AÇÕES & EVENTOS
  ========================== */
  async function downloadPng() {
    await render();
    const link = document.createElement('a');
    link.download = buildFileName(false) + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function toggleLocalidadeCustom() {
    if (!customLocalidadeWrap) return;
    customLocalidadeWrap.classList.toggle('hidden', fields.localidade.value !== '__custom__');
  }

  function toggleImageUpload() {
    if (!customUploadWrap) return;
    customUploadWrap.classList.toggle('hidden', fields.imagemSelect.value !== '__upload__');
  }

  function resetDefaults() {
    fields.titulo.value = '';
    if (imageCatalog.length) fields.imagemSelect.value = imageCatalog[0].id;
    if (fields.imagemCustom) fields.imagemCustom.value = '';
    customImage = null;
    fields.textoRich.innerHTML = 'Prezados(as),<div><br></div>';
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

  // Toolbar de edição — B/I/U/Lista/Parágrafo/Remover formato
  document.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      fields.textoRich.focus();
      document.execCommand(btn.dataset.cmd, false, null);
      render();
      setTimeout(updateToolbarState, 0);
    });
  });

  if (btnParagraph) {
    btnParagraph.addEventListener('click', () => {
      fields.textoRich.focus();
      document.execCommand('insertHTML', false, '<div><br></div>');
      render();
      setTimeout(updateToolbarState, 0);
    });
  }

  if (btnClearFormatting) {
    btnClearFormatting.addEventListener('click', () => {
      fields.textoRich.focus();
      document.execCommand('removeFormat', false, null);
      render();
      setTimeout(updateToolbarState, 0);
    });
  }

  // ===== Cor do texto selecionado =====
  const colorPicker = document.getElementById('colorPicker');
  if (colorPicker) {
    colorPicker.addEventListener('input', () => {
      fields.textoRich.focus();
      document.execCommand('foreColor', false, colorPicker.value);
      render();
      updateToolbarState();
    });
  }

  // ===== Marca-texto (fundo do texto) =====
  const highlightPicker = document.getElementById('highlightPicker');
  if (highlightPicker) {
    highlightPicker.addEventListener('input', () => {
      fields.textoRich.focus();
      const color = highlightPicker.value;
      const ok = document.execCommand('hiliteColor', false, color);
      if (!ok) document.execCommand('backColor', false, color);
      render();
      updateToolbarState();
    });
  }

  // ===== Estado ativo dos botões (B/I/U/Lista) =====
  function updateToolbarState() {
    const map = [
      { cmd: 'bold', sel: '[data-cmd="bold"]' },
      { cmd: 'italic', sel: '[data-cmd="italic"]' },
      { cmd: 'underline', sel: '[data-cmd="underline"]' },
      { cmd: 'insertUnorderedList', sel: '[data-cmd="insertUnorderedList"]' },
    ];
    map.forEach(({ cmd, sel }) => {
      const btn = document.querySelector(sel);
      if (!btn) return;
      let is = false;
      try { is = document.queryCommandState(cmd); } catch {}
      btn.classList.toggle('is-active', !!is);
    });
  }

  // Recalcula ao mudar seleção dentro do editor
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === fields.textoRich) {
      updateToolbarState();
    }
  });

  // Gatilhos extras
  fields.textoRich.addEventListener('keyup', updateToolbarState);
  fields.textoRich.addEventListener('mouseup', updateToolbarState);

  [
    fields.titulo,
    fields.evento,
    fields.servicosAfetados,
    fields.inicio,
    fields.fim,
    fields.mudancaNumero,
    fields.rfc,
    fields.localidadeCustom
  ].forEach(el => {
    if (!el) return;
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

  if (fields.imagemCustom) {
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
  }

  if (btnDownload) btnDownload.addEventListener('click', downloadPng);
  if (btnReset) btnReset.addEventListener('click', resetDefaults);

  populateImageSelect();
  toggleLocalidadeCustom();
  toggleImageUpload();
  render();

  // Desabilita o clique com o botão direito no site todo
  document.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  });

  /* ==========================
     LOGIN POR SESSÃO (apenas ID)
  ========================== */
  const loginOverlay = document.getElementById('loginOverlay');
  const btnLogin = document.getElementById('btnLogin');
  const loginIdInput = document.getElementById('loginId');
  const loginError = document.getElementById('loginError');

  function showUser(id) {
    const badge = document.querySelector('.badge');
    if (badge) {
      const base = badge.textContent.replace(/\s+•\s+Usuário:.+$/, '');
      badge.textContent = `${base} • Usuário: ${id}`;
    }
  }

  function checkLogin() {
    const savedId = sessionStorage.getItem('tcs_user');
    if (savedId) {
      if (loginOverlay) loginOverlay.style.display = 'none';
      showUser(savedId);
    } else {
      if (loginOverlay) loginOverlay.style.display = 'flex';
    }
  }

  function tryLogin() {
    const id = (loginIdInput && loginIdInput.value || '').trim();

    if (!/^\d+$/.test(id)) {
      if (loginError) loginError.textContent = 'ID TCS deve conter apenas números.';
      return;
    }

    sessionStorage.setItem('tcs_user', id);
    if (loginOverlay) loginOverlay.style.display = 'none';
    showUser(id);
    if (loginError) loginError.textContent = '';
  }

  if (btnLogin) btnLogin.addEventListener('click', tryLogin);
  if (loginIdInput) {
    loginIdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryLogin();
    });
  }

  checkLogin();
});
