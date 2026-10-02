CREATE TABLE `staff_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`role` varchar(80) NOT NULL,
	`payType` enum('diario','semanal','quincenal','mensual','variable') NOT NULL DEFAULT 'quincenal',
	`baseAmount` int,
	`active` int NOT NULL DEFAULT 1,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffId` int NOT NULL,
	`staffName` varchar(120) NOT NULL,
	`amount` int NOT NULL,
	`paymentDate` varchar(10) NOT NULL,
	`concept` varchar(80) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_payments_id` PRIMARY KEY(`id`)
);
