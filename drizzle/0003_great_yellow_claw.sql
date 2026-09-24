ALTER TABLE `appointments` ADD `paymentStatus` enum('sin_definir','pagado','falta_pagar') DEFAULT 'sin_definir' NOT NULL;--> statement-breakpoint
ALTER TABLE `appointments` ADD `paymentMethod` enum('efectivo','comprobante_digital');--> statement-breakpoint
ALTER TABLE `appointments` ADD `paymentReceiptUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `appointments` ADD `paymentReceiptName` varchar(255);--> statement-breakpoint
ALTER TABLE `appointments` ADD `paymentDeclaredAt` timestamp;