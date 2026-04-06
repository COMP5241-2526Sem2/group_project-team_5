BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 62125dd14faa

CREATE TYPE paper_status AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE papers (
    id BIGSERIAL NOT NULL, 
    title TEXT NOT NULL, 
    course_id BIGINT NOT NULL, 
    grade TEXT NOT NULL, 
    subject TEXT NOT NULL, 
    semester TEXT, 
    exam_type TEXT NOT NULL, 
    total_score INTEGER NOT NULL, 
    duration_min INTEGER NOT NULL, 
    question_count INTEGER NOT NULL, 
    quality_score INTEGER, 
    status paper_status NOT NULL, 
    created_by BIGINT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    published_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_papers_duration_non_negative CHECK (duration_min >= 0), 
    CONSTRAINT ck_papers_quality_score_range CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)), 
    CONSTRAINT ck_papers_question_count_non_negative CHECK (question_count >= 0), 
    CONSTRAINT ck_papers_total_score_non_negative CHECK (total_score >= 0)
);

CREATE INDEX ix_papers_course_id ON papers (course_id);

CREATE INDEX ix_papers_created_by ON papers (created_by);

CREATE TYPE question_status AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

CREATE TABLE questions (
    id BIGSERIAL NOT NULL, 
    title TEXT NOT NULL, 
    course_id BIGINT NOT NULL, 
    paper_id BIGINT, 
    due_at TIMESTAMP WITH TIME ZONE, 
    duration_min INTEGER, 
    total_score INTEGER NOT NULL, 
    status question_status NOT NULL, 
    created_by BIGINT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_questions_duration_non_negative CHECK (duration_min IS NULL OR duration_min >= 0), 
    CONSTRAINT ck_questions_total_score_non_negative CHECK (total_score >= 0), 
    FOREIGN KEY(paper_id) REFERENCES papers (id) ON DELETE SET NULL
);

CREATE INDEX ix_questions_course_id ON questions (course_id);

CREATE INDEX ix_questions_created_by ON questions (created_by);

CREATE INDEX ix_questions_paper_id ON questions (paper_id);

CREATE TABLE paper_sections (
    id BIGSERIAL NOT NULL, 
    paper_id BIGINT NOT NULL, 
    title TEXT NOT NULL, 
    section_order INTEGER NOT NULL, 
    question_type TEXT NOT NULL, 
    question_count INTEGER NOT NULL, 
    score_each NUMERIC(6, 2) NOT NULL, 
    total_score NUMERIC(8, 2) NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_paper_sections_question_count_non_negative CHECK (question_count >= 0), 
    CONSTRAINT ck_paper_sections_score_each_non_negative CHECK (score_each >= 0), 
    CONSTRAINT ck_paper_sections_order_positive CHECK (section_order >= 1), 
    CONSTRAINT ck_paper_sections_total_score_non_negative CHECK (total_score >= 0), 
    FOREIGN KEY(paper_id) REFERENCES papers (id) ON DELETE CASCADE, 
    CONSTRAINT uq_paper_sections_paper_order UNIQUE (paper_id, section_order)
);

CREATE INDEX ix_paper_sections_paper_id ON paper_sections (paper_id);

CREATE TYPE attempt_status AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

CREATE TABLE question_attempts (
    id BIGSERIAL NOT NULL, 
    question_id BIGINT NOT NULL, 
    student_id BIGINT NOT NULL, 
    started_at TIMESTAMP WITH TIME ZONE, 
    submitted_at TIMESTAMP WITH TIME ZONE, 
    score NUMERIC(8, 2), 
    status attempt_status NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_question_attempts_score_non_negative CHECK (score IS NULL OR score >= 0), 
    FOREIGN KEY(question_id) REFERENCES questions (id) ON DELETE CASCADE, 
    CONSTRAINT uq_question_attempts_question_student UNIQUE (question_id, student_id)
);

CREATE INDEX ix_question_attempts_question_id ON question_attempts (question_id);

CREATE INDEX ix_question_attempts_student_id ON question_attempts (student_id);

