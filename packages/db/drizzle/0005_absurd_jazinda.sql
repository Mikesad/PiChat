ALTER TABLE `knowledge_bases` ADD `retrieval_top_k` int DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD `retrieval_similarity_threshold` double DEFAULT 0.2 NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD `retrieval_vector_weight` double DEFAULT 0.3 NOT NULL;