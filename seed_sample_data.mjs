import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no encontrada");
    process.exit(1);
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  const sampleData = [
    {
      code: "555-20260924-1011",
      clientName: "Rodrigo Benítez",
      clientPhone: "0981 450 120",
      clientType: "particular",
      companyName: null,
      vehicleType: "auto",
      vehicleModel: "Toyota Corolla (Blanco)",
      licensePlate: "AAY 412",
      servicePrice: 90000,
      cityZone: "Asuncion",
      address: "Avda. Santa Teresa c/ Herminio Maldonado",
      addressReference: "Cochera exterior Edificio Plaza Center",
      scheduledDate: "2026-09-24",
      timeSlot: "08:30 - 10:00",
      appointmentStatus: "confirmado",
      notes: "Priorizar limpieza de alfombras delanteras",
      source: "interno_manual",
    },
    {
      code: "555-20260924-1012",
      clientName: "Lic. María Elena Gómez",
      clientPhone: "0971 882 340",
      clientType: "oficina",
      companyName: "Estudio Gómez & Asoc.",
      vehicleType: "camioneta",
      vehicleModel: "Hyundai Santa Fe (Gris)",
      licensePlate: "BCK 890",
      servicePrice: 120000,
      cityZone: "Luque",
      address: "Gral. Aquino c/ Rosario",
      addressReference: "Estacionamiento de visitas, frente al estudio",
      scheduledDate: "2026-09-24",
      timeSlot: "10:30 - 12:00",
      appointmentStatus: "pendiente",
      notes: "Llamar 10 min antes al llegar a la caseta",
      source: "interno_manual",
    },
    {
      code: "555-20260924-1013",
      clientName: "Ing. Carlos Villalba",
      clientPhone: "0992 314 550",
      clientType: "empresa_flota",
      companyName: "Logística Central S.A.",
      vehicleType: "camioneta",
      vehicleModel: "Toyota Hilux D/C (Negro)",
      licensePlate: "CCD 555",
      servicePrice: 120000,
      cityZone: "Mariano Roque Alonso",
      address: "Ruta Transchaco km 14.5",
      addressReference: "Patio operativo de la distribuidora",
      scheduledDate: "2026-09-24",
      timeSlot: "14:00 - 15:30",
      appointmentStatus: "en_proceso",
      notes: "Vehículo con barro moderado post lluvia",
      source: "interno_manual",
    },
    {
      code: "555-20260925-1014",
      clientName: "Camila Duarte",
      clientPhone: "0982 771 900",
      clientType: "particular",
      companyName: null,
      vehicleType: "auto",
      vehicleModel: "Kia Rio Hatchback (Rojo)",
      licensePlate: "AAF 319",
      servicePrice: 90000,
      cityZone: "San Lorenzo",
      address: "Calle Julia Miranda Cueto c/ España",
      addressReference: "Casa con reja negra y timbre blanco",
      scheduledDate: "2026-09-25",
      timeSlot: "09:00 - 10:30",
      appointmentStatus: "confirmado",
      notes: "Canilla de agua disponible en garaje",
      source: "interno_manual",
    },
    {
      code: "555-20260925-1015",
      clientName: "Martín Insfrán",
      clientPhone: "0985 621 144",
      clientType: "oficina",
      companyName: "Hub Creativo",
      vehicleType: "auto",
      vehicleModel: "Volkswagen Golf (Gris Grafito)",
      licensePlate: "BBY 704",
      servicePrice: 90000,
      cityZone: "Asuncion",
      address: "Avda. Mariscal López y Cruz del Chaco",
      addressReference: "Cochera techada subsuelo 1",
      scheduledDate: "2026-09-25",
      timeSlot: "15:00 - 16:30",
      appointmentStatus: "pendiente",
      notes: "No usar silicona aceitosa en el tablero",
      source: "interno_manual",
    },
    {
      code: "555-20260923-1009",
      clientName: "Distribuidora del Este",
      clientPhone: "0983 112 233",
      clientType: "empresa_flota",
      companyName: "Distribuidora del Este S.R.L.",
      vehicleType: "camioneta",
      vehicleModel: "Ford Ranger XLS",
      licensePlate: "CFE 102",
      servicePrice: 120000,
      cityZone: "Luque",
      address: "Autopista Silvio Pettirossi",
      addressReference: "Depósito 3",
      scheduledDate: "2026-09-23",
      timeSlot: "11:00 - 12:30",
      appointmentStatus: "finalizado",
      notes: "Servicio entregado a conformidad",
      source: "interno_manual",
    }
  ];

  for (const item of sampleData) {
    await connection.execute(
      `INSERT IGNORE INTO appointments (
        code, clientName, clientPhone, clientType, companyName,
        vehicleType, vehicleModel, licensePlate, servicePrice,
        cityZone, address, addressReference, scheduledDate,
        timeSlot, appointmentStatus, notes, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.code,
        item.clientName,
        item.clientPhone,
        item.clientType,
        item.companyName,
        item.vehicleType,
        item.vehicleModel,
        item.licensePlate,
        item.servicePrice,
        item.cityZone,
        item.address,
        item.addressReference,
        item.scheduledDate,
        item.timeSlot,
        item.appointmentStatus,
        item.notes,
        item.source,
      ]
    );
  }

  console.log("Datos de prueba sembrados exitosamente.");
  await connection.end();
}

seed().catch(err => {
  console.error("Error sembrando datos:", err);
  process.exit(1);
});
