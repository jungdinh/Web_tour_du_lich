# Synthetic Tour Recommendation Dataset

Bộ dữ liệu này được sinh để khớp schema database của dự án và dùng train model gợi ý tour trên Google Colab khi DB thật còn thiếu dữ liệu.

## File CSV

- `tours.csv`: khớp bảng `tours`, gồm cả các field mở rộng từ migration `003`.
- `tour_tags.csv`: khớp bảng `tour_tags`, trọng số tag 0-1.
- `reviews.csv`: khớp bảng `reviews`.
- `users.csv`: khớp bảng `users` với password hash giả.
- `user_preferences.csv`: khớp bảng `user_preferences`.
- `user_actions.csv`: khớp bảng `user_actions` gồm `view`, `click`, `save`, `search`.
- `favorites.csv`: khớp bảng `favorites`.
- `chat_sessions.csv`, `chat_messages.csv`: dữ liệu chat mẫu.
- `training_interactions.csv`: file chính để train ML recommender/ranker.

## File Train Chính

`training_interactions.csv` có mỗi dòng là một cặp `user_id - tour_id`.

Feature chính:

- `tag_similarity`: cosine similarity giữa preference vector user và tag vector tour.
- `destination_match`: tour có nằm trong điểm đến user thích không.
- `price_match`: giá tour có trong ngân sách không.
- `duration_match`: thời lượng có khớp không.
- `price`, `duration`, `avg_rating`, `review_count`.
- `budget_max`, `preferred_duration`.

Target:

- `label`: 1 nếu user có khả năng thích/tương tác tích cực, 0 nếu không.
- `target_score`: score synthetic liên tục, dùng để phân tích hoặc regression nếu muốn.

## Cách Sinh Lại Dataset

Từ root project:

```powershell
python scripts\generate_synthetic_tour_dataset.py
```

Output nằm tại:

```text
datasets/synthetic_tour_recommendation/
```

## Cách Dùng Trên Google Colab

1. Zip folder `datasets/synthetic_tour_recommendation`.
2. Upload lên Colab hoặc Google Drive.
3. Mở notebook:

```text
notebooks/tour_recommender_training_colab.ipynb
```

4. Train model từ `training_interactions.csv`.
5. Export model:

```text
tour_recommender_model.pkl
```

## Gợi Ý Model

Nên bắt đầu với:

```text
RandomForestClassifier
```

Sau đó nếu muốn mạnh hơn thì thử:

```text
XGBoostClassifier
LightGBMRanker
```

## Lưu Ý

Đây là synthetic dataset nên dùng để:

- chứng minh pipeline AI recommendation,
- train model demo ban đầu,
- kiểm thử inference/ranking,
- viết báo cáo về phương pháp.

Khi có dữ liệu thật, nên thay `training_interactions.csv` bằng dữ liệu user action/favorite thật từ database.
