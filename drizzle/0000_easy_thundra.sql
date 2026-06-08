CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`model` text NOT NULL,
	`year` integer NOT NULL,
	`price` integer NOT NULL,
	`mileage` integer NOT NULL,
	`province` text NOT NULL,
	`condition` text NOT NULL,
	`transmission` text NOT NULL,
	`colour` text NOT NULL,
	`description` text NOT NULL,
	`photos` text NOT NULL,
	`seller_name` text NOT NULL,
	`seller_email` text NOT NULL,
	`seller_phone` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listings_slug_unique` ON `listings` (`slug`);