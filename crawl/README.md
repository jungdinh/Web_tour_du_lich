# BestPrice crawler

This directory contains the complete pipeline for collecting BestPrice tour data and importing it into PostgreSQL.

## Files

- `1_get_categories.py`: collect tour categories into `categories.json`.
- `2_get_tours_from_category.py`: collect tour URLs into `tours.json`.
- `get_tour.py`: collect each tour's details into `details/`.
- `seed_from_bestprice_json.py`: normalize and upsert data from `details/` into PostgreSQL.
- `categories.json`, `tours.json`, `details/`: existing crawler output.

## Install

```powershell
cd crawl
python -m pip install -r requirements.txt
python -m playwright install chromium
```

Create `crawl/.env` with the database connection:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/tour_recommendation
```

## Run

Run each step from the project root:

```powershell
python crawl/1_get_categories.py
python crawl/2_get_tours_from_category.py
python crawl/get_tour.py
python crawl/seed_from_bestprice_json.py
```

Data flow:

```text
BestPrice categories -> tour URLs -> tour detail JSON -> PostgreSQL
```

The database import is idempotent because tours are upserted by `source_url`.
