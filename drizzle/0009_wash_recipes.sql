CREATE TABLE `wash_recipe_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleType` enum('auto','camioneta') NOT NULL,
	`itemId` int NOT NULL,
	`quantityPerVehicle` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wash_recipe_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wash_stock_consumptions` (
	`appointmentId` int NOT NULL,
	`notes` text,
	`consumedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wash_stock_consumptions_appointmentId` PRIMARY KEY(`appointmentId`)
);
