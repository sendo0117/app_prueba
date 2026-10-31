"""Lista de tareas de consola.

Permite agregar, listar, marcar como completadas, eliminar y buscar tareas.
Cada tarea puede tener prioridad, categoría y fecha límite, y hay un resumen
de los pendientes del día.
Las tareas se guardan en tareas.json para que persistan entre ejecuciones.
"""

import json
import os
import shutil
from datetime import date, datetime

# Ruta del archivo donde se guardan las tareas (en la misma carpeta que este script)
RUTA_ARCHIVO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tareas.json")

# Prioridades válidas, de mayor a menor urgencia
PRIORIDADES = ["alta", "media", "baja"]
PRIORIDAD_POR_DEFECTO = "media"
CATEGORIA_POR_DEFECTO = "general"

# Formato de las fechas límite, por ejemplo 2026-12-31
FORMATO_FECHA = "%Y-%m-%d"


def completar_datos(tarea):
    """Agrega los campos nuevos a una tarea guardada antes de que existieran."""
    tarea.setdefault("prioridad", PRIORIDAD_POR_DEFECTO)
    tarea.setdefault("categoria", CATEGORIA_POR_DEFECTO)
    tarea.setdefault("fecha_limite", None)
    return tarea


def siguiente_id(tareas):
    """Devuelve un id mayor que cualquiera de los ya usados."""
    return max((tarea.get("id", 0) for tarea in tareas), default=0) + 1


def asignar_ids(tareas):
    """Da un id único a las tareas que todavía no lo tienen (datos antiguos)."""
    siguiente = siguiente_id(tareas)
    for tarea in tareas:
        if "id" not in tarea:
            tarea["id"] = siguiente
            siguiente += 1
    return tareas


def cargar_tareas():
    """Lee las tareas desde tareas.json.

    Si el archivo no existe o está dañado, devuelve una lista vacía
    para que el programa pueda arrancar igualmente.
    """
    if not os.path.exists(RUTA_ARCHIVO):
        return []

    try:
        with open(RUTA_ARCHIVO, "r", encoding="utf-8") as archivo:
            return asignar_ids([completar_datos(tarea) for tarea in json.load(archivo)])
    except (json.JSONDecodeError, OSError, TypeError, AttributeError):
        # Guarda una copia del archivo dañado para que el siguiente guardado no la borre
        shutil.copy(RUTA_ARCHIVO, RUTA_ARCHIVO + ".roto")
        print("Aviso: no se pudo leer tareas.json. Se inicia con la lista vacía "
              "y el archivo dañado se guardó como tareas.json.roto.")
        return []


def guardar_tareas(tareas):
    """Escribe la lista de tareas en tareas.json."""
    with open(RUTA_ARCHIVO, "w", encoding="utf-8") as archivo:
        json.dump(tareas, archivo, ensure_ascii=False, indent=4)


def leer_numero(mensaje, maximo):
    """Pide un número entero entre 1 y maximo hasta que el usuario lo ingrese bien."""
    while True:
        entrada = input(mensaje).strip()
        if entrada.isdigit() and 1 <= int(entrada) <= maximo:
            return int(entrada)
        print(f"Ingresa un número entre 1 y {maximo}.")


def pedir_prioridad():
    """Pide la prioridad de la tarea. Enter deja la prioridad media."""
    print("Prioridad: 1. alta  2. media  3. baja")
    while True:
        entrada = input("Elige prioridad (Enter = media): ").strip()
        if entrada == "":
            return PRIORIDAD_POR_DEFECTO
        if entrada in ("1", "2", "3"):
            return PRIORIDADES[int(entrada) - 1]
        print("Ingresa 1, 2, 3 o Enter.")


