import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEasPurchase,
  buildInventoryBook,
  buildIvaPosition,
  buildJournal,
  buildLedger,
  buildSalesBook,
  ledgerTotals,
  normalizeEasProfile,
  type EasProfile,
  type EasPurchase,
  type SalesBookRow,
} from "../shared/easBooks";
import { buildMonthPackage, rucCheckDigit, type MonthBooks, type MonthPackage } from "../shared/hechauka";
import { buildStoreZip, crc32 } from "../shared/storeZip";

function card(over: Partial<EasProfile> = {}): EasProfile {
  return normalizeEasProfile({
    legalName: "555 Detail Studio EAS",
    ruc: "80012345-0",
    regime: "simple",
    activity: "Lavado y detallado de vehículos a domicilio",
    repName: "Representante EAS",
    repRuc: "1234567-9",
    timbrado: "12345678",
    establecimiento: "001",
    puntoExpedicion: "001",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  });
}

function sale(partial: {
  number?: string;
  issuedDate?: string;
  clientName?: string;
  clientTaxId?: string;
  total?: number;
  paymentStatus?: string;
} = {}): SalesBookRow {
  const total = partial.total ?? 110000;
  const iva = Math.round((total * 10) / 110);
  const rows = buildSalesBook(
    [
      {
        number: partial.number || "CS-000001",
        status: "emitida",
        issuedDate: partial.issuedDate || "2026-10-03",
        clientName: partial.clientName || "Cliente",
        clientTaxId: partial.clientTaxId,
        taxableBase: total - iva,
        ivaAmount: iva,
        total,
        paymentStatus: partial.paymentStatus || "pagado",
      },
    ],
    "2026-10"
  );
  return rows[0];
}

function monthBooks(opts: {
  profile?: Partial<EasProfile>;
  sales?: SalesBookRow[];
  purchases?: EasPurchase[];
} = {}): MonthBooks {
  const profile = card(opts.profile);
  const sales = opts.sales || [];
  const purchases = opts.purchases || [];
  const journal = buildJournal({ regime: profile.regime, sales, purchases, payroll: [] });
  return {
    profile,
    month: "2026-10",
    sales,
    purchases,
    journal,
    ledger: buildLedger(journal),
    iva: buildIvaPosition(profile.regime, sales, purchases),
    inventory: buildInventoryBook([{ name: "Shampoo", unit: "lt", stock: 2, unitCost: 50000 }]),
  };
}

function textOf(pkg: MonthPackage, name: string): string {
  const file = pkg.files.find((item) => item.name === name);
  expect(file, name).toBeTruthy();
  return new TextDecoder().decode(file!.bytes);
}

function parseTsv(text: string): string[][] {
  expect(text.charCodeAt(0)).not.toBe(0xfeff);
  expect(text.endsWith("\r\n")).toBe(true);
  const stripped = text.replace(/\r\n/g, "");
  expect(stripped.includes("\n")).toBe(false);
  expect(stripped.includes("\r")).toBe(false);
  return text.replace(/\r\n$/, "").split("\r\n").map((line) => line.split("\t"));
}

const CSV_NAMES = [
  "libro-diario-202610.csv",
  "libro-mayor-202610.csv",
  "libro-inventario-202610.csv",
  "posicion-iva-202610.csv",
  "compras-202610.csv",
  "ventas-202610.csv",
  "LEEME.txt",
];

