/* =========================================
   Bach Car — Lógica del catálogo
   (HTML + CSS + JavaScript vanilla)
   ========================================= */

const CONFIG = {
  // ID de tu Google Sheet de Bach Car
  SHEET_ID: '1gjS2UQK3kIl07KbO7c6Kz56oWzSrwk2-_vM4g-aOwos',

  // URL de exportación CSV (la hoja debe ser pública)
  get CSV_URL() {
    if (!this.SHEET_ID || this.SHEET_ID === 'TU_ID_DE_GOOGLE_SHEETS_AQUI') {
      return null;
    }
    return `https://docs.google.com/spreadsheets/d/${this.SHEET_ID}/export?format=csv&gid=0`;
  },

  // Número de WhatsApp con código de país (sin +)
  WHATSAPP: '5491112345678',
};

// URL de tu Google Apps Script (proxy de imágenes de Drive)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwxmLYkOx8q_kUrnLvSE1DDvwCEAfUhuKtmHHlixohdNjN6A_nUh9trWn7EoMCVvXRjvQ/exec';

/* =========================================
   Estado
   ========================================= */
let vehiculos = [];
let filtroActual = 'todos';
const cacheImagenes = new Map(); // Guarda data URLs ya descargadas para no repetir fetch

/* =========================================
   Elementos del DOM
   ========================================= */
const grid = document.getElementById('grid-vehiculos');
const contador = document.getElementById('contador');
const mensajeVacio = document.getElementById('mensaje-vacío');
const filtrosBtns = document.querySelectorAll('.filtro');
const modal = document.getElementById('modal-vehiculo');
const modalFondo = document.getElementById('modal-fondo');
const modalCerrar = document.getElementById('modal-cerrar');

/* =========================================
   Utilidades
   ========================================= */

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

/**
 * Parsea un texto CSV respetando comillas, comas dentro de campos
 * y saltos de línea dentro de comillas.
 */
function parsearCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  let i = 0;

  const agregarCampo = () => {
    fila.push(campo);
    campo = '';
  };
  const agregarFila = () => {
    agregarCampo();
    filas.push(fila);
    fila = [];
  };

  while (i < texto.length) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (i + 1 < texto.length && texto[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        entreComillas = false;
      } else {
        campo += c;
      }
      i++;
      continue;
    }

    if (c === '"') {
      entreComillas = true;
      i++;
      continue;
    }

    if (c === ',') {
      agregarCampo();
      i++;
      continue;
    }

    if (c === '\r') {
      i++;
      if (i < texto.length && texto[i] === '\n') i++;
      agregarFila();
      continue;
    }

    if (c === '\n') {
      agregarFila();
      i++;
      continue;
    }

    campo += c;
    i++;
  }

  if (campo || fila.length) {
    agregarCampo();
    agregarFila();
  }

  return filas;
}

/**
 * Convierte un enlace de Google Drive o un ID puro en la URL del proxy de Apps Script.
 * El proxy devuelve un data URL (base64) que el navegador puede mostrar.
 * Soporta:
 *   https://drive.google.com/file/d/ID/view
 *   https://drive.google.com/open?id=ID
 *   ID puro: 1eRMqQW09C8tdqRnbdyPcNTgcqYVsqmii
 *   URL directa (se devuelve igual)
 */
function convertirImagenDrive(url) {
  if (!url) return '';
  url = url.trim();
  if (!url) return '';

  // Si ya es una URL directa (no drive y no parece ID), la devolvemos igual
  if (!url.includes('drive.google.com')) {
    const esIdDrive = /^[a-zA-Z0-9_-]{25,}$/.test(url) && !url.includes(' ');
    if (esIdDrive) {
      return `${APPS_SCRIPT_URL}?id=${url}`;
    }
    return url;
  }

  let id = null;
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) {
    id = m1[1];
  } else {
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) id = m2[1];
  }

  if (!id) return url;

  return `${APPS_SCRIPT_URL}?id=${id}`;
}

/**
 * Carga una imagen de Drive a través del proxy de Apps Script y la devuelve
 * como data URL (base64). Usa caché para no descargar dos veces la misma imagen.
 */
