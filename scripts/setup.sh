#!/bin/bash

# Tour Recommendation System - Quick Start Script

echo "========================================"
echo "  Tour Recommendation AI - Setup"
echo "========================================"
echo ""

# Check if Docker is available
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo "🐳 Docker detected. Would you like to run with Docker? (y/n)"
    read -r use_docker
    
    if [ "$use_docker" = "y" ]; then
        echo ""
        echo "📦 Starting with Docker..."
        echo ""
        echo "⚠️  Make sure to set GEMINI_API_KEY in .env"
        echo ""
        docker-compose up -d
        echo ""
        echo "✅ Services started!"
        echo "   - Frontend: http://localhost:3000"
        echo "   - Web API:  http://localhost:4000"
        echo "   - AI API:   http://localhost:8000"
        exit 0
    fi
fi

# Local development
echo "💻 Setting up local development..."
echo ""

# Create .env if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file"
    echo "⚠️  Please edit .env and add your GEMINI_API_KEY"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."

# Frontend
if [ -d "frontend" ]; then
    echo "   Installing frontend..."
    cd frontend || exit
    npm install
    cd ..
fi

# Web Service
if [ -d "web-service" ]; then
    echo "   Installing web-service..."
    cd web-service || exit
    npm install
    cd ..
fi

# AI Service
if [ -d "ai-service" ]; then
    echo "   Installing ai-service..."
    cd ai-service || exit
    pip install -r requirements.txt
    cd ..
fi

# Crawler
if [ -d "crawler" ]; then
    echo "   Installing crawler..."
    cd crawler || exit
    pip install -r requirements.txt
    cd ..
fi

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "========================================"
echo "  Next Steps:"
echo "========================================"
echo ""
echo "1. Start PostgreSQL and run migrations:"
echo "   psql -U postgres -d tour_recommendation -f database/migrations/001_initial_schema.sql"
echo ""
echo "2. Generate sample data (optional):"
echo "   cd crawler && python scripts/generate_sample_data.py"
echo ""
echo "3. Start services (in separate terminals):"
echo ""
echo "   # Terminal 1 - Frontend"
echo "   cd frontend && npm run dev"
echo ""
echo "   # Terminal 2 - Web Service"
echo "   cd web-service && npm run dev"
echo ""
echo "   # Terminal 3 - AI Service"
echo "   cd ai-service && uvicorn app.main:app --reload --port 8000"
echo ""
echo "========================================"
echo "  Access Points:"
echo "========================================"
echo "   - Frontend: http://localhost:3000"
echo "   - Web API:  http://localhost:4000"
echo "   - AI API:   http://localhost:8000"
echo ""
