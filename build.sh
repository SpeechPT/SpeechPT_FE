#!/bin/bash
set -e
API_URL=${1:-http://13.209.232.151:8000}
BUCKET=${2:-speechpt-fe-prod}

# 임시 빌드 디렉토리
rm -rf /tmp/fe-build && mkdir -p /tmp/fe-build
cp -r . /tmp/fe-build/
cd /tmp/fe-build

# .git, build.sh 등 제외
rm -rf .git .gitignore .gitkeep build.sh

# API_BASE_URL 치환
sed -i '' "s|http://127.0.0.1:8000|$API_URL|g" js/auth.js

# S3 sync
aws s3 sync . s3://$BUCKET/ --delete \
  --exclude "*.DS_Store" \
  --cache-control "public, max-age=300"

echo "✓ 배포 완료: http://$BUCKET.s3-website.ap-northeast-2.amazonaws.com"