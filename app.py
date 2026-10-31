"""Servidor web de la lista de tareas.

Usa Flask y reutiliza las funciones de tareas.py para leer, validar,
guardar y resumir las tareas. Los datos siguen en tareas.json.
"""

from flask import Flask, jsonify, render_template, request

from tareas import (
    PRIORIDAD_POR_DEFECTO,
    buscar_tarea_por_id,
    calcular_resumen,
    cargar_tareas,
    crear_tarea,
    guardar_tareas,
)

app = Flask(__name__)


def obtener_datos_json():
    """Devuelve el cuerpo JSON de la petición, o un diccionario vacío si no es válido."""
    datos = request.get_json(silent=True)
    return datos if isinstance(datos, dict) else {}


@app.get("/")
def pagina_principal():
    """Muestra la página con la interfaz de la lista de tareas."""
    return render_template("index.html")


@app.get("/api/tareas")
def listar_tareas_api():
    """Devuelve todas las tareas en formato JSON."""
    return jsonify(cargar_tareas())


@app.post("/api/tareas")
def agregar_tarea_api():
    """Crea una tarea nueva con los datos enviados en el cuerpo JSON."""
    datos = obtener_datos_json()
    tareas = cargar_tareas()

    try:
        nueva = crear_tarea(
            tareas,
            datos.get("descripcion", ""),
            datos.get("prioridad", PRIORIDAD_POR_DEFECTO),
            datos.get("categoria"),
            datos.get("fecha_limite"),
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    guardar_tareas(tareas)
    return jsonify(nueva), 201


@app.patch("/api/tareas/<int:id_tarea>/completar")
def completar_tarea_api(id_tarea):
    """Marca la tarea como completada. Con {"completada": false} la vuelve a pendiente."""
    completada = bool(obtener_datos_json().get("completada", True))
    tareas = cargar_tareas()

    tarea = buscar_tarea_por_id(tareas, id_tarea)
    if tarea is None:
        return jsonify({"error": "La tarea no existe."}), 404

    tarea["completada"] = completada
    guardar_tareas(tareas)
    return jsonify(tarea)


@app.delete("/api/tareas/<int:id_tarea>")
def eliminar_tarea_api(id_tarea):
    """Elimina la tarea con ese id."""
    tareas = cargar_tareas()

    tarea = buscar_tarea_por_id(tareas, id_tarea)
    if tarea is None:
        return jsonify({"error": "La tarea no existe."}), 404

    tareas.remove(tarea)
    guardar_tareas(tareas)
    return jsonify({"eliminada": id_tarea})


@app.get("/api/resumen")
def resumen_api():
    """Devuelve los pendientes por prioridad y las tareas vencidas o que vencen hoy."""
    return jsonify(calcular_resumen(cargar_tareas()))


if __name__ == "__main__":
    app.run(debug=True)
