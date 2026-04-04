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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
