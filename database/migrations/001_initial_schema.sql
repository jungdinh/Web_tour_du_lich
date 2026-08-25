-- pgvector extension is optional and used only if you want to use native
-- vector types. The recommender relies on numpy/scikit-learn in the AI
-- service, so we comment this out by default to avoid breaking
-- installations that don't have pgvector installed.
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Table: tours
CREATE TABLE tours (
    id SERIAL PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    price INT NOT NULL,
    duration INT NOT NULL, -- in days
    description TEXT,
    avg_rating FLOAT DEFAULT 0,
    review_count INT DEFAULT 0,
    source VARCHAR(50) NOT NULL, -- 'klook' or 'traveloka'
    source_url VARCHAR(1000),
    season VARCHAR(50), -- 'spring', 'summer', 'autumn', 'winter', 'all'
    image_url VARCHAR(1000),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: reviews
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    tour_id INT REFERENCES tours(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    language VARCHAR(10) DEFAULT 'vi',
    rating FLOAT,
    reviewer_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: tour_tags (Tag Taxonomy)
CREATE TABLE tour_tags (
    id SERIAL PRIMARY KEY,
    tour_id INT REFERENCES tours(id) ON DELETE CASCADE,
    tag VARCHAR(50) NOT NULL,
    weight FLOAT NOT NULL CHECK (weight >= 0 AND weight <= 1),
    UNIQUE(tour_id, tag)
);

-- Table: users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user', -- 'user' or 'admin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: user_preferences (User Profile Vector)
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    tag VARCHAR(50) NOT NULL,
    weight FLOAT NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 1),
    UNIQUE(user_id, tag)
);

-- Table: user_actions (Implicit Feedback)
CREATE TABLE user_actions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    tour_id INT REFERENCES tours(id) ON DELETE SET NULL,
    action_type VARCHAR(20) NOT NULL, -- 'click', 'view', 'save', 'search'
    search_query VARCHAR(500), -- for 'search' action
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: chat_sessions (AI Chat History)
CREATE TABLE chat_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: chat_messages
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: favorites (User bookmarks/saved tours)
CREATE TABLE favorites (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    tour_id INT REFERENCES tours(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tour_id)
);

-- Indexes for performance
CREATE INDEX idx_tours_destination ON tours(destination);
CREATE INDEX idx_tours_price ON tours(price);
CREATE INDEX idx_tours_avg_rating ON tours(avg_rating);
CREATE INDEX idx_reviews_tour_id ON reviews(tour_id);
CREATE INDEX idx_tour_tags_tour_id ON tour_tags(tour_id);
CREATE INDEX idx_user_actions_user_created ON user_actions(user_id, created_at);
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX idx_favorites_user_id ON favorites(user_id);
CREATE INDEX idx_favorites_tour_id ON favorites(tour_id);

-- Tag Taxonomy (21 tags cố định - mở rộng từ 15 tags ban đầu)
-- INSERT INTO tags (name, description) VALUES
-- ('family', 'Phù hợp gia đình'),
-- ('romantic', 'Dành cho cặp đôi'),
-- ('adventure', 'Mạo hiểm, khám phá'),
-- ('beach', 'Biển'),
-- ('nature', 'Thiên nhiên'),
-- ('food', 'Ẩm thực'),
-- ('culture', 'Văn hóa'),
-- ('relax', 'Nghỉ dưỡng'),
-- ('budget', 'Giá rẻ, tiết kiệm'),
-- ('luxury', 'Sang trọng'),
-- ('spiritual', 'Tâm linh'),
-- ('photography', 'Chụp ảnh đẹp'),
-- ('shopping', 'Mua sắm'),
-- ('mountain', 'Núi, cao nguyên'),
-- ('city', 'Thành phố'),
-- ('history', 'Lịch sử, di tích'),
-- ('festival', 'Lễ hội'),
-- ('wildlife', 'Động vật hoang dã'),
-- ('cruise', 'Du thuyền'),
-- ('nightlife', 'Phố đêm, bar, club'),
-- ('water_sports', 'Lặn, kayak, surfing');
