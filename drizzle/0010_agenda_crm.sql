ALTER TABLE `customers` ADD `vehiclesJson` text;
--> statement-breakpoint
ALTER TABLE `customers` ADD `freeWashCredits` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `lastWashAt` varchar(10);
--> statement-breakpoint
ALTER TABLE `customers` ADD `lastReminderAt` timestamp;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `loyaltyFree` int DEFAULT 0 NOT NULL;