async function cargarImagenDrive(urlProxy) {
  if (!urlProxy) return null;

  if (cacheImagenes.has(urlProxy)) {
    return cacheImagenes.get(urlProxy);
  }

  try {
    const respuesta = await fetch(urlProxy, { cache: 'no-cache' });
    if (!respuesta.ok) throw new Error('Error al cargar imagen');
    const texto = await respuesta.text();
    cacheImagenes.set(urlProxy, texto);
    return texto;
  } catch (error) {
    console.error('Error cargando imagen de Drive:', error);
    return null;
  }
}

/**
 * Normaliza el tipo de vehículo para los filtros y CSS.
 */
function normalizarTipo(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  if (t.includes('auto')) return 'auto';
  if (t.includes('moto')) return 'moto';
  if (t.includes('camioneta') || t.includes('pickup') || t.includes('pick-up')) return 'camioneta';
  return 'otro';
}

/* =========================================
   Carga de datos desde Google Sheets
   ========================================= */

async function cargarVehiculos() {
  mostrarContador('Cargando catálogo desde Google Sheets...');

  if (!CONFIG.CSV_URL) {
    mostrarError('Google Sheets no está configurado. Contacte al administrador.');
    return;
  }

  try {
    const respuesta = await fetch(CONFIG.CSV_URL, { cache: 'no-cache' });
    if (!respuesta.ok) throw new Error(`Error ${respuesta.status} al cargar la hoja`);

    const texto = await respuesta.text();
    const filas = parsearCSV(texto);

    if (filas.length < 2) {
      throw new Error('La hoja no tiene datos.');
    }

    const encabezados = filas[0].map((h) => String(h || '').trim().toLowerCase());

    const indice = (nombre) => encabezados.findIndex((h) => h === nombre);

    const iMarca = indice('marca');
    const iModelo = indice('modelo');
    const iTipo = indice('tipo');
    const iAnio = indice('año') >= 0 ? indice('año') : indice('anio');
    const iColor = indice('color');
    const iPrecio = indice('precio');
    const iImg1 = indice('imagen1') >= 0 ? indice('imagen1') : indice('foto1');
    const iImg2 = indice('imagen2') >= 0 ? indice('imagen2') : indice('foto2');
    const iImg3 = indice('imagen3') >= 0 ? indice('imagen3') : indice('foto3');
    const iDesc = indice('descripcion') >= 0 ? indice('descripcion') : indice('descripción');

    vehiculos = filas.slice(1).map((fila) => {
      const get = (idx) => (idx >= 0 && idx < fila.length ? String(fila[idx] || '').trim() : '');
      const tipoRaw = get(iTipo);
      return {
        marca: get(iMarca) || 'Sin marca',
        modelo: get(iModelo) || 'Sin modelo',
        tipo: normalizarTipo(tipoRaw),
        tipoRaw: tipoRaw || 'Otro',
        anio: get(iAnio) || '-',
        color: get(iColor) || '-',
        precio: get(iPrecio) || '-',
        imagen1: convertirImagenDrive(get(iImg1)),
        imagen2: convertirImagenDrive(get(iImg2)),
        imagen3: convertirImagenDrive(get(iImg3)),
        descripcion: get(iDesc) || '',
      };
    });

    vehiculos = vehiculos.filter((v) => v.marca !== 'Sin marca' || v.modelo !== 'Sin modelo');

    if (vehiculos.length === 0) {
      throw new Error('No se encontraron vehículos válidos en la hoja.');
    }

    renderizar();
  } catch (error) {
    console.error('Error cargando Google Sheets:', error);
    mostrarError('No se pudo cargar el catálogo. Contacte al administrador.');
  }
}

function mostrarError(mensaje) {
  mostrarContador('');
  if (grid) grid.style.display = 'none';
  if (mensajeVacio) {
    mensajeVacio.style.display = 'block';
    mensajeVacio.innerHTML = `<p style="color:#d32f2f; font-weight:600; padding:40px; text-align:center;">${mensaje}</p>`;
  }
}

/* =========================================
   Renderizado
   ========================================= */

function mostrarContador(texto) {
  if (contador) contador.textContent = texto;
}

