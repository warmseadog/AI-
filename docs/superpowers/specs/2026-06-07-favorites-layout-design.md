# Favorites Layout Design

## Decision

Use option B: a workbench-style create page with the main editing area on the left and generation settings on the right.

## Scope

- Rename the global `收藏库` surface to `我的收藏`.
- Replace the oversized create-page favorite picker with a compact `我的收藏` summary block.
- Add a small heart action beside `内容规划`, `视频预览`, and `分镜脚本`.
- Clicking an empty heart saves that section to favorites and renders the heart red on subsequent renders.
- Avoid duplicate favorites for the same source.

## Layout

- Create page: use a horizontal step strip above content instead of a left process rail.
- Main column: content planning, product image, optional product details, compact favorite summary.
- Right column: generation settings and submit action.
- Review page: keep current two-column review layout, but add heart actions in video and storyboard panel headers.

## Data

Favorites may carry a `sourceKey` field for section-derived favorites. Existing manual favorites continue to work without `sourceKey`.

## Verification

- App render tests assert the rename, compact favorite region, and heart actions.
- Core tests assert `sourceKey` is preserved when adding favorites.
