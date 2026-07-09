from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://postgres:password@localhost:5432/tour_recommendation"
    
    # Gemini API
    gemini_api_key: str = ""
    
    # Security
    api_key: str = "internal-api-key-for-web-service"
    
    # Recommendation
    top_n_default: int = 10
    min_reviews_for_tag: int = 5
    
    class Config:
        env_file = ".env"
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