function renderizar() {
  if (!grid) return;

  const filtrados =
    filtroActual === 'todos'
      ? vehiculos
      : vehiculos.filter((v) => v.tipo === filtroActual);

  grid.innerHTML = '';

  if (filtrados.length === 0) {
    grid.style.display = 'none';
    if (mensajeVacio) mensajeVacio.style.display = 'block';
    mostrarContador('0 vehículos encontrados');
    return;
  }

  grid.style.display = 'grid';
  if (mensajeVacio) mensajeVacio.style.display = 'none';
  mostrarContador(`${filtrados.length} vehículo${filtrados.length !== 1 ? 's' : ''}`);

  filtrados.forEach((v) => {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta';
    tarjeta.setAttribute('role', 'button');
    tarjeta.setAttribute('tabindex', '0');
    tarjeta.setAttribute('aria-label', `${v.marca} ${v.modelo} ${v.anio}`);

    // Armar array de imágenes disponibles
    const imgs = [v.imagen1, v.imagen2, v.imagen3].filter(Boolean);

    const esDrive1 = v.imagen1 && v.imagen1.includes('script.google.com');
    const imgPrincipal = esDrive1
      ? 'https://via.placeholder.com/400x250?text=Cargando...'
      : (v.imagen1 || 'https://via.placeholder.com/400x250?text=Sin+imagen');

    // Miniaturas para tarjeta (solo las que no sean la principal)
    const miniaturasHtml = imgs.slice(1).map((img, i) => {
      const esDrive = img.includes('script.google.com');
      const src = esDrive ? 'https://via.placeholder.com/60x60?text=...' : (img || '');
      return `<img src="${escapeHtml(src)}" data-src="${escapeHtml(img)}" class="thumb" data-index="${i + 1}" alt="${escapeHtml(v.modelo)} ${i + 2}" style="opacity:${esDrive ? '0.6' : '1'}" />`;
    }).join('');

    tarjeta.innerHTML = `
      <div class="tarjeta-img">
        <img src="${escapeHtml(imgPrincipal)}" alt="${escapeHtml(v.marca + ' ' + v.modelo)}" loading="lazy" data-src="${escapeHtml(v.imagen1 || '')}" onerror="this.src='https://via.placeholder.com/400x250?text=Sin+imagen'" />
        <span class="tarjeta-tipo">${escapeHtml(v.tipoRaw)}</span>
        ${imgs.length > 1 ? `<div class="tarjeta-galeria">${miniaturasHtml}</div>` : ''}
      </div>
      <div class="tarjeta-info">
        <h3 class="tarjeta-titulo">${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</h3>
        <div class="tarjeta-datos">
          <span>📅 ${escapeHtml(v.anio)}</span>
          <span>🎨 ${escapeHtml(v.color)}</span>
        </div>
        <div class="tarjeta-precio">${escapeHtml(v.precio)}</div>
        <div class="tarjeta-btns">
          <button class="btn btn-outline btn-ver" data-id="${escapeHtml(v.marca)}|${escapeHtml(v.modelo)}|${escapeHtml(v.anio)}">Ver detalle</button>
          <a href="https://wa.me/${CONFIG.WHATSAPP}?text=Hola Bach Car, me interesa el ${escapeHtml(v.marca + ' ' + v.modelo + ' (' + v.anio + ')')}" class="btn btn-primary" target="_blank">WhatsApp</a>
        </div>
      </div>
    `;

    const btnVer = tarjeta.querySelector('.btn-ver');
    btnVer.addEventListener('click', () => abrirModal(v));
    tarjeta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrirModal(v);
      }
    });

    grid.appendChild(tarjeta);

    // Cargar imagen principal si es Drive (usa caché)
    if (esDrive1 && v.imagen1) {
      const imgEl = tarjeta.querySelector('img:not(.thumb)');
      cargarImagenDrive(v.imagen1).then((dataUrl) => {
        if (dataUrl) imgEl.src = dataUrl;
      });
    }

    // Cargar miniaturas si son Drive (usa caché)
    imgs.slice(1).forEach((img, idx) => {
      if (img && img.includes('script.google.com')) {
        const thumbEl = tarjeta.querySelector(`.thumb[data-index="${idx + 2}"]`);
        if (thumbEl) {
          cargarImagenDrive(img).then((dataUrl) => {
            if (dataUrl) thumbEl.src = dataUrl;
          });
        }
      }
    });
  });
}

