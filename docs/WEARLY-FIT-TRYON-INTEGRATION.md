# Wardrobe ↔ Wearly — Garment Source to Fit-aware Try-On

**Fecha:** 2026-08-08  
**Estado:** integración arquitectónica aprobada; conexión de código pendiente.

## Contexto

Wardrobe sigue siendo el **núcleo de ingesta y verdad de la prenda** dentro de Fashion Studio SOL.

Su responsabilidad principal es:

```text
foto / catálogo
→ detección
→ crop
→ reconstrucción
→ limpieza de fondo
→ QA humano
→ asset de prenda aprobado
→ metadatos canónicos
```

El repositorio propio:

- https://github.com/Juanmaes83/wearly

se incorpora al ecosistema como **Fit Intelligence + Fit-Aware Virtual Try-On Engine**.

Wearly no sustituye Wardrobe. Wardrobe crea y valida la prenda; Wearly utiliza esa prenda y sus datos de variante para razonar el ajuste sobre un consumidor y generar el try-on.

## Flujo objetivo

```text
Wardrobe
→ asset de prenda aprobado
→ metadatos y QA
→ Fashion Studio SOL / fashion-schema
→ producto / variante / talla / material
→ Wearly
→ Fit Report
→ try-on
→ MIRRORA
→ experiencia de consumidor y conversión
```

## Qué debe poder entregar Wardrobe

Progresivamente, el contrato de salida hacia Fashion Studio SOL / Wearly debe cubrir cuando exista:

- `garmentId`;
- `productId`;
- asset aprobado;
- categoría;
- material;
- color / variante;
- construcción y detalles relevantes;
- SKU / variant id;
- estado de QA;
- size chart o referencia al size chart;
- medidas de patrón o tech pack cuando estén disponibles;
- datos de stretch/comportamiento del tejido cuando estén disponibles.

No todos estos campos deben bloquear el primer slice. Los datos ausentes deben tener fallback explícito y no convertirse en “verdad” inventada.

## Qué NO debe hacer Wardrobe

Wardrobe no debe duplicar:

- el Fit Engine de Wearly;
- perfil corporal del consumidor;
- `How this fits you`;
- lógica de comparación entre tallas;
- jobs de try-on del consumidor;
- storefront, wishlist o carrito.

## Principio de fidelidad

El asset de prenda aprobado por Wardrobe debe convertirse en la referencia visual canónica para el try-on:

- tejido;
- print/pattern;
- costuras;
- cuello;
- bolsillos;
- cierres;
- hardware;
- acabados;
- silueta de la prenda.

Wearly puede transformar cómo esa prenda se ajusta al cuerpo, pero no debe rediseñar la prenda.

## Relación con Fashion Schema

La integración no debe ser `Wardrobe → Wearly` mediante estructuras ad hoc diferentes a las del producto.

La ruta preferida es:

```text
Wardrobe
→ fashion-schema / catálogo canónico
→ adapter de try-on
→ Wearly
```

Así evitamos que Wearly mantenga un catálogo paralelo y que las medidas/tallas se dupliquen.

## Documento maestro

La decisión completa vive en:

- `Juanmaes83/Fashion-Studio-SOL/docs/ADR/0003-wearly-fit-tryon-engine.md`
- `Juanmaes83/Fashion-Studio-SOL/docs/WEARLY-FIT-TRYON-INTEGRATION-2026-08-08.md`

Esta nota existe para que cualquier futura sesión que trabaje directamente en Wardrobe entienda que la salida de prenda tiene un consumidor downstream adicional: Wearly.
