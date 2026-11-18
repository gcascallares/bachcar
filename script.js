/* =========================================
   Bach Car — Lógica del catálogo
   (HTML + CSS + JavaScript vanilla)
   ========================================= */

/**
 * CONFIGURACIÓN
 * ------------------------------------------------------------------
 * 1. Publicá tu Google Sheet como "Cualquier persona con el enlace
 *    puede ver" (Archivo > Compartir > Cambiar a "Cualquier persona
 *    con el enlace" > Visor).
 * 2. Copiá el ID de la hoja de la URL. Ejemplo:
 *    https://docs.google.com/spreadsheets/d/1ABCxyZ.../edit
 *    El ID es: 1ABCxyZ...
 * 3. Pegá ese ID abajo en SHEET_ID.
 *
 * Columnas esperadas en la hoja (primera fila = encabezados):
 *   Marca, Modelo, Tipo, Año, Color, Precio, Imagen1, Imagen2, Imagen3, Descripcion
 *   (Tipo acepta: Auto, Moto, Camioneta)
 */

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



/* =========================================
   Estado
   ========================================= */
let vehiculos = [];
let filtroActual = 'todos';

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
 * Convierte un enlace de Google Drive a una URL directa de imagen.
 * Soporta:
 *   https://drive.google.com/file/d/ID/view
 *   https://drive.google.com/open?id=ID
 *   https://drive.google.com/uc?export=view&id=ID
 *   URL directa (se devuelve igual)
 */
function convertirImagenDrive(url) {
  if (!url) return '';
  url = url.trim();
  if (!url) return '';

  if (!url.includes('drive.google.com')) {
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
  return `https://drive.usercontent.google.com/download?id=${id}&export=view&authuser=0`;
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
    mensajeVacio.innerHTML = `<p style="color:#f87171; font-weight:600; padding:40px; text-align:center;">${mensaje}</p>`;
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

    const imgPrincipal = v.imagen1 || 'https://via.placeholder.com/400x250?text=Sin+imagen';

    tarjeta.innerHTML = `
      <div class="tarjeta-img">
        <img src="${escapeHtml(imgPrincipal)}" alt="${escapeHtml(v.marca + ' ' + v.modelo)}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x250?text=Sin+imagen'" />
        <span class="tarjeta-tipo">${escapeHtml(v.tipoRaw)}</span>
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
  imgModal.src = v.imagen1 || 'https://via.placeholder.com/800x500?text=Sin+imagen';
  imgModal.alt = `${v.marca} ${v.modelo}`;
  imgModal.onerror = function () {
    this.src = 'https://via.placeholder.com/800x500?text=Sin+imagen';
  };

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
