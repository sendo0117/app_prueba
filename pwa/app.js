// Lista de tareas para el navegador.
// Sigue las mismas reglas que tareas.py (prioridades, categoría por defecto,
// fechas AAAA-MM-DD, resumen del día, y completar_datos para tareas antiguas).

// Constantes, igual que en tareas.py
const PRIORIDADES = ["alta", "media", "baja"];
const PRIORIDAD_POR_DEFECTO = "media";
const CATEGORIA_POR_DEFECTO = "general";

// Claves usadas en localStorage
const CLAVE_TAREAS = "tareas";
const CLAVE_TAREAS_ROTAS = "tareas.roto";
const CLAVE_TEMA = "tema";

// Estado de la aplicación
const estado = {
    tareas: [],        // lista de tareas, con los mismos campos que tareas.json
    filtro: "todas",   // "todas", "pendientes" o "completadas"
    busqueda: "",      // texto del buscador, en minúsculas
};

// Nodos <li> de cada tarea, por id, para no recrearlos en cada cambio
const elementos = new Map();

// Ids de las tareas que deben animarse al aparecer
const nuevas = new Set();

const lista = document.getElementById("lista");
const sinTareas = document.getElementById("sin-tareas");
const formulario = document.getElementById("formulario");
const buscador = document.getElementById("buscador");
const mensaje = document.getElementById("mensaje");
const botonTema = document.getElementById("boton-tema");
const botonExportar = document.getElementById("boton-exportar");
const botonImportar = document.getElementById("boton-importar");
const inputImportar = document.getElementById("input-importar");
const tarjetaVencidas = document.getElementById("tarjeta-vencidas");

let temporizadorMensaje = null;

// ---------------------------------------------------------------------------
// Reglas de negocio (equivalentes a las funciones de tareas.py)
// ---------------------------------------------------------------------------

// Equivale a completar_datos: agrega los campos que falten a una tarea antigua
function completarDatos(tarea) {
    const completa = { ...tarea };
    if (completa.completada === undefined) completa.completada = false;
    if (completa.prioridad === undefined) completa.prioridad = PRIORIDAD_POR_DEFECTO;
    if (completa.categoria === undefined) completa.categoria = CATEGORIA_POR_DEFECTO;
    if (completa.fecha_limite === undefined) completa.fecha_limite = null;
    return completa;
}

// Equivale a siguiente_id
function siguienteId(tareas) {
    return tareas.reduce((maximo, tarea) => Math.max(maximo, tarea.id || 0), 0) + 1;
}

// Equivale a asignar_ids: da id a las tareas que no lo tienen
function asignarIds(tareas) {
    let siguiente = siguienteId(tareas);
    for (const tarea of tareas) {
        if (tarea.id === undefined) {
            tarea.id = siguiente;
            siguiente++;
        }
    }
    return tareas;
}

// Comprueba que la fecha sea AAAA-MM-DD y exista de verdad (por ejemplo, no 2026-02-30)
function fechaValida(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
    const [anio, mes, dia] = texto.split("-").map(Number);
    const fecha = new Date(anio, mes - 1, dia);
    return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
}

// Fecha de hoy en formato AAAA-MM-DD, usando la hora local del computador
function fechaDeHoy() {
    const ahora = new Date();
    const mes = String(ahora.getMonth() + 1).padStart(2, "0");
    const dia = String(ahora.getDate()).padStart(2, "0");
    return `${ahora.getFullYear()}-${mes}-${dia}`;
}

// Equivale a crear_tarea: valida los datos, agrega la tarea a la lista y la devuelve.
// Lanza Error si algún dato no es válido.
function crearTarea(tareas, descripcion, prioridad = PRIORIDAD_POR_DEFECTO, categoria = "", fechaLimite = null) {
    const texto = String(descripcion ?? "").trim();
    if (!texto) {
        throw new Error("La descripción no puede estar vacía.");
    }
    if (!PRIORIDADES.includes(prioridad)) {
        throw new Error("La prioridad debe ser alta, media o baja.");
    }

    const categoriaLimpia = String(categoria ?? "").trim().toLowerCase() || CATEGORIA_POR_DEFECTO;

    let fecha = null;
    if (fechaLimite) {
        if (!fechaValida(fechaLimite)) {
            throw new Error("Fecha no válida. Usa el formato AAAA-MM-DD, por ejemplo 2026-12-31.");
        }
        fecha = fechaLimite;
    }

    const tarea = {
        id: siguienteId(tareas),
        descripcion: texto,
        completada: false,
        prioridad,
        categoria: categoriaLimpia,
        fecha_limite: fecha,
    };
    tareas.push(tarea);
    return tarea;
}

