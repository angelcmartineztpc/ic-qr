// Comprobación de un PDF o SVG generado, ejecutada DENTRO de Adobe Illustrator.
//
//   Archivo ▸ Scripts ▸ Otro script…  → elige este archivo → elige el PDF/SVG de out/
//
// Informa de: mesas de trabajo (en mm), capas, objetos de imagen (deben ser 0),
// trazados compuestos (el QR), trazados y textos. Guarda el informe junto al archivo
// y lo muestra en pantalla. (alert aquí es de ExtendScript, no de la aplicación web.)
#target illustrator

(function () {
  var PT_TO_MM = 25.4 / 72;
  var file = File.openDialog("Selecciona el PDF o SVG generado por QR Production Generator");
  if (!file) return;

  var doc = app.open(file);
  var lines = [];
  var failures = [];
  function log(text) { lines.push(text); }
  function mm(pt) { return Math.round(pt * PT_TO_MM * 100) / 100; }

  log("Archivo: " + file.name);
  log("Illustrator " + app.version);
  log("");

  // Mesas de trabajo. Un PDF de varias páginas solo abre la página elegida en el diálogo de Illustrator.
  log("Mesas de trabajo: " + doc.artboards.length);
  for (var i = 0; i < doc.artboards.length && i < 5; i++) {
    var r = doc.artboards[i].artboardRect; // [izq, arriba, der, abajo] en pt
    log("  #" + (i + 1) + ": " + mm(r[2] - r[0]) + " × " + mm(r[1] - r[3]) + " mm");
  }
  var first = doc.artboards[0].artboardRect;
  var w = mm(first[2] - first[0]);
  var h = mm(first[1] - first[3]);
  var isTile = (Math.abs(w - 70) < 0.05 && Math.abs(h - 70) < 0.05) || (Math.abs(w - 50) < 0.05 && Math.abs(h - 50) < 0.05);
  var isA4 = Math.abs(w - 210) < 0.1 && Math.abs(h - 297) < 0.1;
  var isLetter = Math.abs(w - 215.9) < 0.1 && Math.abs(h - 279.4) < 0.1;
  if (!(isTile || isA4 || isLetter)) failures.push("La mesa de trabajo no mide 70×70 ni 50×50 (pieza), 210×297 (A4) ni 215.9×279.4 (Carta): " + w + " × " + h + " mm");

  // Debe ser vectorial: ninguna imagen, ni incrustada ni vinculada.
  var raster = doc.rasterItems.length;
  var placed = doc.placedItems.length;
  log("");
  log("Imágenes rasterizadas: " + raster);
  log("Imágenes vinculadas: " + placed);
  if (raster !== 0) failures.push("Hay " + raster + " imagen(es) rasterizada(s): el archivo NO es vectorial");
  if (placed !== 0) failures.push("Hay " + placed + " imagen(es) vinculada(s)");

  log("Trazados compuestos (el QR de cada pieza): " + doc.compoundPathItems.length);
  log("Trazados: " + doc.pathItems.length);
  log("Textos editables: " + doc.textFrames.length);
  log("Grupos: " + doc.groupItems.length);
  if (doc.compoundPathItems.length === 0 && doc.pathItems.length === 0) failures.push("No hay trazados vectoriales");

  log("");
  log("Capas: " + doc.layers.length);
  for (var l = 0; l < doc.layers.length && l < 12; l++) log("  - " + doc.layers[l].name + " (" + doc.layers[l].pageItems.length + " objetos)");

  if (doc.textFrames.length > 0) {
    var fonts = {};
    for (var t = 0; t < doc.textFrames.length; t++) {
      try { fonts[doc.textFrames[t].textRange.characterAttributes.textFont.name] = true; } catch (e) { fonts["(fuente no disponible)"] = true; }
    }
    log("");
    log("Fuentes del texto vivo:");
    for (var name in fonts) log("  - " + name);
    log("  (si aparecen como no disponibles, instala Address Sans Pro Cd Semibold para editar el texto)");
  }

  log("");
  log(failures.length === 0 ? "RESULTADO: OK ✓ — vectorial y con las medidas esperadas" : "RESULTADO: HAY PROBLEMAS ✗");
  for (var f = 0; f < failures.length; f++) log("  ✗ " + failures[f]);

  var report = new File(file.fsName + ".informe.txt");
  report.encoding = "UTF-8";
  report.open("w");
  report.write(lines.join("\n"));
  report.close();
  alert(lines.join("\n") + "\n\nInforme guardado en:\n" + report.fsName);
})();
