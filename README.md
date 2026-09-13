# Bitan Journeys — sitio web

Sitio estático. No hay build, no hay dependencias de Node en runtime: se sirve tal cual.

## Estructura

    index.html              La página completa (intro, mundo, viaje, brief, WhatsApp)
    support.js              Runtime que monta la página
    bitan-globe.js          El globo 3D (three.js + d3, con fallback SVG)
    assets/brand/           Ícono oficial, Bitan y retratos por destino
    assets/journeys/        Fotos de los 10 viajes

## Probar en local

VS Code: extensión **Live Server** → clic derecho en `index.html` → *Open with Live Server*.

O con cualquier servidor estático:

    npx serve .
    # o
    python3 -m http.server 8080

Abrir `file://` directamente también funciona en la mayoría de navegadores, pero un servidor local
es más fiel a producción.

## Publicar en GitHub Pages

1. Crear el repo y subir el contenido de esta carpeta a la raíz.
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, carpeta `/ (root)`.
3. El sitio queda en `https://<usuario>.github.io/<repo>/`.

Para un dominio propio (bitanjourneys.com): Settings → Pages → Custom domain, y en el DNS un
registro CNAME apuntando a `<usuario>.github.io`.

Alternativa: arrastrar la carpeta a Vercel o Netlify — se despliega sin configuración.

## Dependencias externas (CDN)

- Google Fonts: Plus Jakarta Sans + Cormorant Garamond
- d3 7.9, topojson-client 3.1 (geografía de Natural Earth)
- three.js 0.128 (el globo; si el navegador no soporta WebGL cae a un globo SVG)

La geometría de los países se descarga de `cdn.jsdelivr.net/npm/world-atlas`. Sin conexión el
globo se ve como esfera con retícula, y el resto del sitio funciona igual.

## Qué editar

- **Viajes, textos y coordenadas**: constante `D` dentro de `index.html` (bloque `<script type="text/x-dc">`).
- **Intro de 3 pantallas**: constante `ONBOARDING` en el mismo bloque.
- **Número de WhatsApp**: constante `WA_NUMBER`.
- **Pantalla inicial / zoom del globo / rotación automática**: props al final del archivo
  (`startScreen`, `globeZoom`, `autoRotate`).
