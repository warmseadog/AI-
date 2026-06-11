---
name: employee-review-flow
description: Use when designing or changing the human review workflow in this AI video workbench, including 审核中心, 全局审核, 分镜编辑, 文案详情, 通过并生成文案, 发布确认, failed jobs, and AI action loading states such as spinner buttons, disabled states, and pending labels.
---

# Employee Review Flow

Use this skill whenever UI behavior affects how an employee reviews AI-generated storyboards, videos, copy, or publish requests.

## Principles

- Default views should be readable. Editing belongs in a modal, drawer, or explicit edit state.
- The review center should show the global queue first, then the selected item detail.
- AI actions must visibly enter a pending state: spinner icon, disabled button, `aria-busy`, and a specific pending label.
- Details must remain inspectable after generation. Generated copy should open a detail view, not disappear into a single status label.
- Human approval is a workflow state, not just a button click.

## Review Surfaces

Keep these surfaces separate:

- Global queue: all pending video review, copy review, publish confirmation, and failed jobs.
- Storyboard review: readable timeline by default, explicit edit action for manual changes.
- Video review: preview, generation status, query result, failure reason if present.
- Copy review: platform cards plus clickable detail modal/drawer with editable fields.
- Publish review: final payload preview and confirmation before submission.

## AI Action Loading

For buttons that call AI or external providers:

- Set a task-scoped pending action before the async call starts.
- Disable only the relevant action group where possible.
- Show a compact spinner next to the button label.
- Use labels such as `生成中`, `查询中`, `文案生成中`, `发布中`.
- In mock mode, keep the spinner visible long enough to be perceived if the operation resolves instantly.
- Clear pending state in `finally`, including failed requests.

## MVP File Ownership

- Runtime UI: `mvp/app.js`
- UI styling: `mvp/styles.css`
- Pure data/prompt logic: `mvp/core.js`
- UI regression checks: `mvp/verify-app.js`
- Core data checks: `mvp/verify-core.js`

## Verification Checklist

- The review queue shows multiple global tasks.
- Storyboard is readable without editing controls crowding the page.
- Clicking edit opens a focused editor and persists changes to the task.
- Clicking generated copy opens detailed platform copy.
- AI buttons show spinner/pending state while work is in progress.
- Existing verification commands still pass.
