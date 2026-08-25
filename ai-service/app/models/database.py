"""
Database models and connection
"""
import os
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:123@localhost:5432/tour_recommendation"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class Tour(Base):
    __tablename__ = "tours"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False)
    destination = Column(String(255), nullable=False)
    price = Column(Integer, nullable=False)
    duration = Column(Integer, nullable=False)
    description = Column(Text)
    avg_rating = Column(Float, default=0)
    review_count = Column(Integer, default=0)
    source = Column(String(50))
    source_url = Column(String(1000))
    season = Column(String(50))
    image_url = Column(String(1000))
    duration_label = Column(String(20))
    original_price = Column(Integer)
    highlights = Column(JSON)
    places = Column(JSON)
    topics = Column(JSON)
    gallery = Column(JSON)
    itinerary = Column(JSON)
    included = Column(JSON)
    excluded = Column(JSON)
    schedule = Column(JSON)
    transport = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    tags = relationship("TourTag", back_populates="tour")
    reviews = relationship("Review", back_populates="tour")


class Review(Base):
    __tablename__ = "reviews"
    
    id = Column(Integer, primary_key=True, index=True)
    tour_id = Column(Integer, ForeignKey("tours.id", ondelete="CASCADE"))
    content = Column(Text, nullable=False)
    language = Column(String(10), default="vi")
    rating = Column(Float)
    reviewer_name = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    tour = relationship("Tour", back_populates="reviews")


class TourTag(Base):
    __tablename__ = "tour_tags"
    
    id = Column(Integer, primary_key=True, index=True)
    tour_id = Column(Integer, ForeignKey("tours.id", ondelete="CASCADE"))
    tag = Column(String(50), nullable=False)
    weight = Column(Float, nullable=False)
    
    tour = relationship("Tour", back_populates="tags")


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="user")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    preferences = relationship("UserPreference", back_populates="user")
    actions = relationship("UserAction", back_populates="user")


class UserPreference(Base):
    __tablename__ = "user_preferences"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    tag = Column(String(50), nullable=False)
    weight = Column(Float, nullable=False, default=0)
    
    user = relationship("User", back_populates="preferences")


class UserAction(Base):
    __tablename__ = "user_actions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    tour_id = Column(Integer, ForeignKey("tours.id", ondelete="SET NULL"))
    action_type = Column(String(20), nullable=False)
    search_query = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="actions")


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    messages = relationship("ChatMessage", back_populates="session")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"))
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    session = relationship("ChatSession", back_populates="messages")


def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
