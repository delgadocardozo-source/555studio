# 555 Detail Studio — Agenda Operativa

App de agenda para 555 Detail Studio (lavadero / detailing).

## Fix reciente

Las escrituras a Vercel Blob (`appointments.json` / `customers.json`) usan `allowOverwrite: true` para poder actualizar el JSON de agenda sin romper el segundo turno.

## Desarrollo

```bash
pnpm install
pnpm dev
```

Requiere `BLOB_READ_WRITE_TOKEN` en Vercel (o `DATABASE_URL` MySQL en entorno Manus).