// Una tarea está vencida si está pendiente y su fecha límite ya pasó
function esVencida(tarea, hoy) {
    return !tarea.completada && Boolean(tarea.fecha_limite) && tarea.fecha_limite < hoy;
}

// Equivale a calcular_resumen: pendientes por prioridad, vencidas y las que vencen hoy
function calcularResumen(tareas, hoy = fechaDeHoy()) {
    const pendientes = tareas.filter((tarea) => !tarea.completada);

    // Ordena por prioridad para que lo más urgente aparezca primero
    const porPrioridad = (lista) =>
        [...lista].sort((a, b) => PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad));

    const conteo = {};
    for (const prioridad of PRIORIDADES) {
        conteo[prioridad] = pendientes.filter((tarea) => tarea.prioridad === prioridad).length;
    }

    return {
        hoy,
        total_pendientes: pendientes.length,
        por_prioridad: conteo,
        vencidas: porPrioridad(pendientes.filter((tarea) => esVencida(tarea, hoy))),
        vencen_hoy: porPrioridad(pendientes.filter((tarea) => tarea.fecha_limite === hoy)),
    };
}

// Indica si una tarea cumple el filtro de estado y el texto de búsqueda
// (equivale a buscar_tareas y a los filtros de la versión web)
function coincide(tarea) {
    const cumpleEstado =
        estado.filtro === "todas" ||
        (estado.filtro === "pendientes" ? !tarea.completada : tarea.completada);

    const texto = estado.busqueda;
    const cumpleTexto =
        !texto ||
        tarea.descripcion.toLowerCase().includes(texto) ||
        tarea.categoria.toLowerCase().includes(texto);

    return cumpleEstado && cumpleTexto;
}

// ---------------------------------------------------------------------------
// Almacenamiento en localStorage (equivale a cargar_tareas y guardar_tareas)
// ---------------------------------------------------------------------------

function cargarTareas() {
    let texto = null;
    try {
        texto = localStorage.getItem(CLAVE_TAREAS);
    } catch (error) {
        mostrarMensaje("No se puede acceder al almacenamiento del navegador.");
        return [];
    }

    if (texto === null) return [];

    try {
        const datos = JSON.parse(texto);
        if (!Array.isArray(datos)) throw new Error("No es una lista.");
        return asignarIds(datos.map(completarDatos));
    } catch (error) {
        // Guarda una copia de los datos dañados para que el siguiente guardado no los borre
        try {
            localStorage.setItem(CLAVE_TAREAS_ROTAS, texto);
        } catch (errorCopia) {
            // Si no se puede copiar, al menos no se rompe la app
        }
        mostrarMensaje("Los datos guardados estaban dañados. Se guardó una copia y la lista empieza vacía.");
        return [];
    }
}

function guardarTareas() {
    try {
        localStorage.setItem(CLAVE_TAREAS, JSON.stringify(estado.tareas));
    } catch (error) {
        mostrarMensaje("No se pudieron guardar los cambios. Revisa el espacio del navegador.");
    }
}

// ---------------------------------------------------------------------------
// Exportar e importar (formato igual al de tareas.json)
// ---------------------------------------------------------------------------

function exportarTareas() {
    const contenido = JSON.stringify(estado.tareas, null, 4);
    const blob = new Blob([contenido], { type: "application/json" });
    const enlace = document.createElement("a");
    const url = URL.createObjectURL(blob);

    enlace.href = url;
    enlace.download = "tareas.json";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
}