CREATE TABLE paper_questions (
    id BIGSERIAL NOT NULL, 
    paper_id BIGINT NOT NULL, 
    section_id BIGINT NOT NULL, 
    order_num INTEGER NOT NULL, 
    question_type TEXT NOT NULL, 
    prompt TEXT NOT NULL, 
    difficulty TEXT, 
    score NUMERIC(6, 2) NOT NULL, 
    answer_text TEXT, 
    explanation TEXT, 
    chapter TEXT, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_paper_questions_order_positive CHECK (order_num >= 1), 
    CONSTRAINT ck_paper_questions_score_non_negative CHECK (score >= 0), 
    FOREIGN KEY(paper_id) REFERENCES papers (id) ON DELETE CASCADE, 
    FOREIGN KEY(section_id) REFERENCES paper_sections (id) ON DELETE CASCADE, 
    CONSTRAINT uq_paper_questions_paper_order UNIQUE (paper_id, order_num)
);

CREATE INDEX ix_paper_questions_paper_id ON paper_questions (paper_id);

CREATE INDEX ix_paper_questions_section_id ON paper_questions (section_id);

CREATE TABLE question_attempt_answers (
    id BIGSERIAL NOT NULL, 
    attempt_id BIGINT NOT NULL, 
    question_id BIGINT NOT NULL, 
    selected_option TEXT, 
    text_answer TEXT, 
    is_correct BOOLEAN, 
    awarded_score NUMERIC(6, 2), 
    teacher_feedback TEXT, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_attempt_answers_awarded_score_non_negative CHECK (awarded_score IS NULL OR awarded_score >= 0), 
    FOREIGN KEY(attempt_id) REFERENCES question_attempts (id) ON DELETE CASCADE, 
    FOREIGN KEY(question_id) REFERENCES paper_questions (id) ON DELETE CASCADE, 
    CONSTRAINT uq_question_attempt_answers_attempt_question UNIQUE (attempt_id, question_id)
);

CREATE INDEX ix_question_attempt_answers_attempt_id ON question_attempt_answers (attempt_id);

CREATE INDEX ix_question_attempt_answers_question_id ON question_attempt_answers (question_id);

CREATE TABLE paper_question_options (
    id BIGSERIAL NOT NULL, 
    question_id BIGINT NOT NULL, 
    option_key TEXT NOT NULL, 
    option_text TEXT NOT NULL, 
    is_correct BOOLEAN, 
    PRIMARY KEY (id), 
    FOREIGN KEY(question_id) REFERENCES paper_questions (id) ON DELETE CASCADE, 
    CONSTRAINT uq_paper_question_options_key UNIQUE (question_id, option_key)
);

CREATE INDEX ix_paper_question_options_question_id ON paper_question_options (question_id);

INSERT INTO alembic_version (version_num) VALUES ('62125dd14faa') RETURNING alembic_version.version_num;

-- Running upgrade 62125dd14faa -> 9d2b6a7d1c41

CREATE TYPE account_type AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

CREATE TABLE users (
    id BIGSERIAL NOT NULL, 
    account_id TEXT NOT NULL, 
    hashed_password TEXT NOT NULL, 
    name TEXT NOT NULL, 
    account_type account_type NOT NULL, 
    phone TEXT, 
    id_card TEXT, 
    accessibility TEXT, 
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    last_login TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    UNIQUE (account_id)
);

CREATE INDEX ix_users_account_type ON users (account_type);

CREATE TABLE student_profiles (
    id BIGSERIAL NOT NULL, 
    user_id BIGINT NOT NULL, 
    student_id TEXT NOT NULL, 
    department TEXT, 
    major TEXT, 
    homeroom TEXT, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    UNIQUE (student_id), 
    UNIQUE (user_id)
);

CREATE TABLE teacher_profiles (
    id BIGSERIAL NOT NULL, 
    user_id BIGINT NOT NULL, 
    employee_id TEXT NOT NULL, 
    department TEXT, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    UNIQUE (employee_id), 
    UNIQUE (user_id), 
    CONSTRAINT uq_teacher_profiles_user_employee UNIQUE (user_id, employee_id)
);

CREATE TYPE course_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

