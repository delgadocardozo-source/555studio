CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phoneKey` varchar(40) NOT NULL,
	`clientName` varchar(160) NOT NULL,
	`clientPhone` varchar(40) NOT NULL,
	`clientType` enum('particular','oficina','empresa_flota') NOT NULL DEFAULT 'particular',
	`companyName` varchar(160),
	`clientTaxId` varchar(40),
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_phoneKey_unique` UNIQUE(`phoneKey`)
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD `clientTaxId` varchar(40);