async function importarTareas(archivo) {
    let datos;
    try {
        datos = JSON.parse(await archivo.text());
    } catch (error) {
        mostrarMensaje("El archivo no es un JSON válido.");
        return;
    }

    const valido =
        Array.isArray(datos) &&
        datos.every((item) => item && typeof item === "object" && typeof item.descripcion === "string");
    if (!valido) {
        mostrarMensaje("El archivo no tiene el formato de tareas.json.");
        return;
    }

    const confirmado = window.confirm(
        `Se agregarán ${datos.length} tareas a las que ya tienes. ¿Continuar?`
    );
    if (!confirmado) return;

    for (const item of datos) {
        const tarea = completarDatos(item);
        // Se asigna un id nuevo para no chocar con las tareas que ya existen
        tarea.id = siguienteId(estado.tareas);
        if (!PRIORIDADES.includes(tarea.prioridad)) tarea.prioridad = PRIORIDAD_POR_DEFECTO;
        if (tarea.fecha_limite && !fechaValida(tarea.fecha_limite)) tarea.fecha_limite = null;
        estado.tareas.push(tarea);
        nuevas.add(tarea.id);
    }

    guardarTareas();
    renderLista();
    mostrarMensaje(`Se importaron ${datos.length} tareas.`);
}

// ---------------------------------------------------------------------------
// Interfaz
// ---------------------------------------------------------------------------

function mostrarMensaje(texto) {
    mensaje.textContent = texto;
    mensaje.hidden = false;
    clearTimeout(temporizadorMensaje);
    temporizadorMensaje = setTimeout(() => { mensaje.hidden = true; }, 4000);
}

function esperar(milisegundos) {
    return new Promise((resolver) => setTimeout(resolver, milisegundos));
}

function buscarTarea(id) {
    return estado.tareas.find((tarea) => tarea.id === id);
}

// Crea los elementos HTML de una tarea una sola vez
function crearElemento(tarea) {
    const li = document.createElement("li");
    li.className = "tarea";

    // Entrada suave solo para las tareas recién agregadas
    if (nuevas.has(tarea.id)) {
        li.classList.add("entrar");
        li.addEventListener("animationend", () => li.classList.remove("entrar"), { once: true });
    }

    const check = document.createElement("button");
    check.type = "button";
    check.className = "check";
    check.setAttribute("aria-label", "Marcar como completada");
    check.addEventListener("click", () => alternarCompletada(tarea.id));

    const cuerpo = document.createElement("div");
    cuerpo.className = "cuerpo";

    const texto = document.createElement("span");
    texto.className = "texto";

    const meta = document.createElement("div");
    meta.className = "meta";

    const prioridad = document.createElement("span");
    const categoria = document.createElement("span");
    categoria.className = "etiqueta";
    const fecha = document.createElement("span");
    fecha.className = "etiqueta fecha";

    meta.append(prioridad, categoria, fecha);
    cuerpo.append(texto, meta);

    const borrar = document.createElement("button");
    borrar.type = "button";
    borrar.className = "borrar";
    borrar.setAttribute("aria-label", "Eliminar tarea");
    borrar.textContent = "×";
    borrar.addEventListener("click", () => eliminarTarea(tarea.id));

    li.append(check, cuerpo, borrar);
    return { li, check, texto, prioridad, categoria, fecha };
}

// Actualiza el contenido y el estado visual de una tarea ya creada
function actualizarElemento(el, tarea, hoy) {
    el.li.classList.toggle("completada", tarea.completada);
    el.li.classList.toggle("vencida", esVencida(tarea, hoy));

    el.check.textContent = tarea.completada ? "✓" : "";
    el.texto.textContent = tarea.descripcion;

    el.prioridad.className = `etiqueta prioridad-${tarea.prioridad}`;
    el.prioridad.textContent = `Prioridad ${tarea.prioridad}`;

    el.categoria.textContent = tarea.categoria;

    el.fecha.hidden = !tarea.fecha_limite;
    el.fecha.textContent = tarea.fecha_limite ? `Vence ${tarea.fecha_limite}` : "";
}

// Dibuja la lista según los datos y los filtros; solo crea los nodos que faltan
function renderLista() {
    const hoy = fechaDeHoy();
    let visibles = 0;

    for (const tarea of estado.tareas) {
        let el = elementos.get(tarea.id);
        if (!el) {
            el = crearElemento(tarea);
            elementos.set(tarea.id, el);
        }

        actualizarElemento(el, tarea, hoy);
        el.li.hidden = !coincide(tarea);
        if (!el.li.hidden) visibles++;

        // Solo se agregan al final las tarjetas nuevas; las demás no se mueven
        if (!el.li.isConnected) {
            lista.appendChild(el.li);
        }
    }

    sinTareas.hidden = visibles > 0;
    sinTareas.textContent = estado.tareas.length === 0
        ? "No tienes tareas. Agrega una arriba."
        : "No hay tareas que coincidan.";
    nuevas.clear();
    actualizarResumen();
}

