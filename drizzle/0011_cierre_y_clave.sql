CREATE TABLE `staff_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pinSalt` varchar(64) NOT NULL,
	`pinHash` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_access_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cash_day_closes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`closeDate` varchar(10) NOT NULL,
	`countedAmount` int NOT NULL,
	`note` text,
	`efectivoIn` int NOT NULL DEFAULT 0,
	`comprobanteIn` int NOT NULL DEFAULT 0,
	`egresos` int NOT NULL DEFAULT 0,
	`expectedDrawer` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_day_closes_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_day_closes_closeDate_unique` UNIQUE(`closeDate`)
);
