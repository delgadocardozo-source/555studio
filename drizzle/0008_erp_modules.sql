CREATE TABLE `inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`category` varchar(80) NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'unid',
	`stock` int NOT NULL DEFAULT 0,
	`minStock` int NOT NULL DEFAULT 0,
	`unitCost` int,
	`notes` text,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`itemName` varchar(120) NOT NULL,
	`type` enum('entrada','salida','ajuste') NOT NULL,
	`quantity` int NOT NULL,
	`movementDate` varchar(10) NOT NULL,
	`notes` text,
	`stockAfter` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`phone` varchar(40) NOT NULL DEFAULT '',
	`category` varchar(80) NOT NULL DEFAULT 'Otros',
	`notes` text,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receivables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientName` varchar(120) NOT NULL,
	`clientPhone` varchar(40) NOT NULL DEFAULT '',
	`concept` varchar(160) NOT NULL,
	`amount` int NOT NULL,
	`amountPaid` int NOT NULL DEFAULT 0,
	`dueDate` varchar(10) NOT NULL,
	`status` enum('pendiente','parcial','cobrado','anulado') NOT NULL DEFAULT 'pendiente',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receivables_id` PRIMARY KEY(`id`)
);
