CREATE TABLE `cash_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('ingreso','egreso') NOT NULL,
	`amount` int NOT NULL,
	`movementDate` varchar(10) NOT NULL,
	`person` varchar(120) NOT NULL,
	`category` varchar(80) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_movements_id` PRIMARY KEY(`id`)
);
