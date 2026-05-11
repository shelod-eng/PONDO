# Admin Reporting Deployment Notes

This project now includes Vercel Cron routes for scheduled admin reporting:

- `/api/pondo/admin/reports/cron/daily`
- `/api/pondo/admin/reports/cron/weekly`
- `/api/pondo/admin/reports/cron/monthly`

## Vercel Cron schedules

The schedules are defined in `vercel.json` using UTC:

- `30 4 * * *`
  Daily report at `06:30 Africa/Johannesburg`
- `0 5 * * 1`
  Weekly report every Monday at `07:00 Africa/Johannesburg`
- `15 5 1 * *`
  Monthly report on the 1st day of each month at `07:15 Africa/Johannesburg`

## Required Vercel environment variables

- `DATABASE_URL`
  Or the `DB_*` variables already supported by the app.
- `JWT_SECRET`
- `CRON_SECRET`
  Vercel sends this automatically as a bearer token to Cron routes.
- `RESEND_API_KEY`
  Used to send the scheduled email reports.
- `RESEND_FROM_EMAIL`
  Example: `reports@pondo-pay.online`
- `ADMIN_REPORT_RECIPIENTS`
  Comma-separated recipients. Default fallback is `admin@pondo-pay.online`.
- `PONDO_ADMIN_BASE_URL`
  Example: `https://your-production-domain.vercel.app`

## Email behavior

Each scheduled report:

- pulls live dashboard metrics from the `pondo_core` data model
- attaches the relevant SQL report pack files from `api/db/admin_reports`
- sends the report email to `ADMIN_REPORT_RECIPIENTS`

## Recommended next step

After deployment, manually test:

1. Set the Vercel environment variables.
2. Open one Cron route manually with the correct bearer token.
3. Confirm the email arrives at `admin@pondo-pay.online`.
4. Confirm the attached SQL files match the intended cadence.
