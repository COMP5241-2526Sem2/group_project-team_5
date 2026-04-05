mysqldump: [Warning] Using a password on the command line interface can be insecure.
-- MySQL dump 10.13  Distrib 8.4.8, for Linux (x86_64)
--
-- Host: localhost    Database: openstudy_dev
-- ------------------------------------------------------
-- Server version	8.4.8

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

--
-- Table structure for table `alembic_version`
--

DROP TABLE IF EXISTS `alembic_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alembic_version` (
  `version_num` varchar(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alembic_version`
--

LOCK TABLES `alembic_version` WRITE;
/*!40000 ALTER TABLE `alembic_version` DISABLE KEYS */;
INSERT INTO `alembic_version` VALUES ('d8f1a2c3b4e5');
/*!40000 ALTER TABLE `alembic_version` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
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

--
-- Dumping data for table `courses`
--

LOCK TABLES `courses` WRITE;
/*!40000 ALTER TABLE `courses` DISABLE KEYS */;
/*!40000 ALTER TABLE `courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `enrollments`
--

DROP TABLE IF EXISTS `enrollments`;
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

--
-- Dumping data for table `enrollments`
--

LOCK TABLES `enrollments` WRITE;
/*!40000 ALTER TABLE `enrollments` DISABLE KEYS */;
/*!40000 ALTER TABLE `enrollments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lab_registries`
--

DROP TABLE IF EXISTS `lab_registries`;
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

--
-- Dumping data for table `lab_registries`
--

LOCK TABLES `lab_registries` WRITE;
/*!40000 ALTER TABLE `lab_registries` DISABLE KEYS */;
/*!40000 ALTER TABLE `lab_registries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lesson_decks`
--

DROP TABLE IF EXISTS `lesson_decks`;
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

--
-- Dumping data for table `lesson_decks`
--

LOCK TABLES `lesson_decks` WRITE;
/*!40000 ALTER TABLE `lesson_decks` DISABLE KEYS */;
/*!40000 ALTER TABLE `lesson_decks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `paper_question_options`
--

DROP TABLE IF EXISTS `paper_question_options`;
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

--
-- Dumping data for table `paper_question_options`
--

LOCK TABLES `paper_question_options` WRITE;
/*!40000 ALTER TABLE `paper_question_options` DISABLE KEYS */;
/*!40000 ALTER TABLE `paper_question_options` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `paper_questions`
--

DROP TABLE IF EXISTS `paper_questions`;
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
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `paper_questions`
--

LOCK TABLES `paper_questions` WRITE;
/*!40000 ALTER TABLE `paper_questions` DISABLE KEYS */;
INSERT INTO `paper_questions` VALUES (1,1,1,1,'SHORT_ANSWER','The diagram below shows four types of human teeth.','medium',1.00,'TBD','TBD',NULL,13),(2,1,1,2,'SHORT_ANSWER','Which of t he following events ensure that the food bolus enter s the oesophagus during the process of','medium',1.00,'TBD','TBD',NULL,14),(3,1,1,3,'SHORT_ANSWER','Which of the following combinations correctly matches the organisms with their modes of nutrition?','medium',1.00,'TBD','TBD',NULL,15),(4,1,1,4,'SHORT_ANSWER','Which of the following are the functions of hydrochloric acid in the gastric juice?','medium',1.00,'TBD','TBD',NULL,16),(5,1,1,5,'SHORT_ANSWER','Which of the following is the function of the cardiac sphincter of the stomach?','medium',1.00,'TBD','TBD',NULL,17),(6,1,1,6,'SHORT_ANSWER','The graph below shows the digestion of three types of food substances (X, Y and Z) along the alimentary','medium',1.00,'TBD','TBD',NULL,18),(7,1,1,7,'SHORT_ANSWER','In an experiment, four wells are made in a starch agar plate and each well is filled with a different solution','medium',1.00,'TBD','TBD',NULL,19),(8,1,1,8,'SHORT_ANSWER','Which of t he following events ensure that the food bolus enters the oesophagus  during the process of','medium',1.00,'TBD','TBD',NULL,20),(9,2,2,1,'SHORT_ANSWER','Graph and proportion','medium',1.00,'TBD','TBD',NULL,21),(10,2,2,2,'SHORT_ANSWER','The liquid column in an unmarked liquid in glass thermometer has different lengths L when the','medium',1.00,'TBD','TBD',NULL,22),(11,2,2,3,'SHORT_ANSWER','The length of the mercury thread in a mercury-in-glass thermometer are 2 cm and 8 cm at 0 oC','medium',1.00,'TBD','TBD',NULL,23),(12,2,2,4,'SHORT_ANSWER','The markings on a calibrated thermometer have faded away. We know that the column lengths','medium',1.00,'TBD','TBD',NULL,24),(13,2,2,5,'SHORT_ANSWER','A certain wire has a resistance of 9Ω at 0 oC and 14Ω at 150 oC. When the wire is placed in','medium',1.00,'TBD','TBD',NULL,25),(14,2,2,6,'SHORT_ANSWER','Scientific notation and unit conversion','medium',1.00,'TBD','TBD',NULL,26),(15,2,2,7,'SHORT_ANSWER','Express the following terms in Joule J with correct notation.','medium',1.00,'TBD','TBD',NULL,27),(16,2,2,8,'SHORT_ANSWER','5 2.5 1','medium',1.00,'TBD','TBD',NULL,28),(17,2,2,9,'SHORT_ANSWER','Express the following terms in kWh','medium',1.00,'TBD','TBD',NULL,29),(18,3,3,1,'SHORT_ANSWER','For each of the structures listed in Column 1, select from Column 2 one biological process that matches','medium',1.00,'TBD','TBD',NULL,30),(19,3,3,2,'SHORT_ANSWER','People with lactose intolerance failed to produce sufficient lactase in small intestine.','medium',1.00,'TBD','TBD',NULL,31),(20,3,3,3,'SHORT_ANSWER','Each pollen mother cell undergoes meiotic cell division to form pollen grains. The photomicrographs','medium',1.00,'TBD','TBD',NULL,32),(21,3,3,4,'SHORT_ANSWER','A group of scientists have studied the succession of a forest since it was cleared by wildfire twenty','medium',1.00,'TBD','TBD',NULL,33),(22,3,3,5,'SHORT_ANSWER','Paper is mostly composed of cellulose. Cellulose cannot be digested by most animals as they lack the','medium',1.00,'TBD','TBD',NULL,34),(23,3,3,6,'SHORT_ANSWER','The following photomicrograph shows a transverse section of human testis.','medium',1.00,'TBD','TBD',NULL,35),(24,3,3,7,'SHORT_ANSWER','Rheumatoid arthritis is a disease of the joints in the human body. It is an auto-immune disease where','medium',1.00,'TBD','TBD',NULL,36),(25,3,3,8,'SHORT_ANSWER','The flow chart below outlines how two hormones, A and B, are involved in the regulation of blood','medium',1.00,'TBD','TBD',NULL,37),(26,3,3,9,'SHORT_ANSWER','The Chan family claims that baby Jane, given to them at U hospital, does not belong to them and that','medium',1.00,'TBD','TBD',NULL,38),(27,3,3,10,'SHORT_ANSWER','The rock pocket mouse is found in rocky outcrops in the Sonoran desert of the southwestern United','medium',1.00,'TBD','TBD',NULL,39),(28,3,3,11,'SHORT_ANSWER','In terrestrial flowering plants such as our school’s White Jade Lily tree, photosynthesis mainly takes','medium',1.00,'TBD','TBD',NULL,40),(29,4,4,1,'SHORT_ANSWER','Q1. [NO_TEXT_EXTRACTED] Placeholder question','medium',1.00,'TBD','TBD',NULL,41),(30,5,5,1,'SHORT_ANSWER','100% glucose?              (2 marks)','medium',2.00,'TBD','TBD',NULL,42),(31,6,6,1,'SHORT_ANSWER','There are TWO sections A and D in this pa per.  Answer ALL questions in the TWO','medium',1.00,'TBD','TBD',NULL,43),(32,6,6,2,'SHORT_ANSWER','Write your answers in the answer book provided. Start each question (not part of a question)','medium',1.00,'TBD','TBD',NULL,44),(33,6,6,3,'SHORT_ANSWER','Present your answers in paragraphs wherever appropriate.','medium',1.00,'TBD','TBD',NULL,45),(34,6,6,4,'SHORT_ANSWER','Illustrate your answers with diagrams wherever appropriate.','medium',1.00,'TBD','TBD',NULL,46),(35,6,6,5,'SHORT_ANSWER','The diagrams in this section are NOT necessarily drawn to scale.','medium',1.00,'TBD','TBD',NULL,47),(36,6,6,6,'SHORT_ANSWER','Supplementary answer sheets will be provided on request.  Write your class, class number','medium',1.00,'TBD','TBD',NULL,48);
/*!40000 ALTER TABLE `paper_questions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `paper_sections`
--

DROP TABLE IF EXISTS `paper_sections`;
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `paper_sections`
--

LOCK TABLES `paper_sections` WRITE;
/*!40000 ALTER TABLE `paper_sections` DISABLE KEYS */;
INSERT INTO `paper_sections` VALUES (1,1,'Main',1,'MIXED',8,1.00,8.00),(2,2,'Main',1,'MIXED',9,1.00,9.00),(3,3,'Main',1,'MIXED',11,1.00,11.00),(4,4,'Main',1,'MIXED',1,1.00,1.00),(5,5,'Main',1,'MIXED',1,1.00,2.00),(6,6,'Main',1,'MIXED',6,1.00,6.00);
/*!40000 ALTER TABLE `paper_sections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `papers`
--

DROP TABLE IF EXISTS `papers`;
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `papers`
--

LOCK TABLES `papers` WRITE;
/*!40000 ALTER TABLE `papers` DISABLE KEYS */;
INSERT INTO `papers` VALUES (1,'2024-2025 S3 bio 2nd Mid term',1,'S3','Biology','vol1','midterm',8,60,8,NULL,'DRAFT',1,'2026-04-04 17:21:20','2026-04-04 17:21:20',NULL),(2,'Physics Ch1 Supplementary notes and exercise',1,'Unknown','Physics','vol1','paper',9,60,9,NULL,'DRAFT',1,'2026-04-04 17:21:20','2026-04-04 17:21:20',NULL),(3,'SPCC_Form Six Mock Examination 2019 -Paper 1B QP - 6C (10) Chan Yuen Kiu',1,'Form Six','Biology','vol1','mock',11,60,11,NULL,'DRAFT',1,'2026-04-04 17:21:20','2026-04-04 17:21:20',NULL),(4,'WFN_19-20 Economics Paper 2',1,'Unknown','Economics','vol1','paper',1,60,1,NULL,'DRAFT',1,'2026-04-04 17:22:04','2026-04-04 17:22:03',NULL),(5,'WYHK1920-Bio_PAPER2 - _3',1,'Unknown','Biology','vol1','paper',2,60,1,NULL,'DRAFT',1,'2026-04-04 17:22:04','2026-04-04 17:22:03',NULL),(6,'ssgc_2016-2017_P2 - Kelvin Yu',1,'Form 6','Biology','vol1','paper',6,60,6,NULL,'DRAFT',1,'2026-04-04 17:22:04','2026-04-04 17:22:03',NULL);
/*!40000 ALTER TABLE `papers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `question_attempt_answers`
--

DROP TABLE IF EXISTS `question_attempt_answers`;
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

--
-- Dumping data for table `question_attempt_answers`
--

LOCK TABLES `question_attempt_answers` WRITE;
/*!40000 ALTER TABLE `question_attempt_answers` DISABLE KEYS */;
/*!40000 ALTER TABLE `question_attempt_answers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `question_attempts`
--

DROP TABLE IF EXISTS `question_attempts`;
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

--
-- Dumping data for table `question_attempts`
--

LOCK TABLES `question_attempts` WRITE;
/*!40000 ALTER TABLE `question_attempts` DISABLE KEYS */;
/*!40000 ALTER TABLE `question_attempts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `question_bank_items`
--

DROP TABLE IF EXISTS `question_bank_items`;
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
) ENGINE=InnoDB AUTO_INCREMENT=49 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `question_bank_items`
--

LOCK TABLES `question_bank_items` WRITE;
/*!40000 ALTER TABLE `question_bank_items` DISABLE KEYS */;
INSERT INTO `question_bank_items` VALUES (1,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #1 [d94ee2e8]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:56:55','2026-04-04 16:56:54','textbook',1),(2,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #2 [d90f09a5]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:56:55','2026-04-04 16:56:54','textbook',1),(3,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #3 [09d1e093]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:56:55','2026-04-04 16:56:54','textbook',1),(4,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #4 [74c6fcc9]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:56:55','2026-04-04 16:56:54','textbook',1),(5,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #5 [765066e5]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:56:55','2026-04-04 16:56:54','textbook',1),(6,'generated','Grade 10','Math',NULL,'SHORT_ANSWER','[Math] (easy) SHORT_ANSWER #1 [d6eb4a09]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:56:55','2026-04-04 16:56:54','textbook',1),(7,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #1 [c3f44224]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:57:04','2026-04-04 16:57:03','textbook',1),(8,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #2 [171ac843]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:57:04','2026-04-04 16:57:03','textbook',1),(9,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #3 [41a70b3c]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:57:04','2026-04-04 16:57:03','textbook',1),(10,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #4 [eeabd6d4]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:57:04','2026-04-04 16:57:03','textbook',1),(11,'generated','Grade 10','Math',NULL,'MCQ_SINGLE','[Math] (easy) MCQ #5 [dcbc9b47]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:57:04','2026-04-04 16:57:03','textbook',1),(12,'generated','Grade 10','Math',NULL,'SHORT_ANSWER','[Math] (easy) SHORT_ANSWER #1 [11160d17]: template prompt','easy','TBD','TBD','1',1,'2026-04-04 16:57:04','2026-04-04 16:57:03','textbook',1),(13,'unknown','S3','Biology',NULL,'SHORT_ANSWER','The diagram below shows four types of human teeth.','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(14,'unknown','S3','Biology',NULL,'SHORT_ANSWER','Which of t he following events ensure that the food bolus enter s the oesophagus during the process of','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(15,'unknown','S3','Biology',NULL,'SHORT_ANSWER','Which of the following combinations correctly matches the organisms with their modes of nutrition?','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(16,'unknown','S3','Biology',NULL,'SHORT_ANSWER','Which of the following are the functions of hydrochloric acid in the gastric juice?','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(17,'unknown','S3','Biology',NULL,'SHORT_ANSWER','Which of the following is the function of the cardiac sphincter of the stomach?','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(18,'unknown','S3','Biology',NULL,'SHORT_ANSWER','The graph below shows the digestion of three types of food substances (X, Y and Z) along the alimentary','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(19,'unknown','S3','Biology',NULL,'SHORT_ANSWER','In an experiment, four wells are made in a starch agar plate and each well is filled with a different solution','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(20,'unknown','S3','Biology',NULL,'SHORT_ANSWER','Which of t he following events ensure that the food bolus enters the oesophagus  during the process of','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(21,'unknown','Unknown','Physics',NULL,'SHORT_ANSWER','Graph and proportion','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(22,'unknown','Unknown','Physics',NULL,'SHORT_ANSWER','The liquid column in an unmarked liquid in glass thermometer has different lengths L when the','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(23,'unknown','Unknown','Physics',NULL,'SHORT_ANSWER','The length of the mercury thread in a mercury-in-glass thermometer are 2 cm and 8 cm at 0 oC','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(24,'unknown','Unknown','Physics',NULL,'SHORT_ANSWER','The markings on a calibrated thermometer have faded away. We know that the column lengths','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(25,'unknown','Unknown','Physics',NULL,'SHORT_ANSWER','A certain wire has a resistance of 9Ω at 0 oC and 14Ω at 150 oC. When the wire is placed in','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(26,'unknown','Unknown','Physics',NULL,'SHORT_ANSWER','Scientific notation and unit conversion','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(27,'unknown','Unknown','Physics',NULL,'SHORT_ANSWER','Express the following terms in Joule J with correct notation.','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(28,'unknown','Unknown','Physics',NULL,'SHORT_ANSWER','5 2.5 1','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(29,'unknown','Unknown','Physics',NULL,'SHORT_ANSWER','Express the following terms in kWh','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(30,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','For each of the structures listed in Column 1, select from Column 2 one biological process that matches','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(31,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','People with lactose intolerance failed to produce sufficient lactase in small intestine.','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(32,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','Each pollen mother cell undergoes meiotic cell division to form pollen grains. The photomicrographs','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(33,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','A group of scientists have studied the succession of a forest since it was cleared by wildfire twenty','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(34,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','Paper is mostly composed of cellulose. Cellulose cannot be digested by most animals as they lack the','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(35,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','The following photomicrograph shows a transverse section of human testis.','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(36,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','Rheumatoid arthritis is a disease of the joints in the human body. It is an auto-immune disease where','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(37,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','The flow chart below outlines how two hormones, A and B, are involved in the regulation of blood','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(38,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','The Chan family claims that baby Jane, given to them at U hospital, does not belong to them and that','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(39,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','The rock pocket mouse is found in rocky outcrops in the Sonoran desert of the southwestern United','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(40,'unknown','Form Six','Biology',NULL,'SHORT_ANSWER','In terrestrial flowering plants such as our school’s White Jade Lily tree, photosynthesis mainly takes','medium','TBD','TBD',NULL,1,'2026-04-04 17:21:20','2026-04-04 17:21:20','paper',NULL),(41,'unknown','Unknown','Economics',NULL,'SHORT_ANSWER','Q1. [NO_TEXT_EXTRACTED] Placeholder question','medium','TBD','TBD',NULL,1,'2026-04-04 17:22:04','2026-04-04 17:22:03','paper',NULL),(42,'unknown','Unknown','Biology',NULL,'SHORT_ANSWER','100% glucose?              (2 marks)','medium','TBD','TBD',NULL,1,'2026-04-04 17:22:04','2026-04-04 17:22:03','paper',NULL),(43,'unknown','Form 6','Biology',NULL,'SHORT_ANSWER','There are TWO sections A and D in this pa per.  Answer ALL questions in the TWO','medium','TBD','TBD',NULL,1,'2026-04-04 17:22:04','2026-04-04 17:22:03','paper',NULL),(44,'unknown','Form 6','Biology',NULL,'SHORT_ANSWER','Write your answers in the answer book provided. Start each question (not part of a question)','medium','TBD','TBD',NULL,1,'2026-04-04 17:22:04','2026-04-04 17:22:03','paper',NULL),(45,'unknown','Form 6','Biology',NULL,'SHORT_ANSWER','Present your answers in paragraphs wherever appropriate.','medium','TBD','TBD',NULL,1,'2026-04-04 17:22:04','2026-04-04 17:22:03','paper',NULL),(46,'unknown','Form 6','Biology',NULL,'SHORT_ANSWER','Illustrate your answers with diagrams wherever appropriate.','medium','TBD','TBD',NULL,1,'2026-04-04 17:22:04','2026-04-04 17:22:03','paper',NULL),(47,'unknown','Form 6','Biology',NULL,'SHORT_ANSWER','The diagrams in this section are NOT necessarily drawn to scale.','medium','TBD','TBD',NULL,1,'2026-04-04 17:22:04','2026-04-04 17:22:03','paper',NULL),(48,'unknown','Form 6','Biology',NULL,'SHORT_ANSWER','Supplementary answer sheets will be provided on request.  Write your class, class number','medium','TBD','TBD',NULL,1,'2026-04-04 17:22:04','2026-04-04 17:22:03','paper',NULL);
/*!40000 ALTER TABLE `question_bank_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `question_bank_options`
--

DROP TABLE IF EXISTS `question_bank_options`;
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
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `question_bank_options`
--

LOCK TABLES `question_bank_options` WRITE;
/*!40000 ALTER TABLE `question_bank_options` DISABLE KEYS */;
INSERT INTO `question_bank_options` VALUES (1,1,'A','Option A',1),(2,1,'B','Option B',0),(3,1,'C','Option C',0),(4,1,'D','Option D',0),(5,2,'A','Option A',1),(6,2,'B','Option B',0),(7,2,'C','Option C',0),(8,2,'D','Option D',0),(9,3,'A','Option A',1),(10,3,'B','Option B',0),(11,3,'C','Option C',0),(12,3,'D','Option D',0),(13,4,'A','Option A',1),(14,4,'B','Option B',0),(15,4,'C','Option C',0),(16,4,'D','Option D',0),(17,5,'A','Option A',1),(18,5,'B','Option B',0),(19,5,'C','Option C',0),(20,5,'D','Option D',0),(21,7,'A','Option A',1),(22,7,'B','Option B',0),(23,7,'C','Option C',0),(24,7,'D','Option D',0),(25,8,'A','Option A',1),(26,8,'B','Option B',0),(27,8,'C','Option C',0),(28,8,'D','Option D',0),(29,9,'A','Option A',1),(30,9,'B','Option B',0),(31,9,'C','Option C',0),(32,9,'D','Option D',0),(33,10,'A','Option A',1),(34,10,'B','Option B',0),(35,10,'C','Option C',0),(36,10,'D','Option D',0),(37,11,'A','Option A',1),(38,11,'B','Option B',0),(39,11,'C','Option C',0),(40,11,'D','Option D',0);
/*!40000 ALTER TABLE `question_bank_options` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `question_items`
--

DROP TABLE IF EXISTS `question_items`;
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
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `question_items`
--

LOCK TABLES `question_items` WRITE;
/*!40000 ALTER TABLE `question_items` DISABLE KEYS */;
INSERT INTO `question_items` VALUES (1,1,1,1,16.67,'[Math] (easy) MCQ #1 [d94ee2e8]: template prompt'),(2,1,2,2,16.67,'[Math] (easy) MCQ #2 [d90f09a5]: template prompt'),(3,1,3,3,16.67,'[Math] (easy) MCQ #3 [09d1e093]: template prompt'),(4,1,4,4,16.67,'[Math] (easy) MCQ #4 [74c6fcc9]: template prompt'),(5,1,5,5,16.67,'[Math] (easy) MCQ #5 [765066e5]: template prompt'),(6,1,6,6,16.67,'[Math] (easy) SHORT_ANSWER #1 [d6eb4a09]: template prompt'),(7,2,7,1,16.67,'[Math] (easy) MCQ #1 [c3f44224]: template prompt'),(8,2,8,2,16.67,'[Math] (easy) MCQ #2 [171ac843]: template prompt'),(9,2,9,3,16.67,'[Math] (easy) MCQ #3 [41a70b3c]: template prompt'),(10,2,10,4,16.67,'[Math] (easy) MCQ #4 [eeabd6d4]: template prompt'),(11,2,11,5,16.67,'[Math] (easy) MCQ #5 [dcbc9b47]: template prompt'),(12,2,12,6,16.67,'[Math] (easy) SHORT_ANSWER #1 [11160d17]: template prompt');
/*!40000 ALTER TABLE `question_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `questions`
--

DROP TABLE IF EXISTS `questions`;
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `questions`
--

LOCK TABLES `questions` WRITE;
/*!40000 ALTER TABLE `questions` DISABLE KEYS */;
INSERT INTO `questions` VALUES (1,'Math-Grade 10-easy-quiz-20260404165654',1,NULL,45,100,'DRAFT',1,'2026-04-04 16:56:55'),(2,'Math-Grade 10-easy-quiz-20260404165703',1,NULL,45,100,'DRAFT',1,'2026-04-04 16:57:04');
/*!40000 ALTER TABLE `questions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `slide_blocks`
--

DROP TABLE IF EXISTS `slide_blocks`;
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

--
-- Dumping data for table `slide_blocks`
--

LOCK TABLES `slide_blocks` WRITE;
/*!40000 ALTER TABLE `slide_blocks` DISABLE KEYS */;
/*!40000 ALTER TABLE `slide_blocks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `slides`
--

DROP TABLE IF EXISTS `slides`;
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

--
-- Dumping data for table `slides`
--

LOCK TABLES `slides` WRITE;
/*!40000 ALTER TABLE `slides` DISABLE KEYS */;
/*!40000 ALTER TABLE `slides` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_profiles`
--

DROP TABLE IF EXISTS `student_profiles`;
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

--
-- Dumping data for table `student_profiles`
--

LOCK TABLES `student_profiles` WRITE;
/*!40000 ALTER TABLE `student_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_profiles`
--

DROP TABLE IF EXISTS `teacher_profiles`;
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

--
-- Dumping data for table `teacher_profiles`
--

LOCK TABLES `teacher_profiles` WRITE;
/*!40000 ALTER TABLE `teacher_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `teacher_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `textbooks`
--

DROP TABLE IF EXISTS `textbooks`;
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `textbooks`
--

LOCK TABLES `textbooks` WRITE;
/*!40000 ALTER TABLE `textbooks` DISABLE KEYS */;
INSERT INTO `textbooks` VALUES (1,'unknown','Form of','Biology','VOL1','Plant burger\nbalanced diet 均衡膳食\n5\n Food and humans\nThink about…\n1 What is a balanced diet?\n2 In what ways are proteins \nimportant for our body?\n(Answers on p. 31)\nPlant burger for vegetarians\nVegetarians do not eat foods like meat and fish which are important \nsources of proteins for most people. They may need to eat more \nbeans and grains in order to achieve a balanced diet *. This plant \nburger could be a good choice for them. The ‘meat’ inside is \nproduced from wheat, potato and soya bean, but it has a meat-like \nappearance, texture and flavour.\nNSSBIO3E_SB1A_Ch05_e.indd   1 18/5/2020   下午3:39\nAcknowledgements and Important Notice:\nAll questions from the HKDSE, HKCEE and HKALE are reproduced by permission of the HKEAA. \nUnauthorized use of the aforementioned questions in this electronic version is prohibited.\nOrganisms and Environment\n5– 2\nII\ncarbohydrate 碳水化合物  dietary fibre 食用纖維  disaccharide 雙糖  food substance 食物物質  glucose 葡萄糖   \nlipid 脂質  maltose 麥芽糖  mineral 礦物質  monosaccharide 單糖  polysaccharide 多糖  protein 蛋白質   \nstarch 澱粉  vitamin 維生素\n5.1  The food requirements of \nhumans\nWe have to take in food every day. It is because food provides us with:\n• energy for supporting daily activities and keeping us warm.\n• raw materials for growth and repair of body tissues.\n• substances that are important for maintaining health.\nFood contains seven types of food substances* that are essential \nto health. They are carbohydrates*, lipids*, proteins*, minerals*, \nvitamins*, dietary fibre*, and water.\nA   Carbohydrates\nCarbohydrates are organic substances made up of carbon (C), hydrogen \n(H) and oxygen (O) atoms, in which the H : O ratio is 2 : 1 (Fig 5.1).\nDoes our body still \nneed energy when we \nare sleeping? Why?\n?\nFig 5.2   Carbohydrates can be classified into three groups\ncarbohydrates \npolysaccharides*\ndisaccharides*\nmonosaccharides*\nthe simplest form \nof carbohydrates, \ne.g. glucose \nconsist of two \nmonosaccharides \njoined together, \ne.g. maltose\n*\nconsist of many \nmonosaccharides \njoined together, \ne.g. starch\n*\nCarbohydrates can be classified into three groups: monosaccharides, \ndisaccharides and polysaccharides (Fig 5.2).\n•  Monosaccharide, \ndisaccharide and \npolysaccharide\nIn Greek, ‘mono’ means \n‘one’, ‘di’ means ‘two’, \n‘poly’ means ‘many’ and \n‘sacchar’ means ‘sugars’.\nFig 5.1   The structure of a glucose*  \nmolecule (chemical formula  \nC6H12O6), a carbohydrate\nC \nC C \nC C \nO \nH \nCH2OH\nOH \nH \nOH \nH OH \nH \nH \nHO \nWatch this to prepare for \nyour class and answer the \nquestions.\nVideo & \nquestions \n16(IA)Q3, 5, 6, 19(IA)Q26\nDSE\nNSSBIO3E_SB1A_Ch05_e.indd   2 18/5/2020   下午3:39\n\n5   Food and humans\n5– 3\nbarley 大麥  Benedict ’s test 本立德試驗  condensation 縮合  fructose 果糖  galactose 半乳糖  hydrolysis 水解   \nlactose 乳糖  reducing sugar 還原糖  sucrose 蔗糖  sugar beet 甜菜\nDisaccharides and polysaccharides are formed by joining monosaccharide \nmolecules in a reaction called condensation. Condensation is a chemical \nreaction in which two molecules combine with loss of a water molecule.\nOn the other hand, disaccharides and polysaccharides are broken down \ninto monosaccharides in a reaction called  hydrolysis. During hydrolysis, \na water molecule is added (Fig 5.3).\n• hydrolysis\nIn Greek, ‘hydro’ means \n‘water’ and ‘lysis’ means \n‘loosen’.\ni) Monosaccharides and disaccharides\nMonosaccharides and disaccharides are called sugars. They taste sweet \nand are soluble in water. The table below shows some examples of \nthese sugars and where they can be found.\nExample of sugars Found in\nMonosaccharides Glucose Fruits and honey\nFructose* Fruits and honey\nGalactose* Milk and dairy products like \ncheese and yoghurt\nDisaccharides Maltose\n(composed of two glucose  \nmolecules)\nGerminating barley*\nSucrose*\n(composed of a glucose \nand a fructose molecules)\nSugar cane, sugar beet * and \ntable sugar\nLactose*\n(composed of a glucose \nand a galactose molecules)\nMilk and dairy products like \ncheese and yoghurt\nAll monosaccharides and disaccharides except sucrose are reducing \nsugars*. They can be detected using Benedict’s test*. \nCross-link\nThe details of reducing \nsugars and Benedict’s test \nwill be discussed on p. 5. \nFig 5.3   The formation and breakdown of a disaccharide\nHO OH HO OH\n+  H2O\nHO O OH+\ncondensation*\nhydrolysis*\na disaccharide\n(e.g. maltose)\ntwo monosaccharides\n(e.g. two glucose)\nNSSBIO3E_SB1A_Ch05_e.indd   3 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 4\nII\ncellulose 纖維素  glycogen 糖原  kilojoule 千焦耳\nii) Polysaccharides\nPolysaccharides are very large molecules. They  do not taste sweet  and \nare insoluble in water.\nExamples of polysaccharides include starch, glycogen* and cellulose*. \nThey are all made up of glucose molecules , but the glucose molecules \nare arranged in different ways. \n• Starch is the major storage  \nform of carbohydrates in plants. \nIt is abundant in foods like rice, \nwheat, potatoes and taros  \n(Fig 5.4). Starch is the major \nenergy source in most diets.\n• Glycogen is the storage form \nof carbohydrates in animals. It \nis abundant in liver and muscles.\n• Cellulose is a major component of plant cell walls.\nFunctions of carbohydrates\na As the main energy source for body activities\n •  Monosaccharides taken into the body are directly absorbed and \nthen be used to provide energy. For example, glucose is  broken \ndown in respiration to release energy.\n •  Disaccharides and starch need to be broken down into \nmonosaccharides for absorption. Monosaccharides are then \nfurther used to release energy.\n •  Each gram of carbohydrate provides about 17.1 kilojoules *(kJ) of \nenergy.\nb As energy reserves\n •  When carbohydrates are taken in excess, some of them are \nconverted into glycogen in the liver or muscles and stored \nas energy reserves. Glycogen is broken down into glucose to \nprovide energy when needed.\nc As a source of dietary fibre\n •  Cellulose cannot be digested in our body. It is an important \nsource of dietary fibre  that keeps us healthy.\nFig 5.4   Foods rich in starch\nStarch and glycogen \nare insoluble and \ncompact. What are the \nadvantages of using \nthem for storage?\n?\nSome of the excess \ncarbohydrates may be \nconverted into fat and \nstored.\nCross-link\nThe functions of dietary fibre \nwill be discussed on p. 16.\nNSSBIO3E_SB1A_Ch05_e.indd   4 18/5/2020   下午3:39\n\n5   Food and humans\n5– 5\nprecipitate 沉澱物  oxidize 氧化  reduce 還原\nTests for carbohydrates\nSimple tests can be carried out to detect the sugars and starch in food.\n• Test for glucose — using  glucose test paper\n Dip the test end of the glucose test paper \ninto the food sample. A change in the colour \nof the test end indicates the presence of \nglucose (Fig 5.5).\n• Test for reducing sugars — Benedict’s test\n Add an equal volume of Benedict’s solution \nto the food sample and boil the mixture \nin a water bath for 5 minutes. A brick-\nred precipitate* indicates the presence of \nreducing sugars (Fig 5.6).\n If excess Benedict’s solution is added, the \namount of precipitate formed is proportional to the amount of \nreducing sugars present. The amounts of reducing sugars in different \nsamples can be compared by comparing the amount of precipitate \nformed.\n• Test for starch — iodine test\n Add iodine solution to the food sample. A \nchange in the colour of the iodine solution \nfrom brown to blue-black indicates the \npresence of starch (Fig 5.7).\nThe procedures described \nbelow are for liquid food \nsamples. You can try them \nout in Practical 5.1. For solid \nfood samples, see Practical \n5.2.\nFig 5.5   Results of a glucose \ntest paper\ndistilled \nwater\nfood sample \ncontaining  \nglucose\nThe colour change depends \non the kind of glucose test \npaper used.\nFig 5.6   Results of \nBenedict’s test\nfood sample  \ncontaining  \nreducing sugars\ndistilled \nwater\nFig 5.7   Results of iodine \ntest\nfood sample \ncontaining \nstarch\ndistilled \nwater\nReducing sugars\nSome chemical reactions involve a transfer of electrons between substances. The substances that lose \nelectrons are said to be oxidized, and the substances that gain electrons are said to be reduced.\nX\nelectrons\nX loses electrons.\nIt is oxidized*.\nY gains electrons.\nIt is reduced\n*.Y\nMonosaccharides and disaccharides (except sucrose) lose electrons readily to other substances. They are \ncalled reducing sugars because they cause other substances to be reduced.\nNSSBIO3E_SB1A_Ch05_e.indd   5 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 6\nII\nadipose tissue 脂肪組織  ethanol 乙醇  fat 脂肪  fatty acid 脂肪酸  glycerol 甘油  oil 油  subcutaneous fat 皮下脂肪   \ntriglyceride 甘油三酯\nB   Lipids\nLike carbohydrates, lipids are also organic substances made up of \ncarbon (C), hydrogen (H) and oxygen (O) atoms, but the H : O ratio is \nmuch greater than 2 : 1. Lipids are insoluble in water but soluble in \norganic solvents, e.g. ethanol *.\nTriglycerides are the commonest type of lipids. They are formed from \none glycerol and three fatty acids by condensation. On the other \nhand, they can be broken down by hydrolysis (Fig 5.8).\nTriglycerides that are solid at room temperature (e.g. butter) are \ncommonly called fats *. They mainly come from animals. Triglycerides \nthat are liquid at room temperature (e.g. peanut oil) are commonly called \noils*. They mainly come from plants. Fatty meat, seeds, nuts, milk and \ndairy products are rich in fats and oils (Fig 5.9).\nFunctions of lipids\na As energy reserves\n •  Lipids are stored in adipose tissues* in our body as energy \nreserves. Adipose tissues are found under the skin as \nsubcutaneous fat*, or around the internal organs . They can be \nbroken down to provide energy when needed.\n •  Each gram of lipid provides about 38.9 kJ of energy (more than \ntwice that of carbohydrates).\nb As a shock absorber\n Fat stored in adipose tissues around the internal organs acts as a \nshock absorber to protect the internal organs .\nc As a heat insulator\n Subcutaneous fat acts as a heat insulator to reduce heat loss from \nthe body.\nFig 5.9   Foods rich in fats \nand oils\nFig 5.8   The formation and breakdown of a triglyceride\n+ + 3 H2O\nO\nO\nO\nH\nCH\nCH\nCH\nOH\nOH\nOH\nHO\nHO\nHO\nH\nlong chain of C, H and O\na glycerol* 3 fatty acids*\n(can be the same or different)\na triglyceride*\nlong chain of C, H and O\nlong chain of C, H and O\ncondensation\nhydrolysis\nNSSBIO3E_SB1A_Ch05_e.indd   6 18/5/2020   下午3:39\n\n5   Food and humans\n5– 7\ncardiovascular disease 心血管疾病  grease spot test 油漬試驗  saturated fat 飽和脂肪  saturated fatty acid 飽和脂肪酸   \nsex hormone 性激素  stroke 中風  trans fat 反式脂肪  translucent 半透明  unsaturated fatty acid 不飽和脂肪酸\nd Involved in the absorption, transport and storage of lipid-soluble \nvitamins (e.g. vitamins A and D)\ne To produce some hormones (e.g. sex hormones *)\nf As a component of cell membranes\n Phospholipids are the major component of cell membranes.\nTest for lipids\nThe grease spot test * can be carried out \nto detect the lipids in food. Put a drop \nof the food sample onto a piece of filter \npaper and let it dry. A translucent* spot \nwill remain on the filter paper if lipids \nare present (Fig 5.10). Then immerse \nthe filter paper into an organic solvent \nand take it out . The translucent spot will \ndisappear if it is formed by lipids.\nCross-link\nRefer to Ch 3 for the \nstructure and properties of \nphospholipids. \nMore about lipids\nSaturated fats and unsaturated fats\nThe fatty acids in lipids can be saturated or unsaturated (Fig 5.11). \nHO\nO\nC\nH\nH\nC\nH\nH\nC\nH\nH\nC\nH\nH\nC\nH\nH\nC\nH\nH\nC\nH\nH\nC\nH\nH\nC H\ncarbon atoms saturated with hydrogen\na saturated fatty acid*:a\nHO\nO\nC\nH\nH\nC\nH\nH\nC\nH\nH\nC\nH\nH\nC\nH\nC\nH\nC\nH\nH\nC H\nH\nC H\nan unsaturated fatty acid*:b\nFig 5.11   (a) A saturated fatty acid and (b) an unsaturated fatty acid\nLipids that are rich in saturated fatty acids are called saturated fats *. They \nare often solid at room temperature. Taking in too much saturated fats \nmay lead to cardiovascular diseases * like heart disease and stroke *.\nTrans fats\nTrans fats * are produced when plant oils are solidified in an industrial \nprocess, or when they are exposed to very high temperatures during \ncooking (e.g. deep-frying). Trans fats are found in cakes, bread and  \ndeep-fried foods. They are also linked to cardiovascular diseases.\nVisit the following website \nand find out more about \nhow to choose cooking \noils.\nhttp://www.cohc.hk/en/\nOil-Tips/\nFig 5.10   Food sample containing \nlipids leaves a translucent \nspot on the filter paper\nfood sample \ncontaining \nlipids leaves a \ntranslucent spot \nafter drying\ndistilled water \nleaves no spot \nafter drying\nfilter \npaper\nNSSBIO3E_SB1A_Ch05_e.indd   7 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 8\nII\namino acid 氨基酸  amino group 氨基  carboxyl group 羧基  dipeptide 二肽  peptide bond 肽鍵  polypeptide 多肽\nC   Proteins\nProteins are organic substances made up of carbon (C), hydrogen (H), \noxygen (O) and nitrogen (N) atoms. Some proteins also contain \nsulphur (S) atoms.\nAmino acids* are the basic building blocks \nof proteins. Each amino acid has an amino \ngroup, a carboxyl group and a side chain \n(Fig 5.12). There are many different amino \nacids and each has a different side chain.\nTwo amino acids can join together into \na dipeptide by condensation. The link \nbetween the two amino acids is called a \npeptide bond. A dipeptide can be broken down by hydrolysis (Fig 5.13).\nThe further addition of amino acids to a dipeptide forms a polypeptide\n*. \nThe polypeptide coils and folds in a specific way into a 3-dimensional \nstructure due to the attraction forces between some of the amino acids in \nthe polypeptide. Some proteins consist of one polypeptide, while others \nare formed by combining two or more polypeptides (Fig 5.14 on p. 9). \nFor example, haemoglobin consists of four polypeptides. \nThe amino acid sequence of a polypeptide determines the final shape of \nthe protein. In our body, there are many different proteins, each having a \nunique sequence of amino acids and thus a unique shape. This unique \nshape allows different proteins to perform different functions  in our \nbody.\nAttraction forces occur only \nbetween specific amino \nacids. Thus the amino acid \nsequence determines how a \npolypeptide coils and folds.\nFig 5.13   The formation and breakdown of a dipeptide\n+C CN\nH O\nH OH HH\nR1\nC CN\nH O\nOHH\nR2\nC CN\nH\nH H\nR1 O H\nC CN\nO\nOHH\nR2\n+ H2O\ncondensation\nhydrolysis\nC CN\nH\nH H\nR\n1 O H\nC CN\nO\nOH\npeptide\nbond*\nH\nR2\n+ H2O\ntwo amino acids a dipeptide*\nH\nN\nH\nR\nH\nO\nOH\nC C\nR stands for \nthe side chain\namino \ngroup*\ncarboxyl \ngroup\n*\nFig 5.12   The structure of an \namino acid\nNSSBIO3E_SB1A_Ch05_e.indd   8 18/5/2020   下午3:39\n\n5   Food and humans\n5– 9\nessential amino acid 必需氨基酸  non-essential amino acid 非必需氨基酸\nFor example, you have learnt in Ch 4 that enzymes have unique active \nsites which fit with specific substrates. Changes in the shapes of the \nactive sites cause the enzymes to lose their function. Other proteins like \nreceptors and antibodies also have unique shapes that are important to \ntheir function.\nProteins in our body are made up of only 20 amino acids. Twelve of \nthese amino acids can be produced in our body. They are known as \nnon-essential amino acids *. The remaining amino acids need to be \nobtained from our diet. They are known as essential amino acids *.\nAmino acids can be obtained from  \nfoods like meat, fish, eggs, beans, \nmilk and dairy products, which are \nrich in proteins (Fig 5.15). The \nproteins we take in are broken down \ninto amino acids and absorbed. Our \nbody then makes use of these amino \nacids for different functions.\nCross-link\nThe importance of the \nshapes of antibodies to their \nfunction will be discussed in \ndetail in Bk 3, Ch 24.\nFig 5.15   Foods rich in proteins\nComplete and incomplete proteins\nSome proteins provide all eight essential amino acids in the right \nproportion needed by our body. They are called complete proteins. \nProteins from animal sources are often complete proteins.\nMost plant proteins are incomplete proteins. Therefore, vegetarians \nwho eat only foods from plant origin may need to eat a wide variety of \nprotein-rich plant foods to get enough of all the essential amino acids.\nFig 5.14   The formation of a protein from polypeptides\nThe polypeptide coils\nand folds in a speci/f_ic\nway into a 3D structure.\nattraction\nforces\n2 The polypeptide may\ncombine with other\npolypeptides to form a protein.\n3A polypeptide is\nformed by joining\nmany amino acids.\n1\nNSSBIO3E_SB1A_Ch05_e.indd   9 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 10\nII\ndeficiency disease 營養缺乏病  kwashiorkor 蛋白缺乏病  starvation 飢餓  tissue fluid 組織液\nFunctions of proteins\na For growth and repair\n Many of our body tissues (e.g. muscles and skin) are made up of \nproteins. Proteins are used for growth and repair of body tissues.\nb To produce enzymes, antibodies, haemoglobin and some \nhormones\nc As an energy source\n •  If carbohydrates and fat stored in our body are used up (e.g. \nduring starvation*), amino acids may be broken down to release \nenergy.\n •  Each gram of protein provides about 18.2 kJ of energy (about the \nsame as that of carbohydrates but only half of that of lipids).\nDeficiency of proteins\nA lack of proteins in the diet may lead to a  \ndeficiency disease* called kwashiorkor*. \nChildren suffering from kwashiorkor grow \npoorly and have weak muscles. They have a \nswollen abdomen because of the \naccumulation of tissue fluid\n* (Fig 5.16). \nKwashiorkor is common in developing \ncountries where meat, fish, eggs and milk are \nlimited in diets.\nTest for proteins\nA protein test paper can be used to detect the  \nproteins in food. Dip the test end of the \nprotein test paper into the food sample. A \nchange in the colour of the test end indicates \nthe presence of proteins (Fig 5.17).\nCross-link\nExcess amino acids cannot \nbe stored in our body. The \nfate of excess amino acids \nwill be discussed in Ch 6.\nFig 5.16   A child suffering \nfrom kwashiorkor\nCross-link\nTissue fluid will be introduced \nin Bk 1B, Ch 8. \nFig 5.17   Results of a \nprotein test paper\nfood sample \ncontaining \nproteins\ndistilled \nwater\nThe colour change depends \non the kind of protein test \npaper used.\nNSSBIO3E_SB1A_Ch05_e.indd   10 18/5/2020   下午3:39\n\n5   Food and humans\n5– 11\nWhat are the functions and food sources of carbohydrates, lipids and proteins?\nFood substance Functions Food sources\nCarbohydrates\n(monosaccharides, \ndisaccharides and \npolysaccharides)\n• Sugars and starch act as the  main energy \nsource for body activities.\n• Glycogen acts as energy reserves.\n• Cellulose is an important source of dietary \nfibre.\nSugars: fruits, honey, \nmilk and table sugar\nStarch: rice, wheat, \npotatoes and taros\nLipids\n(the commonest type, \ntriglycerides, are formed \nfrom the condensation \nof one glycerol and three \nfatty acids)\n• They act as energy reserves.\n• Fat in adipose tissues around the internal \norgans acts as a shock absorber.\n• Subcutaneous fat acts as a heat insulator.\n• They are involved in the absorption,  \ntransport and storage of lipid-soluble \nvitamins.\n• They are used to produce  some hormones.\n• Phospholipids are the major component \nof cell membranes .\nFatty meat, seeds, nuts, \nmilk and dairy products\nProteins\n(consisting of one or \nmore polypeptides, \nwhich are formed from \nthe condensation of \namino acids)\n• They are used for growth and repair  of \nbody tissues.\n• They are used to produce enzymes, \nantibodies, haemoglobin and some \nhormones.\n• They are broken down to release energy if  \ncarbohydrates and fat stored are used up.\nMeat, fish, eggs, \nbeans, milk and dairy \nproducts\n1 Which of the following are good food \nsources of proteins?\n (1) milk\n (2) cabbage\n (3) beans\n A (1) and (2) only B (1) and (3) only\n C (2) and (3) only D (1), (2) and (3)\n  p. 9\n2 Which of the following food substances \ncan provide energy for our body?\n (1) carbohydrates\n (2) lipids\n (3) proteins\n A (1) and (2) only B (1) and (3) only\n C (2) and (3) only D (1), (2) and (3)\n  p. 4, 6, 10\nLevel 1 Level 2\nNSSBIO3E_SB1A_Ch05_e.indd   11 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 12\nII\nblood clotting 血液凝固  calcium 鈣  iodine 碘  iron 鐵  kale 芥蘭  nervous system 神經系統   \nosteoporosis 骨質疏鬆症  potassium 鉀  rickets 軟骨病  sodium 鈉\nD   Minerals\nMinerals are inorganic food substances. They are needed in small \namounts compared with carbohydrates, lipids and proteins. They have \nno energy value, but are important in regulating many metabolic \nreactions and building body tissues. Calcium*, iron*, sodium*, iodine*, \npotassium* and phosphorus are some minerals we need. Calcium and \niron are discussed below.\n1 Calcium\nFunctions\n• It is a component of bones and teeth .\n• It is also involved in blood clotting*, muscle contraction and \nsending messages in the nervous system *.\nDeficiency\n• A deficiency of calcium may lead to rickets\n* in children. Children \nwith rickets have soft bones and their legs may bend under the \nweight of their bodies (Fig 5.18). If rickets is not corrected while a \nchild is still growing, the bones may remain bent and the child will \nnot grow to normal height.\n• As people age, calcium is lost from bones, leading to a loss of bone \nmass. Osteoporosis* is a disease in which the bones become porous \nand brittle, and are easily broken (Fig 5.19). Taking in enough \ncalcium can help slow down the loss of bone mass. Too little calcium \nin the diet increases the risk of osteoporosis.\nFig 5.19   Bone tissues of (a) a healthy person and (b) a person with osteoporosis\n(×20)\n (×20)\na b\nSources\n• Canned sardines, milk, dairy products, tofu and some green vegetables \nlike kale*, broccoli and spinach are rich in calcium (Fig 5.20).\n• Some pre-packaged foods and drinks (e.g. soy milk, fruit juices and \nbiscuits) also have added calcium.\nFig 5.20   Foods rich in \ncalcium\nFig 5.18  A child suffering \nfrom rickets\nNSSBIO3E_SB1A_Ch05_e.indd   12 18/5/2020   下午3:39\n\n5   Food and humans\n5– 13\nanaemia 貧血\n2 Iron\nFunction\nIt is a component of haemoglobin, a molecule in red blood cells that \ncarries oxygen around the body.\nDeficiency\nA deficiency of iron may lead to anaemia*. People with anaemia may \nfaint easily. This is because there is not enough haemoglobin in red \nblood cells to carry oxygen to the brain.\nSources\nBeef, liver, beans, cabbage, spinach and raisins are rich in iron (Fig 5.21).\nFig 5.21   Foods rich in iron\nSodium\nSodium is important for maintaining water balance in our body, and for \nthe normal functioning of the nervous system. Table salt (sodium chloride) \nis a major source of it. But taking in too much sodium can lead to high \nblood pressure. We should limit its intake. \nE   Vitamins\nVitamins are organic food substances needed in small amounts. They \nhave no energy value , but they help regulate metabolic reactions. \nThere are over ten types of vitamins. A few of them can be produced in \nour body (e.g. vitamin D), while others must be obtained from diet.\nThey can be divided into lipid-soluble and water-soluble vitamins.\n• Lipid-soluble vitamins (e.g. vitamins A, D, E and K) are absorbed \nwith lipids in our diet. They can be stored in large amounts in our \nbody. If they are taken in too large amounts, they accumulate and \nmay cause harm to the body.\n• Water-soluble vitamins (e.g. vitamins B and C) mostly cannot be \nstored in large amounts in our body. Excess amounts are excreted \nthrough urination. Thus, it is important to take in them regularly. \nWater-soluble vitamins in food are lost easily during food handling \nand cooking as they dissolve in water. Vitamin C is also easily  \ndestroyed when exposed to high temperatures  and oxygen.\nNSSBIO3E_SB1A_Ch05_e.indd   13 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 14\nII\nalimentary canal 消化道  breathing system 呼吸系統  carotene 胡蘿蔔素  cornea 角膜  night blindness 夜盲症   \nphosphate 磷酸鹽  retina 視網膜  trachea 氣管\n1 Vitamin A\nFunctions\n• It is needed for the formation of a pigment in the retina * of our \neyes. The pigment is necessary for vision in dim light.\n• It is important for keeping the cornea*, skin, lining of the \nalimentary canal* and breathing system* healthy.\nDeficiency\nA deficiency of vitamin A may lead to:\n• poor vision in dim light or even night blindness\n*\n• drying up of the cornea and skin\n• easy infection of the lining of the lungs and trachea *\nSources\n•  Fish liver oils, liver, eggs, milk and dairy products are rich in vitamin \nA (Fig 5.22).\n•  Some vegetables and fruits (e.g. carrots, pumpkin, sweet potatoes and \nmangoes) contain an orange pigment called carotene\n*. This pigment \nis converted to vitamin A in our liver.\n2 Vitamin D\nFunction\n It promotes the absorption of calcium and phosphate *, which are \nmain components of bones and teeth. Thus it is essential for keeping \nbones and teeth strong . It is particularly important to children for the \nhardening of bones and development of teeth.\nDeficiency\nA deficiency of vitamin D may lead to  rickets in children.\nSources\n• It is produced by the skin under \nsunlight.\n•  It can also be obtained from the diet. \nFatty fish (such as salmon and tuna), \nfish liver oils, liver and egg yolks are \nrich in vitamin D (Fig 5.23).\nFig 5.22   Foods rich in \nvitamin A\nFig 5.23   Foods rich in vitamin D\nNSSBIO3E_SB1A_Ch05_e.indd   14 18/5/2020   下午3:39\n\n5   Food and humans\n5– 15\nconnective tissue 結締組織  decolourization 褪色  immune system 免疫系統  scurvy 壞血病\n3 Vitamin C\nFunctions\n• It is needed for the growth and repair of connective tissues *, \nwhich help keep body structures in place.\n• It is needed for healing wounds.\n• It promotes the absorption of iron from plant foods.\n• It helps the immune system* work properly to protect the body from \ndiseases.\nDeficiency\nA deficiency of vitamin C may lead to  \nscurvy\n*. The symptoms of scurvy \ninclude:\n• weak and bleeding gums (Fig 5.24)\n• poor healing of wounds\n• small red spots on the skin\n• joint pain\nSources\nFresh vegetables and fruits  \n(especially bell peppers, broccoli, \nguavas and kiwi fruits) are rich in \nvitamin C (Fig 5.25).\nTest for vitamin C\nDCPIP test can be carried out to detect the vitamin C in food. Add the \nfood sample to the  DCPIP (dichlorophenol indophenol) solution drop \nby drop with gentle shaking. Decolourization\n* of the blue DCPIP \nsolution indicates the presence of vitamin C (Fig 5.26).\nWe can also use DCPIP solution to compare the vitamin C content of \ndifferent foods. The higher the amount of vitamin C in the food, the \nfewer drops of the food are needed to decolourize the same volume of \nDCPIP solution.\nFig 5.24   Bleeding gums of a person \nwith scurvy\nFig 5.25   Foods rich in vitamin C\nFig 5.26   Results of DCPIP \ntest\nfood sample \ncontaining \nvitamin C  \nadded to  \nDCPIP solution\ndistilled \nwater \nadded to \nDCPIP \nsolution\nNSSBIO3E_SB1A_Ch05_e.indd   15 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 16\nII\ncolorectal cancer 大腸癌  constipation 便秘  peristalsis 蠕動  wholemeal 全麥\nF   Dietary fibre\nDietary fibre is an organic food substance. There are two main types, \nsoluble and insoluble. Insoluble dietary fibre consists mainly of cellulose \nfrom plant cell walls.\nFunctions\nInsoluble dietary fibre does not provide energy  for our body. It passes \nthrough the gut undigested because our body does not have enzymes \nto digest it. However, an adequate intake of it is important to health \nbecause it helps faeces pass out  of the body by\n• adding bulk to food to stimulate peristalsis *. Peristalsis is the \nmovement of gut wall which pushes food along the gut. You will \nlearn more about peristalsis in Ch 6.\n• holding a lot of water  to make faeces softer.\nDeficiency\n• A deficiency of dietary fibre may lead to constipation*.\n• It is also believed that there is a link between low dietary fibre intake \nand an increased risk of colorectal cancer*.\nSources\nOnly plant foods contain dietary \nfibre. Vegetables, fruits and \nwholemeal* products are rich in \ndietary fibre (Fig 5.27).\nBy adding bulk to food,  \ninsoluble fibre also gives the \nsense of fullness. It can help \nreduce the chance of eating \ntoo much.\nColorectal cancer is \nthe commonest cancer \nin Hong Kong. Find \nout more about the \nsymptoms, risk factors \nand prevention of \ncolorectal cancer at:\nhttps://www.colonscreen.\ngov.hk/en/public/about_\ncrc/what_is_crc.html\nFig 5.27   Foods rich in dietary fibre\nSoluble dietary fibre\nSoluble dietary fibre is found in \noats, beans and some vegetables \nand fruits. Studies suggest that it \ncan help lower blood cholesterol \nlevel, thus helping to reduce the \nrisk of heart disease.\nFig 5.28   Foods with soluble dietary fibre\nNSSBIO3E_SB1A_Ch05_e.indd   16 18/5/2020   下午3:39\n\n5   Food and humans\n5– 17\nG   Water\nWater has no energy value but it is essential to life. It has the following \nfunctions:\na It acts as a reactant in some chemical reactions (e.g. the hydrolysis \nof carbohydrates, lipids and proteins).\nb It provides a medium for chemical reactions  to take place.\nc It acts as a medium of transport.\nd It acts as a cooling agent to help regulate body temperature.\ne It is the major component of many lubricating fluids.\nWater is mainly obtained from foods and drinks. Respiration in body \ncells also produces small amounts of water.\nCross-link\nRefer to Ch 2  for more \ndetails about different \nfunctions of water in our \nbody.\n1 For each of the food substances listed in column 1, select from \ncolumn 2 one function that matches it. Put the appropriate letter in \nthe space provided. (5 marks)\nColumn 1 Column 2\nCalcium\nIron\nVitamin A\nVitamin D\nVitamin C\nA For growth and repair of \nconnective tissues\nB A component of bones and teeth\nC For forming a pigment in the \nretina of our eyes\nD Promotes the absorption of \ncalcium and phosphate\nE A component of haemoglobin\n  p. 12–15\n2 A person is suffering from constipation and night blindness. Which \nof the following foods should he eat more?\n A eggs and milk\n B cheese and ham\n C sausage and apples\n D milk and oats  p. 14, 16\nLevel 1\nLevel 2\nNSSBIO3E_SB1A_Ch05_e.indd   17 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 18\nII\n1 What are the functions and sources of minerals (calcium and iron), vitamins (A, D and C) and dietary \nfibre? What happens if there is a deficiency of these food substances in the body?\nFood substance Function Deficiency Sources\nMinerals\nCalcium • A component of bones \nand teeth\n• Involved in blood clotting, \nmuscle contraction  and \nsending messages in the \nnervous system\nRickets in children Canned sardines, milk, \ndairy products, tofu and \nsome green vegetables \nIron A component of \nhaemoglobin\nAnaemia Beef, liver, beans, \ncabbage, spinach and \nraisins\nVitamins\nVitamin A  \n(lipid-\nsoluble)\n• Needed for the formation \nof a pigment in the retina\n• Keeps the cornea, skin, \nlining of the  alimentary \ncanal and breathing \nsystem healthy\n• Night blindness\n• Drying up of the \ncornea and skin\n• Easy infection of \nthe lining of the \nlungs and trachea\n• Fish liver oils, liver, \neggs, milk and dairy \nproducts\n• Vegetables and fruits \ncontaining carotene\nVitamin D  \n(lipid-\nsoluble)\nPromotes the absorption of \ncalcium and phosphate\nRickets in children • Fatty fish, fish liver oils, \nliver and egg yolks\n• Produced by the skin \nunder sunlight\nVitamin C  \n(water-\nsoluble)\n• Needed for the growth and  \nrepair of connective tissues\n• Promotes the absorption of \niron\n• Helps the immune system  \nwork properly\nScurvy Fresh vegetables and \nfruits\nDietary fibre Helps faeces pass out  of the \nbody by adding bulk to food \nto stimulate peristalsis  and \nholding water to make faeces \nsofter \nConstipation Vegetables, fruits and \nwholemeal products\n2 What are the functions of water in the body?\n • As a reactant\n • As a medium for chemical reactions\n • As a medium of transport\n • As a cooling agent to help regulate body temperature\n • As a major component of lubricating fluids\nNSSBIO3E_SB1A_Ch05_e.indd   18 18/5/2020   下午3:39\n\n5   Food and humans\n5– 19\nDetection of food substances by food tests\ncont.\nProcedure\nA Test for glucose using glucose test paper\n1 Put a drop of glucose solution and a drop of distilled water into two wells \nof a spot plate respectively.\n2 Dip the test end of a glucose test paper into each sample.\nglucose test paper\nglucose solution distilled water\n3 Observe any colour change. Compare the colour of the test end against \nthe colour chart on the packaging of the test paper.\nB Test for reducing sugars using Benedict’s test\n1 Add glucose solution and distilled water (e.g. 1 cm 3) to two test tubes \nrespectively.\n2 Add an equal volume of Benedict’s solution to each test tube.\n3 Boil the mixtures in a boiling water bath for five minutes.\n \nBenedict’s solution\nglucose solution distilled water\nwater bath\nboiling water\nglucose solution \n+ Benedict’s solution\ndistilled water \n+ Benedict’s solution\n4 Observe any change in the mixtures.\nC Test for starch using iodine test\n1 Put a drop of starch solution and a drop of distilled  \nwater into two wells of a spot plate respectively.\n2 Add a drop of iodine solution to each sample.\n3 Observe any colour change.\n5.1\nPractical 5.1\nWear safety goggles.\niodine solution\nstarch solution distilled water\nNSSBIO3E_SB1A_Ch05_e.indd   19 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 20\nII\nD Test for lipids using grease spot test\n1 Put a drop of cooking oil near the edge of a piece of filter paper. On the \nopposite edge, put a drop of distilled water. Label the drops A and B \nrespectively.\n2 Let the drops dry in the air for 20 minutes. Hold up the filter paper to \nthe light and observe whether there are translucent spots on the paper.\n \nA B\n/f_ilter paper\ncooking oil distilled water\nB\nA cooking oil\ndistilled water\n3 Immerse the spot into an organic solvent (e.g. ether or acetone). Take it \nout and let it dry.\n4 Examine the filter paper against the light again.\nE Test for proteins using protein test paper\n1 Put a drop of egg white solution and a drop of distilled water into two \nwells of a spot plate respectively.\n2 Dip the test end of a protein test paper into each sample.\nprotein test paper\negg white solution distilled water\n3 Observe any colour change. Compare the colour of the test end against \nthe colour chart on the packaging of the test paper.\nF Test for vitamin C using DCPIP test\n1 Put 1 cm\n3 of DCPIP solution into a test tube.\n2 Add vitamin C solution to the DCPIP solution drop by drop with gentle \nshaking. Stop when the DCPIP solution is decolourized.\nOrganic solvent is \nflammable. Keep \naway from flames. \nDCPIP\nsolution\nvitamin C\nsolution\nNSSBIO3E_SB1A_Ch05_e.indd   20 18/5/2020   下午3:39\n\n5   Food and humans\n5– 21\nInvestigation of the food substances in common \nfoodstuffs\nIntroduction\nWe will use the food tests in Practical 5.1 to identify the food substances in some food samples.\nProcedure\nA For liquid food samples\n1 Prepare 6 test tubes, each containing the same volume of the food.\n2 Perform the food tests in Practical 5.1.\nB For solid food samples\nTest for glucose, reducing sugars, starch, proteins and vitamin C\n1 Carry out the steps below to obtain an extract of the food for testing.\n a Grind small pieces of the food with a small quantity of cool distilled water.\n b Filter the ground material by squeezing it through several layers of pre-moistened fine muslin \nor by using a filter paper.\nsmall pieces \nof food\n         \ncool distilled\nwater\nmuslin\nextract of \nthe food\n2 Put the same volume of the extract into 5 test tubes.\n3 Test for the presence of glucose, reducing sugars, starch, proteins and vitamin C as in Practical 5.1.\nTest for lipids\n4 Grind small pieces of food with a small quantity of cool distilled water. Transfer the ground \nmaterial to a boiling tube containing distilled water.\n5 Boil the suspension in a boiling water bath. Any lipids in the food will escape as oil droplets on the \nupper layer of the suspension.\n6 Test for the presence of lipids as in Practical 5.1.\n5.2\nNSSBIO3E_SB1A_Ch05_e.indd   21 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 22\nII\nDesign an investigation to compare the amount of \nvitamin C in different fruits and vegetables\nScenario\nMary knows that vitamin C is  \nessential for health. She wants to \nknow which types of fruits or \nvegetables she should eat to obtain \nenough vitamin C.\nTask\nDesign and carry out an investigation to compare the vitamin C content in  \ndifferent fruits and vegetables. Write a full report of your investigation.\n5.35.3\nWhich one should I eat to \nobtain enough vitamin C?\nPractical 5.3\nDesign an investigation to study the effect of boiling on \nthe amount of vitamin C in vegetables\nScenario\nAndy was having lunch with  \nJenny in a restaurant. Jenny \ndecided to order salad instead \nof boiled vegetables. She \nexplained that boiling \nvegetables would decrease \ntheir vitamin C content. Andy \nwondered whether it was true.\nTask\nDesign and carry out an investigation to study the effect of boiling on the  \namount of vitamin C in vegetables. Write a full report of your investigation.\n5.35.4\nWould boiling decrease \nthe vitamin C content \nin vegetables? \nBoiling vegetables would decrease their \nvitamin C content. I’ll choose salad. \n✔\nPractical 5.4\nNSSBIO3E_SB1A_Ch05_e.indd   22 18/5/2020   下午3:39\n\n5   Food and humans\n5– 23\nHow can we test for the presence of different food substances in food?\nFood substance Food test Positive result\nGlucose Using a glucose test paper\n• Dip the test end into the food sample\nColour of the test \nend changes. \nReducing sugars \n(Monosaccharides \nand disaccharides \nexcept sucrose)\nBenedict’s test\n• Add an equal volume of Benedict’s solution to the \nfood sample and boil the mixture in a water bath \nfor 5 minutes\nA brick-red \nprecipitate is \nformed.\nStarch Iodine test\n• Add iodine solution to the food sample\nIodine solution \nchanges from brown \nto blue-black.\nLipids Grease spot test\n• Put a drop of the food sample onto a piece of  filter \npaper. Observe whether there is a translucent \nspot after drying. Then immerse the spot into an \norganic solvent and see if the spot disappears\nA translucent spot \nis formed, which \ndisappears after it \nis immersed into an \norganic solvent.\nProteins Using a protein test paper\n• Dip the test end into the food sample\nColour of the test \nend changes.\nVitamin C DCPIP test\n• Add the food sample to DCPIP solution drop by \ndrop with gentle shaking\nDCPIP solution \ndecolourizes. 1 For a food sample containing starch and \nsucrose, which of the following tests will \ngive a positive result?\n (1) Iodine test\n (2) Benedict’s test\n (3) DCPIP test\n A (1) only B (2) only\n C (3) only D (1) and (2) only\n \n p. 5, 15\n2 The table below shows the results of food \ntests for a kind of food. \nFood test Test results\nIodine test Iodine solution is brown.\nDCPIP test DCPIP solution is blue.\n The food is most likely to be\n A cooked rice. B lemon.\n C kiwi fruit. D milk.  p. 5, 15\nLevel 1 Level 2\nNSSBIO3E_SB1A_Ch05_e.indd   23 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 24\nII\n1\n2 3\n4 5\n6\nDrink 6–8 glasses of /f_luid every day\nEat less\nEat moderately\nEat more\nEat the most\nOIL\nSalt SUGAR\nCORN\nFlakes\n1\n2 Milk and alternatives\nMeat, ﬁsh, eggs and alternatives\n1−2 glasses / day\n5−8 tael* / day3\nThey are rich in proteins, vitamins and minerals. \nThey are needed for growth and repair of the body, \nand maintaining health.\n4 Vegetables\nFruits\n> 3 servings / day\n> 2 servings / day\n5\nThey are rich in vitamins, minerals and \ndietary /f_ibre. They are needed for \nmaintaining health.\nGrains 3−8 bowls / day\n6\nThey provide us with energy readily. \nSome of them (e.g. wholemeal bread) \nare rich in dietary /f_ibre.\nFats, oils, salt and sugar Eat the least\nThey are needed in very small amounts. Eating too much fatty \nand sugary foods will lead to overweight and heart disease. \nToo much salt may lead to high blood pressure.\nRemarks: \n1 glass = 240 mL; 1 bowl = 250–300 mL; 1 tael of meat = meat in the size of a table tennis ball; \n1 serving of vegetables = half bowl of cooked vegetables; 1 serving of fruits = 1 medium-sized fruit (e.g. an orange or an apple) \nMilkSoymilk\nYoghurt\nYoghurt\ndiet 膳食  food pyramid 食物金字塔  tael 兩 \n5.2 Balanced diet\nDiet* refers to all the food we eat. To maintain health, we should have \na balanced diet which consists of all the food substances  in the right \namounts and proportions.\nOne of the important factors to consider when planning a balanced \ndiet is the energy value. To stay healthy, we should maintain a balance \nbetween the energy input and energy output. A diet with too high \nor too low energy value may cause problems. Among the seven food \nsubstances, carbohydrates, lipids and proteins can provide energy.\nA  The food pyramid\nFood pyramid* (Fig 5.29) can be used as a guideline to plan a balanced \ndiet. In the food pyramid, foods are classified into six food groups. The \namounts of the six food groups in a balanced diet are represented by \ntheir relative sizes in the food pyramid. In addition to the amounts and \nproportions, we should also choose a variety of food from each group \nto ensure enough of various kinds of minerals and vitamins are obtained.\nFood \nsubstances\nEnergy \nvalue \n(kJ/g)\nCarbohydrates 17.1\nLipids 38.9\nProteins 18.2\nFig 5.29   Food pyramid for adults\nNSSBIO3E_SB1A_Ch05_e.indd   24 18/5/2020   下午3:39\n\n5   Food and humans\n5– 25\nB  Factors affecting our dietary requirements\nThe daily amounts of foods from different food groups shown on p. 24 \nare only a general recommendation for an adult. Dietary requirements \nactually vary from person to person. The table below shows recommended \ndaily dietary intakes for different groups of Chinese people. Can you \nidentify some factors affecting our dietary requirements?\nAge\n(years)\nEnergy (kJ) Protein \n(g)\nMinerals Vitamins\nCalcium (mg) Iron (mg) A (μg) D (μg) C (mg)\nChildren\n4-6 5440 30 800 10 360 10 50\n7-10 7110 40 1000 13 500 10 65\nTeenagers\n11-13 9830 8580 60 55 1200 1200 15 18 670 630 10 10 90 90\n14-17 11920 9620 75 60 1000 1000 16 18 820 630 10 10 100 100\nAdults\n18-49 10880 8790 65 55 800 800 12 20 800 700 10 10 100 100\n50-64 10250 8580 65 55 1000 1000 12 12 800 700 10 10 100 100\nElderly\n65-80 9830 8160 65 55 1000 1000 12 12 800 700 15 15 100 100\nPregnancy – 10040 – 70 – 1000 – 24 – 700 – 10 – 115\nBreast-feeding – 10880 – 80 – 1000 – 24 – 1300 – 10 – 150\nHere are some factors affecting our dietary requirements.\n1 Age \n• Children require the greatest  \namount of energy per unit body mass.\n Reason: They have the  highest \nmetabolic rate. It is because they have \nthe highest growth rate and highest \nrate of heat loss  due to their highest \nsurface area to volume ratio. A higher metabolic rate is required to \ngenerate more heat to keep their bodies warm.\n• Children and teenagers also need large amounts of protein , \ncalcium and iron.\n Reason: They are growing actively. These nutrients are needed for \nbuilding body tissues, such as muscles, bones, teeth and blood.\nKey:      male  \n            female  \nNSSBIO3E_SB1A_Ch05_e.indd   25 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 26\nII\nfoetus 胎兒  menstruation 月經\n2 Sex\n• Males generally need more energy  \nthan females.\n Reason: They usually have a higher \nmetabolic rate. This is because they \nhave a larger body size and are more \nmuscular. Also, they have a higher \nrate of heat loss  as they have less \nsubcutaneous fat.\n• Males also need more protein than females.\n Reason: Males are more muscular. Protein is needed to build and \nrepair muscles.\n• Females need more iron than males.\n Reason: Iron is needed to replace the loss of iron during \nmenstruation*.\n3 Level of activity\n• People who are more physically active  \nneed more energy. For example, the \ndiet of a construction worker should \ninclude more carbohydrate-rich foods \nthan that of an office worker of the \nsame sex and age.\n Reason: Energy is needed for \nmuscular activities.\n4 Body status\n• Pregnant women need more energy ,  \nprotein and iron.\n Reason: Energy and protein are \nneeded for the growth of the foetus *. \nIron is needed for the  formation of \nfoetal red blood cells .\n• Breast-feeding mothers need an extra \nsupply of various types of nutrients.\n Reason: These nutrients are needed \nfor milk production.\nNSSBIO3E_SB1A_Ch05_e.indd   26 18/5/2020   下午3:39\n\n5   Food and humans\n5– 27\nobesity 肥胖症  overweight 過重\nC  Eating too little and eating too much\n1 Eating too little\nIf people are eating too little such that their  \nenergy input is less than their energy \noutput, e.g. during starvation, the body breaks \ndown food reserves (stored glycogen and fat) \nto provide energy. Once these food reserves \nhave been used up, muscle protein may also \nbe broken down to release energy.\nThe breakdown of stored fat and muscle \nprotein results in weight loss. If such \ncondition continues for a period of time, the \nperson may become thin and weak. If the body \ndoes not get enough nutrients to maintain \nhealth, various deficiency diseases may develop.\n2 Eating too much\nIf people are eating too much such that their energy input is greater \nthan their energy output , they gain weight. Excess lipids in the diet \nare stored as fat in the body. Excess sugars, starch and protein may also \nbe converted into fat and stored in the body. When body weight exceeds \nnormal levels, a person is said to be overweight*. The condition of being \nseriously overweight is called  obesity*.\nFig 5.30   A starving child\nEatSmart Restaurant \nStar+\nUse this app to find  \nrestaurants that provide \nhealthy dishes.\n  iOS   Android\nSurface area to volume ratio\nThree cubes of different volumes are shown below. How are their surface area to volume ratios different?\n1 cm\nsurface area:\n1 × 1 × 6 = 6 cm2\nvolume:\n1 × 1 × 1 = 1 cm\n3\nsurface area to volume ratio: 6\ncube of sides 1 cm\n2 cm\nsurface area:\n2 × 2 × 6 = 24 cm\n2\nvolume:\n2 × 2 × 2 = 8 cm\n3\nsurface area to volume ratio: 3\ncube of sides 2 cm\n3 cm\nsurface area:\n3 × 3 × 6 = 54 cm\n2\nvolume:\n3 × 3 × 3 = 27 cm\n3\nsurface area to volume ratio: 2\ncube of sides 3 cm\nFrom the above, we can see that the smaller the volume, the larger the surface area to volume ratio. \nChildren have a smaller body size (i.e. volume) and therefore a larger surface area to volume ratio.\nNSSBIO3E_SB1A_Ch05_e.indd   27 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 28\nII\nanorexia nervosa 神經性厭食  arthritis 關節炎  body mass index (BMI) 體重指數  bulimia nervosa 神經性暴食   \ndiabetes mellitus 糖尿病  laxative 輕瀉藥  vomit 嘔吐\nAccording to the Population Health Survey conducted by the \ngovernment between 2014 to 2015, half of Hong Kong people over age \n15 are overweight or obese (Fig 5.31). Overweight and obesity are on the \nrise in many countries. This may be due to the intake of large amounts \nof foods that are high in lipids and sugars, and a lack of exercise.\nWhether a person is \noverweight or obese can be \ndetermined using the body \nmass index* (BMI).\nBMI = Body weight in kg / \n(height in m)\n2\nBMI Status\n<18.5 Underweight\n18.5–23 Normal\n23–25 Overweight\n>25 Obese\nNote: The classification above \nis recommended by the \nWHO for Asian adults, both \nmales and females. It is not \napplicable to children under \nage 18 or women who are \npregnant.\nEating disorders\nAnorexia nervosa\nAnorexia nervosa * is a disease of under-\neating. Patients with anorexia nervosa \nconsider themselves fat even though they \nare actually very thin. They are afraid of \ngaining weight, thus refusing to eat. They \nmay suffer from health problems associated \nwith under-eating. Without proper \ntreatment, they can become dangerously \nweak or even die.\nBulimia nervosa\nBulimia nervosa * is another eating disorder. Patients with bulimia nervosa \nalso have intense fear of gaining weight. They eat a lot of food in a very \nshort time and then use various methods like inducing vomiting\n*, taking \nlaxatives*, or doing excessive exercise to stop themselves from gaining \nweight. They may also suffer from health problems associated with  \nunder-eating.\nFig 5.32   A woman suffering \nfrom anorexia nervosa\nFig 5.31   Percentages of overweight or obese Hong Kong people in different age groups\n100\n80\n60\n40\n20\n0\n15−24 25−34 35−44 45−54 55−84\n24.1 \n37.2\n49.7\n62.1 57.6 \nKey:\nobese\nage group\npercentage\noverweight\n(Source: Report of \nPopulation Health Survey \n2014/15, the Department \nof Health)\nPeople who are overweight or obese have a higher risk of a number of \ndiseases like diabetes mellitus *, high blood pressure, heart disease, \nstroke and arthritis*.\nVisit the following website \nto learn more about \neating disorders:\nhttp://www.heda-hk.org/\nindex.php?lang=en \nNSSBIO3E_SB1A_Ch05_e.indd   28 18/5/2020   下午3:39\n\n5   Food and humans\n5– 29\nSalt/Sugar Label Scheme\nTo help consumers identify foods  \nwith a low salt or sugar content, the \ngovernment introduced the ‘Salt/\nSugar Label Scheme’ in 2017. Food \nproducers can put labels on the \npackaging of the foods if the salt or \nsugar content is lower than a certain \namount.\nD  Using nutrition labels to choose foods\nMost pre-packaged foods in Hong Kong have a nutrition label on their \npackaging. Nutrition labels provide information about the energy and \nnutrient contents of the food.\nFig 5.33   Drink with a ‘low sugar’ label\n1 Note the reference amount  \nEnergy and nutrient contents can be expressed in:\nPer 100g\n Per Serving\n Per Package\nYou have to calculate the amounts of energy and \nnutrients you will get based on the amount of the \nfood you eat. \n2 Look at the energy content\nNote the unit of the energy content. The units that \nare commonly used include kilocalorie (kcal), Calorie \n(Cal) and kilojoule (kJ). \n1 kcal = 1000 cal = 1 Cal = 4.2 kJ\n3 Look at the nutrient contents\nThe contents of 7 nutrients ( proteins, total fats, saturated fats, trans fats, carbohydrates, sugars \nand sodium) are commonly listed on labels. Contents of other nutrients may also be included.\nChoose foods that have smaller amounts of total fats, saturated fats, trans fats, sugars and sodium. \nObtaining too much of these nutrients may cause health problems.\nHow to read a nutrition label?\nNSSBIO3E_SB1A_Ch05_e.indd   29 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 30\nII\nThe diagrams below show the nutrition labels of two different sandwiches.\nSandwich X – egg mayonnaise sandwich\n Sandwich Y – ham and egg sandwich\na i Which sandwich has a higher energy content? (1 mark)\n ii  Which food substance provides most of the energy content in the sandwich in i?  \nExplain your answer. (2 marks)\nb Amy is a teenage girl. She is planning to lose weight by eating only three packs of sandwich X a \nday for a month.\n i  The recommended daily energy intake for a girl of her age is 2290 kcal. Explain why it is likely \nthat she will lose weight after one month if she follows her plan. (3 marks)\n ii  State one health problem that may result if she adopts this plan for a prolonged period. \nExplain your answer. (2 marks)\nSuggested answers\na i Sandwich X   1\n ii Lipids   1\n   The energy value of each gram of lipid is about two times of  \nthose of carbohydrate and protein.   1\nb i If she follows her plan, her daily energy intake will be 852 kcal.   1\n  which is far less than her daily energy requirement.   1\n  The stored fat in her body will be broken down to release  \n energy.   1\n  This will lead to a loss in body weight.\n ii She may suffer from constipation.   1\n  There is insufficient dietary fibre in her diet.   1\n  (or other reasonable answers)\nLearning through examples Skill practiceSkill builder\nComparing the \nenergy or nutrient \ncontent of different \nfoods\nRefer to p. 31.\nNSSBIO3E_SB1A_Ch05_e.indd   30 18/5/2020   下午3:39\n\n5   Food and humans\n5– 31\nCompare the sugar content of  \nthese two brands of soy milk.  \nWhich one has a lower sugar \ncontent?\nLearning through examples Skill practiceSkill builder\nNutritional information\nPer 100 mL\nCarbohydrates 4 g\n- Sugars 3.8 g\nSoy milk Y\nNutritional information\nServing size: 236 mL Per serving\nCarbohydrates 10.2 g\n- Sugars 10.2 g\nSoy milk X\n  Q12 (p. 37)\nRecall Think about... (p. 1)\n1  A balanced diet is a diet consisting of all the food substances in the right \namounts and proportions.\n2  Proteins are used for growth, repair of body tissues and producing substances \nlike enzymes. They may also be used for providing energy.\nSuggested answers to ?\np. 2   Yes. Our body still needs energy to maintain basic body activities like \nbreathing and heart beating when we are sleeping .\np. 4   As they are insoluble, they do not diffuse out of the cells. Also, they do \nnot affect the water potential inside the cells. As they are compact, they \ncan be stored without taking up much space.\nComparing the energy or nutrient content of different foods\nThe reference amounts on different nutrition labels may be different. To compare the energy or \nnutrient content of different foods, we have to express the values in the same reference amount. \nEnergy content per 105 g is 284 kcal.\nTherefore, the energy content per 100 g:\n= 284 kcal\n105 g\n × 100 g = 270 kcal\nEnergy content per 100 g is 177 kcal.\nNow it is clear that the energy content of sandwich X is higher.\nLearning through examples Skill practiceSkill builder\nNSSBIO3E_SB1A_Ch05_e.indd   31 18/5/2020   下午3:39\n\nProject\n5– 32\nBetty is a secondary school girl. She loves eating fast food. At a recent health check, she \nwas told that she is overweight. To ensure that she has a healthy diet, she has decided to \nprepare three meals each day by herself. She is wondering how she can prepare healthy \nand delicious meals easily.\nHow can I prepare healthy \nand delicious meals easily? \nCan you help Betty design her meal plan?\nTo stay healthy, we should include foods from different food groups in the right amounts in our \ndiet. The suggested amounts of foods from different food groups for a teenage girl like Betty are \nshown below. \nFood group Suggested amount\nGrains 4–6 bowls\nVegetables at least 3 servings\nFruits at least 2 servings\nMeat, fish, eggs and alternatives 4–6 taels\nMilk and alternatives 2 servings\nFats, oils, salt and sugar eat the least\nFluid (for example: water, tea, milk and soup) 6–8 glasses\nDesigning a meal plan\nProblem\nResearch\nNSSBIO3E_SB1A_Ch05_e.indd   32 18/5/2020   下午3:39\n\n5– 33\nHere is an example of what someone may eat for their three meals. Do you think these are good \nchoices for Betty? Why?\nDesign\nDesign a meal plan for Betty with reference to the guiding questions below. Show your plan to your \nteacher.\nGuiding questions\n1 How can the meals provide the right amounts of energy and nutrients for Betty?\n2 How can the meals be prepared more easily?\n3 How can the meals be more attractive and delicious?\nTest\nEvaluate your meal plan.\n1 Do the meals provide the right amount of energy for Betty?  Yes  No\n2 Do the meals provide the right amounts of nutrients (particularly protein,  \nminerals, vitamins and dietary fibre) for Betty?  Yes  No\n3 Can each meal be prepared within 30 minutes?  Yes  No\n4 Are the meals safe to eat?  Yes  No\n5 Are the meals attractive and delicious?  Yes  No\nImprove\nCompare your meal plan with those of other groups. Which group got the best result? What are the \nspecial features of their meal plan? Modify your plan and evaluate again.\nSearch for more information about designing meal plans.  \nBelow is a useful website.\nhttps://www.cfs.gov.hk/english/nutrient/searchmenu.php\nBreakfast\ninstant noodle with fried \negg and luncheon meat\norange juice\nLunch\ncola\nfried flat rice noodle \nwith beef \nDinner\napple\nma-po \ntofu\nsteamed ricevegetable\nNSSBIO3E_SB1A_Ch05_e.indd   33 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 34\nII\n 1  amino acid  氨基酸\n 2  anaemia  貧血\n 3  Benedict’s test  本立德試驗\n 4  dietary fibre  食用纖維\n 5  disaccharide  雙糖\n 6  fatty acid  脂肪酸\n 7  food pyramid  食物金字塔\n 8  glycerol  甘油\n 9  glycogen  糖原\n10  kwashiorkor  蛋白缺乏病\n11  mineral  礦物質\n12  monosaccharide  單糖\n13  night blindness  夜盲症\n14  obesity  肥胖症\n15  polysaccharide  多糖\n16  reducing sugar  還原糖\n17  rickets  軟骨病\n18  scurvy  壞血病\n19  triglyceride  甘油三酯\n20  vitamin  維生素\nKey terms   \nConcept map\ncontains\nthat \nprovide \nenergy \ninclude\nthat do not \nprovide  \nenergy  \ninclude\nare provided \nin the right \namounts and \nproportions in a\ntaking in  \ntoo much  \nmay lead to\ncan be \nplanned \naccording to\nnot taking \nin enough \nmay lead to\nFood\nfood substances\ncarbohydrates proteins\nlipids\ndietary fibreminerals water\nfood pyramid\nbalanced diet overweight \nand obesity\ndeficiency \ndiseases\nvitamins\nNSSBIO3E_SB1A_Ch05_e.indd   34 18/5/2020   下午3:39\n\n5   Food and humans\n5– 35\nExercise\nSection 5.1\nLevel 1\n1  A student carried out food tests on a food. The \ntable below shows the results.\nFood test Result\nBenedict’s test A brick-red precipitate is formed.\nGrease spot test A translucent spot is formed.\nDCPIP test DCPIP solution remains blue.\n The food may be\n (1) broccoli.\n (2) milk.\n (3) orange.\n A (1) only B (2) only\n C (1) and (2) only D (2) and (3) only\n  p. 5, 7, 15\n2  Which of the following correctly matches a \nfood substance with its deficiency disease?\nFood substance Deficiency disease\nA calcium rickets\nB iron night blindness\nC vitamin A anaemia\nD vitamin C constipation\n \n p. 12–15\nLevel 2\n3  DSE Bio 2016 IA Q3\n In which of the following pairs of carbohydrates \ncan Benedict’s test be used to distinguish the \ntwo carbohydrates from one another?\n (1) sucrose and starch\n (2) sucrose and maltose\n (3) glucose and maltose\n (4) glucose and starch\n A (1) and (3) only B (1) and (4) only\n C (2) and (3) only D (2) and (4) only \n \n p. 3–5\nMC\nMC\nMC\nDSE Bio 2016 IA Q5, 6\nDirections: Questions 4 and 5 refer to the diagram \nbelow, which shows the nutrition label of a food \nproduct:\n4  Which of the following food substances \nprovides most of the energy content in this \nfood product?\n A fat \n B protein\n C sodium\n D carbohydrate\n  p. 4, 6, 10\n5  The food product bearing this nutrition label is \nmost likely to be\n A milk. \n B bread.\n C sausages.\n D potato chips.\n \n p. 11, 18\n6  A student carried out a series of tests on \ntwo tubes of solutions. Tube X contained a \nmixture of sucrose and cellulose, while tube Y \ncontained starch and fructose. Which of the \nfollowing correctly shows the results?\nIodine test Benedict’s test\nX Y X Y\nA − + − +\nB − − + −\nC + + − +\nD + − + −\n \n p. 5\nMC\nMC\nMC\nNSSBIO3E_SB1A_Ch05_e.indd   35 18/5/2020   下午3:39\n\nOrganisms and Environment\n5– 36\nII\nLevel 3\n7  A student carried out an investigation on the \neffects of cooking methods on the vitamin \nC content of cabbage. She prepared three \nsamples of cabbage juices, X, Y and Z. Sample \nX was obtained from uncooked fresh cabbage, \nwhile samples Y and Z were obtained from \ncabbage cooked using different methods. The \ntable below shows the number of drops of the \ndifferent samples needed to decolourize  \n1 cm\n3 DCPIP solution.\nCooking method Number \nof drops\nX uncooked 50\nY added to cold water and then \nboiled for 5 minutes\n250\nZ added to boiling water and \nthen boiled for 5 minutes\n110\n a If 15 drops of 0.1% vitamin C solution \nare needed to decolourize 1 cm\n3 DCPIP \nsolution, estimate the vitamin C content of \nthe fresh cabbage juice. \nHint (p. 38)  \n (2 marks)\n b With reference to the results, state two \nconclusions about the effects of cooking \nmethods on the vitamin C content of \ncabbage. (4 marks)\n \n p. 13, 15\n8  Edexcel IGCSE 2008\n Hopkins was a scientist who studied the effects \nof ‘accessory food factors’ on the growth of \nrats. He had two groups of young rats, group A \nand group B.\n Group A – fed on a diet of pure protein, \ncarbohydrate, fat, mineral salts and water. \nThese rats failed to grow normally.\n Group B – fed on the same diet but with the \naddition of 2 cm\n3 of milk each day. These rats \ngrew well. After eighteen days the diets were \nswapped for each group so that group A now \ngot the 2 cm\n3 of milk and group B received no \nmilk. His results are shown below.\n \n80\n70\n60\n50\n40\n0 10 20 30 40 50\nrats given milk\ntime in days\ngroup A\ngroup B\ndiet swapped at day 18\naverage mass of rats in g\nrats with no milk\n a i Use the graph to describe the changes \nin the mass of the rats in each group \nfrom day 18 to day 50. (4 marks)\n  ii What conclusions can you draw as to \nthe effect of milk on the growth of the \nrats in Hopkins’ experiment? (2 marks)\n b Suggest why Hopkins swapped the diets \nafter 18 days. (1 mark)\n c To enable a valid comparison to be made \nbetween the two groups, other variables \nneed to be kept the same. Suggest one such \n\n[TRUNCATED_BY_IMPORT]',1,'2026-04-04 17:22:03','2026-04-04 17:22:03');
/*!40000 ALTER TABLE `textbooks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
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

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-04 17:43:38
