
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `openstudy_dev` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `openstudy_dev`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alembic_version` (
  `version_num` varchar(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` text NOT NULL,
  `subject` text NOT NULL,
  `grades` json DEFAULT NULL,
  `period` text,
  `room` text,
  `weekdays` json DEFAULT NULL,
  `max_students` int DEFAULT NULL,
  `status` enum('DRAFT','ACTIVE','ARCHIVED') NOT NULL,
  `teacher_id` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `ix_courses_teacher_id` (`teacher_id`),
  CONSTRAINT `courses_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_courses_max_students_positive` CHECK (((`max_students` is null) or (`max_students` >= 1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `enrollments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `student_id` bigint NOT NULL,
  `course_id` bigint NOT NULL,
  `enrolled_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enrollments_student_course` (`student_id`,`course_id`),
  KEY `ix_enrollments_student_id` (`student_id`),
  KEY `ix_enrollments_course_id` (`course_id`),
  CONSTRAINT `enrollments_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `enrollments_ibfk_2` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lab_registries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `registry_key` varchar(128) NOT NULL,
  `title` varchar(255) NOT NULL,
  `subject` varchar(64) DEFAULT NULL,
  `type` text,
  `renderer_profile` text,
  `initial_state` json DEFAULT NULL,
  `reducer_spec` json DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `status` enum('DRAFT','PUBLISHED','DEPRECATED') NOT NULL,
  `teacher_id` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `registry_key` (`registry_key`),
  UNIQUE KEY `uq_lab_registries_title_subject` (`title`,`subject`),
  KEY `ix_lab_registries_teacher_id` (`teacher_id`),
  CONSTRAINT `lab_registries_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lesson_decks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `title` text NOT NULL,
  `subject` text NOT NULL,
  `grade` text,
  `deck_source` enum('KB_AI','PPT_IMPORT','HYBRID','MANUAL') NOT NULL,
  `status` enum('DRAFT','PUBLISHED') NOT NULL,
  `teacher_id` bigint NOT NULL,
  `thumbnail` text,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `ix_lesson_decks_teacher_id` (`teacher_id`),
  CONSTRAINT `lesson_decks_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `paper_question_options` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `question_id` bigint NOT NULL,
  `option_key` varchar(8) NOT NULL,
  `option_text` text NOT NULL,
  `is_correct` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_paper_question_options_key` (`question_id`,`option_key`),
  KEY `ix_paper_question_options_question_id` (`question_id`),
  CONSTRAINT `paper_question_options_ibfk_1` FOREIGN KEY (`question_id`) REFERENCES `paper_questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `paper_questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `paper_id` bigint NOT NULL,
  `section_id` bigint NOT NULL,
  `order_num` int NOT NULL,
  `question_type` text NOT NULL,
  `prompt` text NOT NULL,
  `difficulty` text,
  `score` decimal(6,2) NOT NULL,
  `answer_text` text,
  `explanation` text,
  `chapter` text,
  `bank_question_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_paper_questions_paper_order` (`paper_id`,`order_num`),
  KEY `ix_paper_questions_paper_id` (`paper_id`),
  KEY `ix_paper_questions_section_id` (`section_id`),
  KEY `ix_paper_questions_bank_question_id` (`bank_question_id`),
  CONSTRAINT `fk_paper_questions_bank_question_id_question_bank_items` FOREIGN KEY (`bank_question_id`) REFERENCES `question_bank_items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `paper_questions_ibfk_1` FOREIGN KEY (`paper_id`) REFERENCES `papers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `paper_questions_ibfk_2` FOREIGN KEY (`section_id`) REFERENCES `paper_sections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_paper_questions_order_positive` CHECK ((`order_num` >= 1)),
  CONSTRAINT `ck_paper_questions_score_non_negative` CHECK ((`score` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `paper_sections` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `paper_id` bigint NOT NULL,
  `title` text NOT NULL,
  `section_order` int NOT NULL,
  `question_type` text NOT NULL,
  `question_count` int NOT NULL,
  `score_each` decimal(6,2) NOT NULL,
  `total_score` decimal(8,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_paper_sections_paper_order` (`paper_id`,`section_order`),
  KEY `ix_paper_sections_paper_id` (`paper_id`),
  CONSTRAINT `paper_sections_ibfk_1` FOREIGN KEY (`paper_id`) REFERENCES `papers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_paper_sections_order_positive` CHECK ((`section_order` >= 1)),
  CONSTRAINT `ck_paper_sections_question_count_non_negative` CHECK ((`question_count` >= 0)),
  CONSTRAINT `ck_paper_sections_score_each_non_negative` CHECK ((`score_each` >= 0)),
  CONSTRAINT `ck_paper_sections_total_score_non_negative` CHECK ((`total_score` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `papers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `title` text NOT NULL,
  `course_id` bigint NOT NULL,
  `grade` text NOT NULL,
  `subject` text NOT NULL,
  `semester` text,
  `exam_type` text NOT NULL,
  `total_score` int NOT NULL,
  `duration_min` int NOT NULL,
  `question_count` int NOT NULL,
  `quality_score` int DEFAULT NULL,
  `status` enum('DRAFT','PUBLISHED','ARCHIVED') NOT NULL,
  `created_by` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  `published_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_papers_course_id` (`course_id`),
  KEY `ix_papers_created_by` (`created_by`),
  CONSTRAINT `ck_papers_duration_non_negative` CHECK ((`duration_min` >= 0)),
  CONSTRAINT `ck_papers_quality_score_range` CHECK (((`quality_score` is null) or ((`quality_score` >= 0) and (`quality_score` <= 100)))),
  CONSTRAINT `ck_papers_question_count_non_negative` CHECK ((`question_count` >= 0)),
  CONSTRAINT `ck_papers_total_score_non_negative` CHECK ((`total_score` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question_attempt_answers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `attempt_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `selected_option` text,
  `text_answer` text,
  `is_correct` tinyint(1) DEFAULT NULL,
  `awarded_score` decimal(6,2) DEFAULT NULL,
  `teacher_feedback` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_question_attempt_answers_attempt_question` (`attempt_id`,`question_id`),
  KEY `ix_question_attempt_answers_attempt_id` (`attempt_id`),
  KEY `ix_question_attempt_answers_question_id` (`question_id`),
  CONSTRAINT `question_attempt_answers_ibfk_1` FOREIGN KEY (`attempt_id`) REFERENCES `question_attempts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `question_attempt_answers_ibfk_2` FOREIGN KEY (`question_id`) REFERENCES `paper_questions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_attempt_answers_awarded_score_non_negative` CHECK (((`awarded_score` is null) or (`awarded_score` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question_attempts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `question_id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `score` decimal(8,2) DEFAULT NULL,
  `status` enum('IN_PROGRESS','SUBMITTED','GRADED') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_question_attempts_question_student` (`question_id`,`student_id`),
  KEY `ix_question_attempts_question_id` (`question_id`),
  KEY `ix_question_attempts_student_id` (`student_id`),
  CONSTRAINT `question_attempts_ibfk_1` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_question_attempts_score_non_negative` CHECK (((`score` is null) or (`score` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question_bank_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `publisher` text,
  `grade` text NOT NULL,
  `subject` text NOT NULL,
  `semester` text,
  `question_type` text NOT NULL,
  `prompt` text NOT NULL,
  `difficulty` text,
  `answer_text` text,
  `explanation` text,
  `chapter` text,
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  `source_type` varchar(32) NOT NULL DEFAULT 'manual',
  `source_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_question_bank_items_created_by` (`created_by`),
  KEY `ix_question_bank_items_source_id` (`source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question_bank_options` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `bank_question_id` bigint NOT NULL,
  `option_key` varchar(8) NOT NULL,
  `option_text` text NOT NULL,
  `is_correct` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_question_bank_options_key` (`bank_question_id`,`option_key`),
  KEY `ix_question_bank_options_bank_question_id` (`bank_question_id`),
  CONSTRAINT `question_bank_options_ibfk_1` FOREIGN KEY (`bank_question_id`) REFERENCES `question_bank_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `question_id` bigint NOT NULL,
  `bank_question_id` bigint NOT NULL,
  `order_num` int NOT NULL,
  `score` decimal(6,2) NOT NULL,
  `prompt_snapshot` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_question_items_order` (`question_id`,`order_num`),
  KEY `ix_question_items_question_id` (`question_id`),
  KEY `ix_question_items_bank_question_id` (`bank_question_id`),
  CONSTRAINT `question_items_ibfk_1` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `question_items_ibfk_2` FOREIGN KEY (`bank_question_id`) REFERENCES `question_bank_items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_question_items_order_positive` CHECK ((`order_num` >= 1)),
  CONSTRAINT `ck_question_items_score_non_negative` CHECK ((`score` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `title` text NOT NULL,
  `course_id` bigint NOT NULL,
  `due_at` datetime DEFAULT NULL,
  `duration_min` int DEFAULT NULL,
  `total_score` int NOT NULL,
  `status` enum('DRAFT','PUBLISHED','CLOSED') NOT NULL,
  `created_by` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `ix_questions_course_id` (`course_id`),
  KEY `ix_questions_created_by` (`created_by`),
  CONSTRAINT `ck_questions_duration_non_negative` CHECK (((`duration_min` is null) or (`duration_min` >= 0))),
  CONSTRAINT `ck_questions_total_score_non_negative` CHECK ((`total_score` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slide_blocks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `slide_id` bigint NOT NULL,
  `block_type` enum('TEXT','INTERACTIVE','EXERCISE_WALKTHROUGH','IMAGE') NOT NULL,
  `content` text,
  `extra_payload` json DEFAULT NULL,
  `order_num` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slide_blocks_slide_order` (`slide_id`,`order_num`),
  KEY `ix_slide_blocks_slide_id` (`slide_id`),
  CONSTRAINT `slide_blocks_ibfk_1` FOREIGN KEY (`slide_id`) REFERENCES `slides` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_slide_blocks_order_positive` CHECK ((`order_num` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slides` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `deck_id` bigint NOT NULL,
  `title` text,
  `order_num` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slides_deck_order` (`deck_id`,`order_num`),
  KEY `ix_slides_deck_id` (`deck_id`),
  CONSTRAINT `slides_ibfk_1` FOREIGN KEY (`deck_id`) REFERENCES `lesson_decks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_slides_order_positive` CHECK ((`order_num` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_profiles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `student_id` varchar(64) NOT NULL,
  `department` text,
  `major` text,
  `homeroom` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_id` (`student_id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `student_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_profiles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `employee_id` varchar(64) NOT NULL,
  `department` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_id` (`employee_id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `uq_teacher_profiles_user_employee` (`user_id`,`employee_id`),
  CONSTRAINT `teacher_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `textbooks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `publisher` varchar(128) NOT NULL,
  `grade` varchar(32) NOT NULL,
  `subject` varchar(64) NOT NULL,
  `semester` enum('VOL1','VOL2') NOT NULL,
  `content` text NOT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_textbooks_identity` (`publisher`,`grade`,`subject`,`semester`),
  KEY `ix_textbooks_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `account_id` varchar(64) NOT NULL,
  `hashed_password` text NOT NULL,
  `name` text NOT NULL,
  `account_type` enum('STUDENT','TEACHER','ADMIN') NOT NULL,
  `phone` text,
  `id_card` text,
  `accessibility` text,
  `registered_at` datetime NOT NULL DEFAULT (now()),
  `last_login` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_id` (`account_id`),
  KEY `ix_users_account_type` (`account_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