def pedir_fecha():
    """Pide una fecha límite con formato AAAA-MM-DD. Enter la deja vacía."""
    while True:
        entrada = input("Fecha límite AAAA-MM-DD (Enter = sin fecha): ").strip()
        if entrada == "":
            return None
        try:
            # Se vuelve a formatear para que la fecha guardada siempre tenga el mismo formato
            fecha = datetime.strptime(entrada, FORMATO_FECHA)
            return fecha.strftime(FORMATO_FECHA)
        except ValueError:
            print("Fecha no válida. Usa el formato AAAA-MM-DD, por ejemplo 2026-12-31.")


def formatear_tarea(tarea, numero=None):
    """Devuelve una línea de texto con los datos de una tarea.

    Si se pasa un número, se muestra al inicio; si no, se usa un guion.
    """
    prefijo = f"{numero}. " if numero is not None else "- "
    marca = "[x]" if tarea["completada"] else "[ ]"
    texto = f"{prefijo}{marca} ({tarea['prioridad'].upper()}) [{tarea['categoria']}] {tarea['descripcion']}"
    if tarea["fecha_limite"]:
        texto += f" - vence {tarea['fecha_limite']}"
    return texto


def buscar_tarea_por_id(tareas, id_tarea):
    """Devuelve la tarea con ese id, o None si no existe."""
    return next((tarea for tarea in tareas if tarea["id"] == id_tarea), None)


def crear_tarea(tareas, descripcion, prioridad=PRIORIDAD_POR_DEFECTO,
                categoria=CATEGORIA_POR_DEFECTO, fecha_limite=None):
    """Valida los datos y agrega una tarea pendiente a la lista.

    Lanza ValueError si algún dato no es válido. Lo usan tanto la consola como la API web.
    """
    descripcion = str(descripcion).strip()
    if not descripcion:
        raise ValueError("La descripción no puede estar vacía.")
    if prioridad not in PRIORIDADES:
        raise ValueError("La prioridad debe ser alta, media o baja.")

    categoria = str(categoria or "").strip().lower() or CATEGORIA_POR_DEFECTO

    if fecha_limite:
        try:
            fecha_limite = datetime.strptime(str(fecha_limite), FORMATO_FECHA).strftime(FORMATO_FECHA)
        except ValueError:
            raise ValueError("Fecha no válida. Usa el formato AAAA-MM-DD, por ejemplo 2026-12-31.")
    else:
        fecha_limite = None

    tarea = {
        "id": siguiente_id(tareas),
        "descripcion": descripcion,
        "completada": False,
        "prioridad": prioridad,
        "categoria": categoria,
        "fecha_limite": fecha_limite,
    }
    tareas.append(tarea)
    return tarea


def agregar_tarea(tareas):
    """Pide los datos de una tarea nueva y la agrega como pendiente."""
    descripcion = input("Descripción de la tarea: ").strip()
    if not descripcion:
        print("La descripción no puede estar vacía.")
        return

    prioridad = pedir_prioridad()
    categoria = input("Categoría (Enter = general): ")
    fecha_limite = pedir_fecha()

    crear_tarea(tareas, descripcion, prioridad, categoria, fecha_limite)
    guardar_tareas(tareas)
    print("Tarea agregada.")


def listar_tareas(tareas):
    """Muestra todas las tareas numeradas."""
    if not tareas:
        print("No hay tareas registradas.")
        return

    print("\nTus tareas:")
    for numero, tarea in enumerate(tareas, start=1):
        print(formatear_tarea(tarea, numero))
    print()


def marcar_completada(tareas):
    """Marca como completada la tarea elegida por su número."""
    if not tareas:
        print("No hay tareas para marcar.")
        return

    listar_tareas(tareas)
    numero = leer_numero("Número de la tarea a completar: ", len(tareas))
    tareas[numero - 1]["completada"] = True
    guardar_tareas(tareas)
    print("Tarea marcada como completada.")


def eliminar_tarea(tareas):
    """Elimina la tarea elegida por su número."""
    if not tareas:
        print("No hay tareas para eliminar.")
        return

    listar_tareas(tareas)
    numero = leer_numero("Número de la tarea a eliminar: ", len(tareas))
    eliminada = tareas.pop(numero - 1)
    guardar_tareas(tareas)
    print(f"Tarea eliminada: {eliminada['descripcion']}")


