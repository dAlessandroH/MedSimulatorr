# MedSimulator

Plataforma personal de simuladores de examen con repaso espaciado **FSRS** (el algoritmo de Anki), estadísticas y planificación por fecha de examen.

Todo funciona en el navegador: los datos se guardan en **IndexedDB** del navegador donde la abras. No hay servidor ni cuentas.

## Formato del CSV

```
pregunta,opcion_a,opcion_b,opcion_c,opcion_d,respuesta,categoria,explicacion
```

- `respuesta`: letra (`a`–`d`). También acepta número (`1`–`4`) o el texto exacto de la opción.
- `categoria`: `Tema - Subtema` (p. ej. `Médula Espinal - Meninges`). Lo anterior al ` - ` es el tema.
- `opcion_e` / `opcion_f` son opcionales.
- Reimportar el mismo archivo actualiza las preguntas sin perder el progreso.

## Uso local

```bash
npm install
npm run dev
```

Abre http://localhost:5180

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube este proyecto a la rama `main`.
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. Cada `push` a `main` publica automáticamente en `https://<usuario>.github.io/<repositorio>/`.

## Respaldo

Los datos viven solo en ese navegador. En **Ajustes → Descargar respaldo** obtienes un `.json` que puedes restaurar en otro navegador o computadora. Haz respaldos de vez en cuando.
