# Fallback Model Training Runbook

This runbook turns production scenarios into trainable datasets and defines a repeatable path for improving fallback rationale quality.

## Goals

- Achieve high JSON schema compliance for rationale output
- Reduce ungrounded numeric statements
- Improve objective-sensitive tradeoff explanations

## Prerequisites

- `.env.local` with:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Node runtime available
- Historical scenarios stored in `design_scenarios`

## Step 1 - Export training rows

```bash
npm run ml:export
```

Output:
- `ml/data/raw_scenarios.jsonl`

If dataset is too small, first generate synthetic high-coverage training scenarios:

```bash
npm run ml:seed-scenarios -- 400
```

Then export again.

## Step 2 - Build SFT dataset

```bash
npm run ml:build-sft
```

Output:
- `ml/data/sft_rationale_dataset.jsonl`

Each record uses chat-message format for instruction tuning.

## Step 3 - Build preference pairs (for DPO)

```bash
npm run ml:build-prefs
```

Output:
- `ml/data/preference_pairs.jsonl`

## Step 4 - Baseline data quality eval

```bash
npm run ml:eval
```

Output:
- `ml/data/eval_report.json`

Use this as a baseline before and after model training.

## Step 5 - Train model (external trainer)

Use your preferred trainer (e.g. Hugging Face + PEFT QLoRA):
- SFT input: `ml/data/sft_rationale_dataset.jsonl`
- Optional DPO input: `ml/data/preference_pairs.jsonl`
- Target output schema: `ml/schemas/rationale.schema.json`

Minimum recommended validation set:
- 10-20% holdout from SFT dataset
- stratified by optimization priority

## Step 6 - Serve model and connect app

Deploy trained fallback model behind a local/internal API endpoint:

- Env var:
  - `LOCAL_REASONING_ENDPOINT=https://.../generate-rationale`

Expected response:

```json
{
  "rationale": {
    "pvReason": "...",
    "batteryReason": "...",
    "heatPumpReason": "...",
    "tradeoffSummary": "...",
    "assumptions": ["..."]
  }
}
```

If endpoint is unavailable or invalid, app automatically falls back to deterministic template.

## Acceptance thresholds

- Schema compliance: >= 99.5%
- Grounding score: >= 0.99
- Objective-sensitive phrasing pass rate: >= 95%
- P95 inference latency: <= 1.2s