// Actualiza las tarjetas de resumen
function actualizarResumen() {
    const resumen = calcularResumen(estado.tareas);

    document.getElementById("resumen-total").textContent = resumen.total_pendientes;
    document.getElementById("resumen-alta").textContent = resumen.por_prioridad.alta;
    document.getElementById("resumen-media").textContent = resumen.por_prioridad.media;
    document.getElementById("resumen-baja").textContent = resumen.por_prioridad.baja;
    document.getElementById("resumen-vencidas").textContent = resumen.vencidas.length;
    document.getElementById("resumen-vencen-hoy").textContent = `Vencen hoy: ${resumen.vencen_hoy.length}`;

    // La tarjeta de vencidas se resalta solo si hay tareas atrasadas
    tarjetaVencidas.classList.toggle("con-vencidas", resumen.vencidas.length > 0);
}

// Agrega una tarea desde el formulario sin recargar la página
formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const datos = new FormData(formulario);
    try {
        const nueva = crearTarea(
            estado.tareas,
            datos.get("descripcion"),
            datos.get("prioridad"),
            datos.get("categoria"),
            datos.get("fecha_limite") || null
        );
        nuevas.add(nueva.id);
        guardarTareas();

        formulario.reset();
        formulario.elements.prioridad.value = PRIORIDAD_POR_DEFECTO;
        formulario.elements.descripcion.focus();

        renderLista();
    } catch (error) {
        mostrarMensaje(error.message);
    }
});

// Marca una tarea como completada o pendiente
function alternarCompletada(id) {
    const tarea = buscarTarea(id);
    if (!tarea) return;

    tarea.completada = !tarea.completada;
    guardarTareas();
    renderLista();
}

// Confirma, desvanece la tarea y la quita de la lista
async function eliminarTarea(id) {
    const el = elementos.get(id);
    if (!el) return;

    const confirmado = window.confirm("¿Seguro que quieres eliminar esta tarea?");
    if (!confirmado) return;

    el.li.classList.add("saliendo");
    await esperar(300);

    estado.tareas = estado.tareas.filter((tarea) => tarea.id !== id);
    elementos.delete(id);
    el.li.remove();

    guardarTareas();
    renderLista();
}

// Búsqueda en vivo
buscador.addEventListener("input", () => {
    estado.busqueda = buscador.value.trim().toLowerCase();
    renderLista();
});

// Botones de filtro: todas, pendientes o completadas
document.querySelectorAll(".filtro").forEach((boton) => {
    boton.addEventListener("click", () => {
        estado.filtro = boton.dataset.filtro;
        document.querySelectorAll(".filtro").forEach((otro) => {
            otro.classList.toggle("activo", otro === boton);
        });
        renderLista();
    });
});

botonExportar.addEventListener("click", exportarTareas);

botonImportar.addEventListener("click", () => inputImportar.click());

inputImportar.addEventListener("change", async () => {
    const archivo = inputImportar.files[0];
    if (archivo) {
        await importarTareas(archivo);
    }
    // Se limpia para que se pueda volver a importar el mismo archivo
    inputImportar.value = "";
});

// Modo oscuro: la elección se guarda en localStorage
function aplicarTema(oscuro) {
    document.documentElement.dataset.theme = oscuro ? "oscuro" : "claro";
    botonTema.textContent = oscuro ? "☀️" : "🌙";
}

botonTema.addEventListener("click", () => {
    const oscuro = document.documentElement.dataset.theme !== "oscuro";
    aplicarTema(oscuro);
    try {
        localStorage.setItem(CLAVE_TEMA, oscuro ? "oscuro" : "claro");
    } catch (error) {
        // Si localStorage no está disponible, el tema solo dura esta visita
    }
});

// Arranque de la app
function iniciar() {
    aplicarTema(document.documentElement.dataset.theme === "oscuro");
    estado.tareas = cargarTareas();
    renderLista();
}

iniciar();

// Registra el service worker solo si el navegador lo soporta.
// Si falla, la app sigue funcionando; solo no estará disponible sin conexión.
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch((error) => {
            console.warn("No se pudo registrar el service worker:", error);
        });
    });
}
