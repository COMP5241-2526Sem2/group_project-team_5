from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OpenStudy Backend"
    app_env: str = "dev"
    api_base_url: str = "http://localhost:8000"

    database_url: str = "mysql+aiomysql://user:password@localhost:3306/openstudy?charset=utf8mb4"

    jwt_secret_key: str = "CHANGE_ME"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    ohmygpt_api_key: str = ""
    ohmygpt_base_url: str = "https://api.ohmygpt.com/v1"
    ohmygpt_model: str = "gpt-5.4-mini"  # 可配置模型
    ohmygpt_temperature: float = 0.7  # 可配置温度

    # Diagnostics
    # 默认不落盘保存 LLM 原始会话（避免在 api/v1 下生成 llm_raw_session_*.txt）
    dump_llm_raw_sessions: bool = False

    # 固定从 backend/.env 加载，避免受启动工作目录影响
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    model_config = SettingsConfigDict(
        env_file=str(_env_path),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
