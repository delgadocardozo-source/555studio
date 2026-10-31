CREATE TABLE `washer_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `washer_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `washer_links_token_unique` UNIQUE(`token`)
);