/* =========================================
   Modal de detalle
   ========================================= */

function abrirModal(v) {
  document.getElementById('modal-titulo').textContent = `${v.marca} ${v.modelo}`;
  document.getElementById('modal-marca').textContent = v.marca;
  document.getElementById('modal-modelo').textContent = v.modelo;
  document.getElementById('modal-anio').textContent = v.anio;
  document.getElementById('modal-color').textContent = v.color;
  document.getElementById('modal-tipo-texto').textContent = v.tipoRaw;
  document.getElementById('modal-precio').textContent = v.precio;
  document.getElementById('modal-descripcion').textContent = v.descripcion || 'Sin descripción disponible.';
  document.getElementById('modal-tipo').textContent = v.tipoRaw;

  const imgModal = document.getElementById('modal-img');
  const modalGaleria = document.getElementById('modal-galeria');
  const imgsModal = [v.imagen1, v.imagen2, v.imagen3].filter(Boolean);
  const esDriveModal = v.imagen1 && v.imagen1.includes('script.google.com');

  imgModal.src = esDriveModal
    ? 'https://via.placeholder.com/800x500?text=Cargando...'
    : (v.imagen1 || 'https://via.placeholder.com/800x500?text=Sin+imagen');
  imgModal.alt = `${v.marca} ${v.modelo}`;
  imgModal.onerror = function () {
    this.src = 'https://via.placeholder.com/800x500?text=Sin+imagen';
  };

  // Galería de miniaturas en el modal
  if (modalGaleria) {
    if (imgsModal.length > 1) {
      modalGaleria.style.display = 'flex';
      modalGaleria.innerHTML = imgsModal.map((img, i) => {
        const esDrive = img && img.includes('script.google.com');
        return `
          <img src="${esDrive ? 'https://via.placeholder.com/50x50?text=...' : (img || '')}" 
               data-src="${escapeHtml(img || '')}" 
               class="modal-thumb ${i === 0 ? 'activo' : ''}" 
               data-index="${i}" 
               alt="${escapeHtml(v.modelo)} ${i + 1}" 
               style="opacity:${esDrive ? '0.6' : '1'}" />
        `;
      }).join('');

      // Click en miniatura del modal
      modalGaleria.querySelectorAll('.modal-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => {
          const index = parseInt(thumb.dataset.index);
          const imgSrc = imgsModal[index];
          if (imgSrc && imgSrc.includes('script.google.com')) {
            cargarImagenDrive(imgSrc).then(dataUrl => {
              if (dataUrl) {
                imgModal.src = dataUrl;
                modalGaleria.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('activo'));
                thumb.classList.add('activo');
              }
            });
          } else {
            imgModal.src = imgSrc || 'https://via.placeholder.com/800x500?text=Sin+imagen';
            modalGaleria.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('activo'));
            thumb.classList.add('activo');
          }
        });
      });
    } else {
      modalGaleria.style.display = 'none';
    }
  }

  // Si es imagen de Drive, cargarla vía proxy (usa caché)
  if (esDriveModal && v.imagen1) {
    cargarImagenDrive(v.imagen1).then((dataUrl) => {
      if (dataUrl) {
        imgModal.src = dataUrl;
      }
    });
  }

  const btnWa = document.getElementById('modal-whatsapp');
  const textoWa = `Hola Bach Car, me interesa el ${v.marca} ${v.modelo} (${v.anio}) - ${v.color}. Precio: ${v.precio}`;
  btnWa.href = `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(textoWa)}`;

  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function cerrarModal() {
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* =========================================
   Eventos
   ========================================= */

filtrosBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    filtrosBtns.forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    filtroActual = btn.dataset.tipo;
    renderizar();
  });
});

modalCerrar.addEventListener('click', cerrarModal);
modalFondo.addEventListener('click', cerrarModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.style.display === 'block') {
    cerrarModal();
  }
});

/* Menú móvil */
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const abierto = navLinks.classList.toggle('abierto');
    navToggle.setAttribute('aria-expanded', abierto);
  });
  navLinks.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('abierto');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* =========================================
   Inicialización
   ========================================= */
document.addEventListener('DOMContentLoaded', cargarVehiculos);