describe("Hechauka y presentación mensual", () => {
  it("calcula el DV módulo 11", () => {
    expect(rucCheckDigit("44444401")).toBe(7);
    expect(rucCheckDigit("99999901")).toBe(0);
    expect(rucCheckDigit("66666601")).toBe(6);
    expect(rucCheckDigit("77777701")).toBe(0);
    expect(rucCheckDigit("88888801")).toBe(5);
  });

  it("junta las ventas sin RUC en 44444401-7 y numera al cliente identificado", () => {
    const pkg = buildMonthPackage(
      monthBooks({
        profile: { establecimiento: "2", puntoExpedicion: "3" },
        sales: [
          sale({ number: "CS-000001", clientName: "Taller Norte", clientTaxId: "66666601-6", total: 110000 }),
          sale({
            number: "CS-000010",
            clientName: "Flota Sur",
            clientTaxId: "80012345-0",
            total: 220000,
            issuedDate: "2026-10-08",
            paymentStatus: "falta_pagar",
          }),
          sale({ number: "CS-000002", clientName: "Sin RUC A", clientTaxId: "", total: 55000, issuedDate: "2026-10-04" }),
          sale({
            number: "CS-000005",
            clientName: "Sin RUC B",
            total: 22000,
            issuedDate: "2026-10-10",
            paymentStatus: "falta_pagar",
          }),
        ],
      })
    );
    const ventasBytes = pkg.files.find((item) => item.name === "hechauka-ventas-202610.txt")!.bytes;
    expect(ventasBytes[0]).toBe(0x31);
    const rows = parseTsv(textOf(pkg, "hechauka-ventas-202610.txt"));
    const header = rows[0];
    const details = rows.slice(1);
    expect(header.slice(0, 5)).toEqual(["1", "202610", "1", "921", "221"]);
    expect(header[5]).toBe("80012345");
    expect(header[6]).toBe("0");
    expect(header[8]).toBe("1234567");
    expect(header[9]).toBe("9");
    expect(details).toHaveLength(3);
    expect(header[11]).toBe("3");

    const identified = details.find((row) => row[3] === "Taller Norte")!;
    expect(identified[4]).toBe("1");
    expect(identified[5]).toBe("002-003-0000001");
    expect(identified[6]).toBe("03/10/2026");
    expect(identified[7]).toBe("100000");
    expect(identified[8]).toBe("10000");
    expect(identified[12]).toBe("110000");
    expect(identified[13]).toBe("1");
    expect(identified[14]).toBe("0");
    expect(identified[15]).toBe("12345678");

    const credit = details.find((row) => row[3] === "Flota Sur")!;
    expect(credit[5]).toBe("002-003-0000010");
    expect(credit[13]).toBe("2");
    expect(credit[14]).toBe("1");
    expect(credit[4]).not.toBe("0");

    const consumer = details.find((row) => row[1] === "44444401")!;
    expect(consumer[2]).toBe("7");
    expect(consumer[3]).toBe("Consumidor final");
    expect(consumer[4]).toBe("1");
    expect(consumer[5]).toBe("0");
    expect(consumer[6]).toBe("10/10/2026");
    expect(consumer[7]).toBe("70000");
    expect(consumer[8]).toBe("7000");
    expect(consumer[12]).toBe("77000");
    expect(consumer[13]).toBe("2");
    expect(consumer[14]).toBe("1");
    expect(consumer[15]).toBe("0");
    expect(details.filter((row) => row[1] === "44444401")).toHaveLength(1);

    const sumIngreso = details.reduce((sum, row) => sum + Number(row[12]), 0);
    expect(Number(header[12])).toBe(sumIngreso);
    expect(header[13]).toBe("2");
    expect(textOf(pkg, "ventas-202610.csv")).toContain("CS-000001");
  });

  it("el encabezado de compras coincide con la suma sin IVA y deja afuera lo incompleto", () => {
    const good = buildEasPurchase(
      {
        date: "2026-10-04",
        supplierName: "Química SA",
        supplierRuc: "88888801-5",
        voucherNumber: "001-001-0000123",
        timbrado: "87.654.321",
        taxed10: 100000,
        taxed5: 20000,
        exempt: 5000,
      },
      1,
      "2026-10-04T00:00:00.000Z"
    );
    const exemptOnly = buildEasPurchase(
      {
        date: "2026-10-05",
        supplierName: "Exentos SA",
        supplierRuc: "77777701-0",
        voucherNumber: "001-002-99",
        timbrado: "11223344",
        exempt: 8000,
      },
      2,
      "2026-10-05T00:00:00.000Z"
    );
    const noTimbrado = buildEasPurchase(
      {
        date: "2026-10-06",
        supplierName: "Sin Timbre",
        supplierRuc: "66666601-6",
        voucherNumber: "001-001-0000099",
        taxed10: 10000,
      },
      3,
      "2026-10-06T00:00:00.000Z"
    );
    const badNumber = buildEasPurchase(
      {
        date: "2026-10-07",
        supplierName: "Mal Número",
        supplierRuc: "66666601-6",
        voucherNumber: "123",
        timbrado: "12345678",
        taxed10: 5000,
      },
      4,
      "2026-10-07T00:00:00.000Z"
    );
    expect(good.timbrado).toBe("87654321");

    const source = monthBooks({ purchases: [good, exemptOnly, noTimbrado, badNumber] });
    expect(ledgerTotals(source.ledger).debit).toBe(ledgerTotals(source.ledger).credit);
    const pkg = buildMonthPackage(source);
    const comprasBytes = pkg.files.find((item) => item.name === "hechauka-compras-202610.txt")!.bytes;
    expect(comprasBytes[0]).toBe(0x31);
    const rows = parseTsv(textOf(pkg, "hechauka-compras-202610.txt"));
    const header = rows[0];
    const details = rows.slice(1);
    expect(header.slice(0, 5)).toEqual(["1", "202610", "1", "911", "211"]);
    expect(header[13]).toBe("NO");
    expect(header[14]).toBe("2");
    expect(details).toHaveLength(2);
    expect(header[11]).toBe("2");
    const sinIva = details.reduce((sum, row) => sum + Number(row[8]) + Number(row[10]) + Number(row[12]), 0);
    expect(Number(header[12])).toBe(sinIva);
    expect(sinIva).toBe(133000);

    const mixed = details.find((row) => row[3] === "Química SA")!;
    expect(mixed[4]).toBe("87654321");
    expect(mixed[5]).toBe("1");
    expect(mixed[6]).toBe("001-001-0000123");
    expect(mixed[7]).toBe("04/10/2026");
    expect(mixed[13]).toBe("8");
    expect(mixed[14]).toBe("1");
    expect(mixed[15]).toBe("0");
    expect(details.find((row) => row[3] === "Exentos SA")![13]).toBe("11");
    expect(textOf(pkg, "hechauka-compras-202610.txt")).not.toContain("Sin Timbre");
    expect(textOf(pkg, "hechauka-compras-202610.txt")).not.toContain("\t123\t");

    const comprasFile = pkg.files.find((item) => item.name === "compras-202610.csv")!;
    expect(Array.from(comprasFile.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const comprasCsv = textOf(pkg, "compras-202610.csv");
    expect(comprasCsv).toContain("Sin Timbre");
    expect(comprasCsv).toContain("123");
    expect(comprasCsv).toContain("Química SA");

    const leeme = textOf(pkg, "LEEME.txt");
    expect(leeme).toContain("Sin Timbre");
    expect(leeme).toContain("Mal Número");
    expect(leeme).toContain("no transmite");
    expect(pkg.exclusions.some((item) => item.includes("timbrado"))).toBe(true);
    expect(pkg.exclusions.some((item) => item.includes("###-###"))).toBe(true);
  });

  it("sin timbrado ni representante omite los TXT y deja los CSV", () => {
    const pkg = buildMonthPackage(
      monthBooks({
        profile: { timbrado: "", repName: "", repRuc: "" },
        sales: [sale({ clientTaxId: "66666601-6" })],
        purchases: [
          buildEasPurchase(
            {
              date: "2026-10-06",
              supplierName: "Sin Timbre",
              supplierRuc: "66666601-6",
              voucherNumber: "001-001-0000099",
              taxed10: 10000,
            },
            3,
            "2026-10-06T00:00:00.000Z"
          ),
        ],
      })
    );
    const names = pkg.files.map((file) => file.name);
    expect(pkg.hechaukaIncluded).toBe(false);
    expect(names.some((name) => name.startsWith("hechauka-"))).toBe(false);
    for (const name of CSV_NAMES) expect(names).toContain(name);
    const leeme = textOf(pkg, "LEEME.txt");
    expect(leeme).toMatch(/timbrado/i);
    expect(leeme).toMatch(/representante/i);
    expect(leeme).toContain("Sin Timbre");
    expect(pkg.blockers.some((item) => item.includes("representante"))).toBe(true);
    expect(pkg.blockers.some((item) => item.includes("timbrado"))).toBe(true);
    expect(textOf(pkg, "ventas-202610.csv")).toContain("CS-000001");
  });

  it("RESIMPLE no arma los formularios 211 y 221", () => {
    const pkg = buildMonthPackage(
      monthBooks({
        profile: { regime: "resimple" },
        sales: [sale({ clientTaxId: "66666601-6" })],
      })
    );
    expect(pkg.files.map((file) => file.name).some((name) => name.includes("211") || name.startsWith("hechauka-"))).toBe(false);
    expect(textOf(pkg, "LEEME.txt")).toContain("RESIMPLE");
    expect(textOf(pkg, "ventas-202610.csv")).toContain("CS-000001");
    expect(textOf(pkg, "posicion-iva-202610.csv")).toContain("No");
    for (const name of CSV_NAMES) expect(pkg.files.map((file) => file.name)).toContain(name);
  });

  it("el ZIP STORE trae los archivos y el CRC cierra", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const pkg = buildMonthPackage(
      monthBooks({
        sales: [
          sale({ clientTaxId: "66666601-6" }),
          sale({ number: "CS-000002", clientName: "Calle", clientTaxId: "" }),
        ],
        purchases: [
          buildEasPurchase(
            {
              date: "2026-10-04",
              supplierName: "Química SA",
              supplierRuc: "88888801-5",
              voucherNumber: "001-001-0000123",
              timbrado: "87654321",
              taxed10: 100000,
            },
            1,
            "2026-10-04T00:00:00.000Z"
          ),
        ],
      })
    );
    expect(pkg.zipName).toBe("presentacion-202610.zip");
    const zip = buildStoreZip(pkg.files);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
    const method = zip[8] | (zip[9] << 8);
    expect(method).toBe(0);

    let offset = 0;
    const found: string[] = [];
    while (offset + 30 < zip.length) {
      const sig = (zip[offset] | (zip[offset + 1] << 8) | (zip[offset + 2] << 16) | (zip[offset + 3] << 24)) >>> 0;
      if (sig !== 0x04034b50) break;
      const crc = (zip[offset + 14] | (zip[offset + 15] << 8) | (zip[offset + 16] << 16) | (zip[offset + 17] << 24)) >>> 0;
      const size = (zip[offset + 18] | (zip[offset + 19] << 8) | (zip[offset + 20] << 16) | (zip[offset + 21] << 24)) >>> 0;
      const nameLen = zip[offset + 26] | (zip[offset + 27] << 8);
      const extraLen = zip[offset + 28] | (zip[offset + 29] << 8);
      const name = new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLen));
      const dataStart = offset + 30 + nameLen + extraLen;
      const data = zip.slice(dataStart, dataStart + size);
      expect(zip[offset + 8] | (zip[offset + 9] << 8)).toBe(0);
      expect(crc32(data)).toBe(crc);
      found.push(name);
      offset = dataStart + size;
    }
    const central = (zip[offset] | (zip[offset + 1] << 8) | (zip[offset + 2] << 16) | (zip[offset + 3] << 24)) >>> 0;
    expect(central).toBe(0x02014b50);
    expect(found).toEqual(pkg.files.map((file) => file.name));
    expect(found).toContain("hechauka-compras-202610.txt");
    expect(found).toContain("hechauka-ventas-202610.txt");
    for (const name of CSV_NAMES) expect(found).toContain(name);

    const dir = mkdtempSync(join(tmpdir(), "hechauka-"));
    try {
      const file = join(dir, "presentacion-202610.zip");
      writeFileSync(file, zip);
      const listing = execFileSync(
        "python3",
        [
          "-c",
          `
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
if bad:
    raise SystemExit("crc " + bad)
for info in z.infolist():
    if info.compress_type != zipfile.ZIP_STORED:
        raise SystemExit("method " + info.filename)
    print(info.filename)
`,
          file,
        ],
        { encoding: "utf8" }
      );
      for (const name of found) expect(listing).toContain(name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
