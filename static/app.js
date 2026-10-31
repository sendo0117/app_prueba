// Estado de la aplicación
const estado = {
    tareas: [],           // tareas tal como las devuelve la API
    vencidas: new Set(),  // ids de las tareas vencidas, según /api/resumen
    filtro: "todas",      // "todas", "pendientes" o "completadas"
    busqueda: "",         // texto del buscador, en minúsculas
    nuevas: new Set(),    // ids de las tareas que deben animarse al aparecer
};

// Elementos de cada tarea, por id. Se reutilizan para que las animaciones no se repitan
const elementos = new Map();

const lista = document.getElementById("lista");
const sinTareas = document.getElementById("sin-tareas");
const formulario = document.getElementById("formulario");
const buscador = document.getElementById("buscador");
const mensaje = document.getElementById("mensaje");
const botonTema = document.getElementById("boton-tema");
const tarjetaVencidas = document.getElementById("tarjeta-vencidas");

let temporizadorMensaje = null;

// Pequeña ayuda para llamar a la API y convertir los errores en excepciones
async function api(url, opciones = {}) {
    const respuesta = await fetch(url, {
        ...opciones,
        headers: { "Content-Type": "application/json" },
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
        throw new Error(datos.error || "Ocurrió un error en el servidor.");
    }
    return datos;
}

function esperar(milisegundos) {
    return new Promise((resolver) => setTimeout(resolver, milisegundos));
}

function mostrarMensaje(texto) {
    mensaje.textContent = texto;
    mensaje.hidden = false;
    clearTimeout(temporizadorMensaje);
    temporizadorMensaje = setTimeout(() => { mensaje.hidden = true; }, 4000);
}

function buscarTarea(id) {
    return estado.tareas.find((tarea) => tarea.id === id);
}

// Indica si una tarea cumple el filtro de estado y el texto de búsqueda
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

// Crea los elementos HTML de una tarea una sola vez
function crearElemento(tarea) {
    const li = document.createElement("li");
    li.className = "tarea";

    // Si la tarea es nueva, se anima su entrada una sola vez
    if (estado.nuevas.has(tarea.id)) {
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
function actualizarElemento(el, tarea) {
    el.li.classList.toggle("completada", tarea.completada);
    el.li.classList.toggle("vencida", estado.vencidas.has(tarea.id));

    el.check.textContent = tarea.completada ? "✓" : "";
    el.texto.textContent = tarea.descripcion;

    el.prioridad.className = `etiqueta prioridad-${tarea.prioridad}`;
    el.prioridad.textContent = `Prioridad ${tarea.prioridad}`;

    el.categoria.textContent = tarea.categoria;

    el.fecha.hidden = !tarea.fecha_limite;
    el.fecha.textContent = tarea.fecha_limite ? `Vence ${tarea.fecha_limite}` : "";
}

// Dibuja la lista según el estado actual y los filtros
function renderLista() {
    let visibles = 0;

    for (const tarea of estado.tareas) {
        let el = elementos.get(tarea.id);
        if (!el) {
            el = crearElemento(tarea);
            elementos.set(tarea.id, el);
        }

        actualizarElemento(el, tarea);
        el.li.hidden = !coincide(tarea);
        if (!el.li.hidden) {
            visibles++;
        }

        // Solo se agregan al final las tarjetas nuevas; las demás no se mueven
        if (!el.li.isConnected) {
            lista.appendChild(el.li);
        }
    }

    sinTareas.hidden = visibles > 0;
    estado.nuevas.clear();
}

// Actualiza las tarjetas de resumen y la lista de vencidas
async function cargarResumen() {
    const resumen = await api("/api/resumen");

    estado.vencidas = new Set(resumen.vencidas.map((tarea) => tarea.id));

    document.getElementById("resumen-total").textContent = resumen.total_pendientes;
    document.getElementById("resumen-alta").textContent = resumen.por_prioridad.alta;
    document.getElementById("resumen-media").textContent = resumen.por_prioridad.media;
    document.getElementById("resumen-baja").textContent = resumen.por_prioridad.baja;
    document.getElementById("resumen-vencidas").textContent = resumen.vencidas.length;
    document.getElementById("resumen-vencen-hoy").textContent =
        `Vencen hoy: ${resumen.vencen_hoy.length}`;

    // La tarjeta de vencidas se resalta solo si hay tareas atrasadas
    tarjetaVencidas.classList.toggle("con-vencidas", resumen.vencidas.length > 0);

    renderLista();
}

// Agrega una tarea desde el formulario sin recargar la página
formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const datos = new FormData(formulario);
    const cuerpo = {
        descripcion: datos.get("descripcion"),
        prioridad: datos.get("prioridad"),
        categoria: datos.get("categoria"),
        fecha_limite: datos.get("fecha_limite") || null,
    };

    try {
        const nueva = await api("/api/tareas", { method: "POST", body: JSON.stringify(cuerpo) });
        estado.tareas.push(nueva);
        estado.nuevas.add(nueva.id);

        formulario.reset();
        formulario.elements.prioridad.value = "media";
        formulario.elements.descripcion.focus();

        await cargarResumen();
    } catch (error) {
        mostrarMensaje(error.message);
    }
});

// Marca una tarea como completada o pendiente
async function alternarCompletada(id) {
    const tarea = buscarTarea(id);
    if (!tarea) return;

    try {
        const actualizada = await api(`/api/tareas/${id}/completar`, {
            method: "PATCH",
            body: JSON.stringify({ completada: !tarea.completada }),
        });
        Object.assign(tarea, actualizada);
        await cargarResumen();
    } catch (error) {
        mostrarMensaje(error.message);
    }
}

// Desvanece la tarea, la borra en el servidor y la quita de la lista
async function eliminarTarea(id) {
    const el = elementos.get(id);
    if (!el) return;

    el.li.classList.add("saliendo");

    try {
        // Se espera a que termine la animación y a que el servidor confirme
        await Promise.all([api(`/api/tareas/${id}`, { method: "DELETE" }), esperar(300)]);
    } catch (error) {
        el.li.classList.remove("saliendo");
        mostrarMensaje(error.message);
        return;
    }

    estado.tareas = estado.tareas.filter((tarea) => tarea.id !== id);
    elementos.delete(id);
    el.li.remove();

    await cargarResumen();
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

// Modo oscuro: se guarda la elección en localStorage
function aplicarTema(oscuro) {
    document.documentElement.dataset.theme = oscuro ? "oscuro" : "claro";
    botonTema.textContent = oscuro ? "☀️" : "🌙";
}

botonTema.addEventListener("click", () => {
    const oscuro = document.documentElement.dataset.theme !== "oscuro";
    aplicarTema(oscuro);
    try {
        localStorage.setItem("tema", oscuro ? "oscuro" : "claro");
    } catch (error) {
        // Si localStorage no está disponible, el tema solo dura esta visita
    }
});

async function iniciar() {
    aplicarTema(document.documentElement.dataset.theme === "oscuro");

    try {
        estado.tareas = await api("/api/tareas");
        await cargarResumen();
    } catch (error) {
        mostrarMensaje(`No se pudieron cargar las tareas: ${error.message}`);
    }
}

iniciar();
