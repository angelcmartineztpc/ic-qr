# Archivos .xlsx reales

Deja aquí archivos generados por **Excel 365 (Windows y Mac), Google Sheets y LibreOffice**
(`*.xlsx`). `tests/integration/real-workbooks.test.ts` los importa con la ruta real y
comprueba que el guard del contenedor los acepta y que se reconocen las cabeceras.

Se ignoran en Git (pueden traer datos reales del cliente). Sin archivos, esa prueba se omite.