CREATE TABLE courses (
    id BIGSERIAL NOT NULL, 
    name TEXT NOT NULL, 
    subject TEXT NOT NULL, 
    grades JSON, 
    period TEXT, 
    room TEXT, 
    weekdays JSON, 
    max_students INTEGER, 
    status course_status NOT NULL, 
    teacher_id BIGINT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_courses_max_students_positive CHECK (max_students IS NULL OR max_students >= 1), 
    FOREIGN KEY(teacher_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX ix_courses_teacher_id ON courses (teacher_id);

CREATE TABLE enrollments (
    id BIGSERIAL NOT NULL, 
    student_id BIGINT NOT NULL, 
    course_id BIGINT NOT NULL, 
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(student_id) REFERENCES users (id) ON DELETE RESTRICT, 
    FOREIGN KEY(course_id) REFERENCES courses (id) ON DELETE CASCADE, 
    CONSTRAINT uq_enrollments_student_course UNIQUE (student_id, course_id)
);

CREATE INDEX ix_enrollments_student_id ON enrollments (student_id);

CREATE INDEX ix_enrollments_course_id ON enrollments (course_id);

CREATE TYPE deck_source AS ENUM ('KB_AI', 'PPT_IMPORT', 'HYBRID', 'MANUAL');

CREATE TYPE deck_status AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE lesson_decks (
    id BIGSERIAL NOT NULL, 
    title TEXT NOT NULL, 
    subject TEXT NOT NULL, 
    grade TEXT, 
    deck_source deck_source NOT NULL, 
    status deck_status NOT NULL, 
    teacher_id BIGINT NOT NULL, 
    thumbnail TEXT, 
    metadata JSON, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(teacher_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX ix_lesson_decks_teacher_id ON lesson_decks (teacher_id);

CREATE TABLE slides (
    id BIGSERIAL NOT NULL, 
    deck_id BIGINT NOT NULL, 
    title TEXT, 
    order_num INTEGER NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_slides_order_positive CHECK (order_num >= 1), 
    FOREIGN KEY(deck_id) REFERENCES lesson_decks (id) ON DELETE CASCADE, 
    CONSTRAINT uq_slides_deck_order UNIQUE (deck_id, order_num)
);

CREATE INDEX ix_slides_deck_id ON slides (deck_id);

CREATE TYPE slide_block_type AS ENUM ('TEXT', 'INTERACTIVE', 'EXERCISE_WALKTHROUGH', 'IMAGE');

CREATE TABLE slide_blocks (
    id BIGSERIAL NOT NULL, 
    slide_id BIGINT NOT NULL, 
    block_type slide_block_type NOT NULL, 
    content TEXT, 
    extra_payload JSON, 
    order_num INTEGER NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_slide_blocks_order_positive CHECK (order_num >= 1), 
    FOREIGN KEY(slide_id) REFERENCES slides (id) ON DELETE CASCADE, 
    CONSTRAINT uq_slide_blocks_slide_order UNIQUE (slide_id, order_num)
);

CREATE INDEX ix_slide_blocks_slide_id ON slide_blocks (slide_id);

CREATE TYPE lab_status AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');

CREATE TABLE lab_registries (
    id BIGSERIAL NOT NULL, 
    registry_key TEXT NOT NULL, 
    title TEXT NOT NULL, 
    subject TEXT, 
    type TEXT, 
    renderer_profile TEXT, 
    initial_state JSON, 
    reducer_spec JSON, 
    metadata JSON, 
    status lab_status NOT NULL, 
    teacher_id BIGINT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(teacher_id) REFERENCES users (id) ON DELETE SET NULL, 
    UNIQUE (registry_key), 
    CONSTRAINT uq_lab_registries_title_subject UNIQUE (title, subject)
);

CREATE INDEX ix_lab_registries_teacher_id ON lab_registries (teacher_id);

UPDATE alembic_version SET version_num='9d2b6a7d1c41' WHERE alembic_version.version_num = '62125dd14faa';

-- Running upgrade 9d2b6a7d1c41 -> c4a9d9f2b6e1

CREATE TABLE question_bank_items (
    id BIGSERIAL NOT NULL, 
    publisher TEXT, 
    grade TEXT NOT NULL, 
    subject TEXT NOT NULL, 
    semester TEXT, 
    question_type TEXT NOT NULL, 
    prompt TEXT NOT NULL, 
    difficulty TEXT, 
    answer_text TEXT, 
    explanation TEXT, 
    chapter TEXT, 
    source_paper_question_id BIGINT, 
    created_by BIGINT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(source_paper_question_id) REFERENCES paper_questions (id) ON DELETE SET NULL
);

CREATE INDEX ix_question_bank_items_source_paper_question_id ON question_bank_items (source_paper_question_id);

CREATE INDEX ix_question_bank_items_created_by ON question_bank_items (created_by);

CREATE TABLE question_bank_options (
    id BIGSERIAL NOT NULL, 
    bank_question_id BIGINT NOT NULL, 
    option_key TEXT NOT NULL, 
    option_text TEXT NOT NULL, 
    is_correct BOOLEAN, 
    PRIMARY KEY (id), 
    FOREIGN KEY(bank_question_id) REFERENCES question_bank_items (id) ON DELETE CASCADE, 
    CONSTRAINT uq_question_bank_options_key UNIQUE (bank_question_id, option_key)
);

CREATE INDEX ix_question_bank_options_bank_question_id ON question_bank_options (bank_question_id);

ALTER TABLE paper_questions ADD COLUMN bank_question_id BIGINT;

CREATE INDEX ix_paper_questions_bank_question_id ON paper_questions (bank_question_id);

ALTER TABLE paper_questions ADD CONSTRAINT fk_paper_questions_bank_question_id_question_bank_items FOREIGN KEY(bank_question_id) REFERENCES question_bank_items (id) ON DELETE SET NULL;

CREATE TABLE question_items (
    id BIGSERIAL NOT NULL, 
    question_id BIGINT NOT NULL, 
    bank_question_id BIGINT NOT NULL, 
    order_num INTEGER NOT NULL, 
    score NUMERIC(6, 2) NOT NULL, 
    prompt_snapshot TEXT, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_question_items_order_positive CHECK (order_num >= 1), 
    CONSTRAINT ck_question_items_score_non_negative CHECK (score >= 0), 
    FOREIGN KEY(question_id) REFERENCES questions (id) ON DELETE CASCADE, 
    FOREIGN KEY(bank_question_id) REFERENCES question_bank_items (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_question_items_order UNIQUE (question_id, order_num)
);

CREATE INDEX ix_question_items_question_id ON question_items (question_id);

CREATE INDEX ix_question_items_bank_question_id ON question_items (bank_question_id);

CREATE TYPE textbook_semester AS ENUM ('VOL1', 'VOL2');

CREATE TABLE textbooks (
    id BIGSERIAL NOT NULL, 
    publisher TEXT NOT NULL, 
    grade TEXT NOT NULL, 
    subject TEXT NOT NULL, 
    semester textbook_semester NOT NULL, 
    content TEXT NOT NULL, 
    created_by BIGINT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_textbooks_identity UNIQUE (publisher, grade, subject, semester)
);

CREATE INDEX ix_textbooks_created_by ON textbooks (created_by);

UPDATE alembic_version SET version_num='c4a9d9f2b6e1' WHERE alembic_version.version_num = '9d2b6a7d1c41';

-- Running upgrade c4a9d9f2b6e1 -> d8f1a2c3b4e5

ALTER TABLE question_bank_items ADD COLUMN source_type TEXT DEFAULT 'manual' NOT NULL;

ALTER TABLE question_bank_items ADD COLUMN source_id BIGINT;

CREATE INDEX ix_question_bank_items_source_id ON question_bank_items (source_id);

DROP INDEX ix_question_bank_items_source_paper_question_id;

ALTER TABLE question_bank_items DROP COLUMN source_paper_question_id;

DROP INDEX ix_questions_paper_id;

ALTER TABLE questions DROP COLUMN paper_id;

ALTER TABLE paper_questions DROP CONSTRAINT fk_paper_questions_bank_question_id_question_bank_items;

ALTER TABLE paper_questions ADD CONSTRAINT fk_paper_questions_bank_question_id_question_bank_items FOREIGN KEY(bank_question_id) REFERENCES question_bank_items (id) ON DELETE RESTRICT;

ALTER TABLE paper_questions ALTER COLUMN bank_question_id SET NOT NULL;

UPDATE alembic_version SET version_num='d8f1a2c3b4e5' WHERE alembic_version.version_num = 'c4a9d9f2b6e1';

-- Running upgrade d8f1a2c3b4e5 -> 8b3c1d2e4f5a

ALTER TABLE papers ADD COLUMN source_file_name TEXT;

ALTER TABLE papers ADD COLUMN source_pdf BYTEA;

UPDATE alembic_version SET version_num='8b3c1d2e4f5a' WHERE alembic_version.version_num = 'd8f1a2c3b4e5';

COMMIT;

