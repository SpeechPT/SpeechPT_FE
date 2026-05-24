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

# ──────────────────────────────────────────────────────────────
# Cache busting: 빌드 시각 기반 ?v= 쿼리 자동 주입
#
# HTML 안의 ./js/*.js 와 ./css/*.css 참조는 물론,
# ES module 내부의 import "./*.js" 경로에도 ?v=VERSION 추가.
# 이로써 매 배포마다 모든 정적 파일이 새 URL이 되어 캐시 미스 보장.
# ──────────────────────────────────────────────────────────────
VERSION=$(date +%Y%m%d%H%M%S)
echo "▶ Cache-busting version: $VERSION"

# (1) HTML 안의 ./js/*.js, ./css/*.css 참조
for html in *.html; do
  [ -f "$html" ] || continue
  sed -i '' -E "s|(\\./js/[^\"'?[:space:]]+\\.js)(\\?v=[^\"']*)?|\\1?v=$VERSION|g" "$html"
  sed -i '' -E "s|(\\./css/[^\"'?[:space:]]+\\.css)(\\?v=[^\"']*)?|\\1?v=$VERSION|g" "$html"
done

# (2) JS 모듈 내부 import 경로
# from "./foo.js" 또는 from "./foo.js?v=oldver" → from "./foo.js?v=VERSION"
for js in js/*.js; do
  [ -f "$js" ] || continue
  sed -i '' -E "s|(from[[:space:]]+['\"]\\./[^\"'?[:space:]]+\\.js)(\\?v=[^\"']*)?(['\"])|\\1?v=$VERSION\\3|g" "$js"
done

echo "  ✓ Cache busting 적용 완료"

# ──────────────────────────────────────────────────────────────
# S3 업로드 — 파일 유형별 캐시 정책 분리
# ──────────────────────────────────────────────────────────────
# 1) HTML: 항상 fresh (no-cache)
#    → entry point가 fresh여야 새 ?v= 쿼리가 사용자에게 즉시 전달됨
echo "▶ Upload HTML (no-cache)"
aws s3 sync . s3://$BUCKET/ --delete \
  --exclude "*" \
  --include "*.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html; charset=utf-8"

# 2) JS/CSS/이미지/기타: 1년 캐시 (immutable)
#    → ?v= 쿼리로 버전 관리하니 파일 자체는 안전하게 길게 캐시
echo "▶ Upload assets (max-age=1y)"
aws s3 sync . s3://$BUCKET/ --delete \
  --exclude "*.DS_Store" \
  --exclude "*.html" \
  --cache-control "public, max-age=31536000, immutable"

echo ""
echo "✓ 배포 완료 (v$VERSION)"
echo "  URL: http://$BUCKET.s3-website.ap-northeast-2.amazonaws.com"
echo "  → 사용자는 HTML 새로 받자마자 모든 JS/CSS 새 버전 자동 로드"