def buscar_tareas(tareas):
    """Muestra las tareas cuya descripción o categoría contienen el texto buscado."""
    texto = input("Buscar (en descripción o categoría): ").strip().lower()
    if not texto:
        print("Escribe algo para buscar.")
        return

    encontradas = False
    for numero, tarea in enumerate(tareas, start=1):
        if texto in tarea["descripcion"].lower() or texto in tarea["categoria"].lower():
            print(formatear_tarea(tarea, numero))
            encontradas = True

    if not encontradas:
        print("No se encontraron tareas.")
    print()


def calcular_resumen(tareas, hoy=None):
    """Calcula los datos del resumen de pendientes del día.

    Devuelve un diccionario con el total de pendientes, cuántos hay por prioridad,
    y las tareas vencidas y las que vencen hoy, ordenadas por prioridad.
    Lo usan tanto la consola como la API web.
    """
    hoy = hoy or date.today().strftime(FORMATO_FECHA)
    pendientes = [tarea for tarea in tareas if not tarea["completada"]]

    def por_prioridad(lista):
        # Ordena para que lo más urgente aparezca primero
        return sorted(lista, key=lambda tarea: PRIORIDADES.index(tarea["prioridad"]))

    return {
        "hoy": hoy,
        "total_pendientes": len(pendientes),
        "por_prioridad": {p: sum(1 for t in pendientes if t["prioridad"] == p) for p in PRIORIDADES},
        "vencidas": por_prioridad([t for t in pendientes if t["fecha_limite"] and t["fecha_limite"] < hoy]),
        "vencen_hoy": por_prioridad([t for t in pendientes if t["fecha_limite"] == hoy]),
    }


def resumen_del_dia(tareas):
    """Muestra las tareas pendientes que están vencidas o vencen hoy."""
    resumen = calcular_resumen(tareas)

    if resumen["total_pendientes"] == 0:
        print("¡No tienes tareas pendientes!")
        return

    print(f"\n=== RESUMEN DEL DÍA ({resumen['hoy']}) ===")
    print(f"Pendientes en total: {resumen['total_pendientes']}")
    for prioridad in PRIORIDADES:
        print(f"  Prioridad {prioridad}: {resumen['por_prioridad'][prioridad]}")

    vencidas = resumen["vencidas"]
    print(f"\nVencidas ({len(vencidas)}):")
    for tarea in vencidas:
        print(formatear_tarea(tarea))
    if not vencidas:
        print("  Ninguna.")

    para_hoy = resumen["vencen_hoy"]
    print(f"\nVencen hoy ({len(para_hoy)}):")
    for tarea in para_hoy:
        print(formatear_tarea(tarea))
    if not para_hoy:
        print("  Ninguna.")
    print()


def main():
    """Muestra el menú principal y ejecuta la opción elegida hasta salir."""
    tareas = cargar_tareas()

    while True:
        print("=== LISTA DE TAREAS ===")
        print("1. Agregar tarea")
        print("2. Listar tareas")
        print("3. Marcar tarea como completada")
        print("4. Eliminar tarea")
        print("5. Buscar tareas")
        print("6. Resumen de pendientes del día")
        print("0. Salir")

        opcion = input("Elige una opción: ").strip()

        if opcion == "1":
            agregar_tarea(tareas)
        elif opcion == "2":
            listar_tareas(tareas)
        elif opcion == "3":
            marcar_completada(tareas)
        elif opcion == "4":
            eliminar_tarea(tareas)
        elif opcion == "5":
            buscar_tareas(tareas)
        elif opcion == "6":
            resumen_del_dia(tareas)
        elif opcion == "0":
            print("¡Hasta luego!")
            break
        else:
            print("Opción no válida. Intenta de nuevo.")

        print()


if __name__ == "__main__":
    main()
