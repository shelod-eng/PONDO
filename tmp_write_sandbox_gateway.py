from pathlib import Path
from textwrap import dedent
root = Path(r"C:\Users\mpeta\Desktop\eVoucher_2026\eVoucher_Website_Development2026\evoucher_website_2026")
files = {
    root / 'src/server/services/payment/sandbox-gateway.ts': dedent('''
        import crypto from 'crypto';
        import type { SupabaseClient } from '@supabase/supabase-js';
        import { NextResponse } from 'next/server';
        import { createAdminClient } from '@/lib/supabase/admin';
        import { calculateDiscountPricing, DEFAULT_TOTAL_DISCOUNT_PCT } from '@/lib/pricing';
        import { formatBankServBatch, serialiseBatchToFlatFile } from '@/lib/billing/bankserv-formatter';
        import { ensureCompletedPurchaseArtifacts } from '@/server/services/billing/purchase-completion';
        import { DefaultVoucherService } from '@/server/services/voucher/default-voucher-service';
        import { generateSecureVoucherCode, generateTransactionReference, sha256 } from '@/server/utils/security';
        import { recordWalletCredit } from '@/server/services/wallet/ledger';
        import { writeAuditEvent } from '@/server/utils/audit';

        export const SANDBOX_ALLOWED_ORIGIN = 'https://www.evoucher.co.za';
        export const SANDBOX_BASE_URL = 'https://sandbox-gw.evoucher.co.za/v1';
        export const SANDBOX_WEBHOOK_CALLBACK = 'https://www.evoucher.co.za/api/payment-callback';
        export const SANDBOX_SPONSOR_ACCOUNT = '620-001-2345';
        export const SANDBOX_SETTLEMENT_CURRENCY = 'ZAR';
        const WALLET_SAVINGS_PCT = 2.5;
        const WALLET_PLATFORM_FEE_PCT = 2.5;

        export type SandboxPaymentMethod =
          | 'card_3ds'
          | 'debit_card'
          | 'eft'
          | 'payfast'
          | 'evoucher_wallet'
          | 'ussd';

        type ResolvedCustomer = {
          id: string;
          email: string | null;
        };

        type ResolvedMerchant = {
          id: string;
          business_name: string;
          parent_brand: string | null;
          default_total_discount_pct: number | null;
          branch_code: string | null;
        };

        type SandboxTransactionRow = {
          customer_id: string;
          merchant_id: string | null;
          product_id: string | null;
          amount: number;
          face_value: number | null;
          total_discount_pct: number | null;
          consumer_benefit_pct: number | null;
          evoucher_benefit_pct: number | null;
          total_discount_amount: number | null;
          consumer_benefit_amount: number | null;
          evoucher_benefit_amount: number | null;
          consumer_price: number | null;
          merchant_receivable_after_total_discount: number | null;
          merchant_receivable_after_evoucher_benefit: number | null;
          card_last_four: string;
          card_brand: string;
          payment_status: string;
          voucher_code: string | null;
          transaction_reference: string;
        };

        function round2(value: number) {
          return Number(Number(value || 0).toFixed(2));
        }

        function safeNumber(value: unknown, fallback = 0) {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        }

        function truthyString(value: unknown) {
          const text = String(value ?? '').trim();
          return text.length > 0 ? text : null;
        }

        export function getSandboxApiKey() {
          return String(
            process.env.SANDBOX_API_KEY ??
              process.env.EVOUCHER_SANDBOX_API_KEY ??
              process.env.BILLING_SANDBOX_API_KEY ??
              ''
          ).trim();
        }

        export function getAllowedSandboxOrigins() {
          const configured = String(process.env.SANDBOX_ALLOWED_ORIGINS ?? '').trim();
          const origins = new Set<string>();
          if (configured) {
            configured
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
              .forEach((entry) => origins.add(entry));
          }
          origins.add(SANDBOX_ALLOWED_ORIGIN);
          if (process.env.NODE_ENV !== 'production') {
            origins.add('http://localhost:3000');
            origins.add('http://localhost:4028');
          }
          return origins;
        }

        export function authorizeSandboxRequest(request: Request) {
          const expectedKey = getSandboxApiKey();
          if (!expectedKey) {
            return NextResponse.json(
              { error: 'Missing SANDBOX_API_KEY on server.' },
              { status: 500 }
            );
          }

          const authHeader = String(request.headers.get('authorization') ?? '').trim();
          const token = authHeader.toLowerCase().startsWith('bearer ')
            ? authHeader.slice(7).trim()
            : '';
          if (!token || token != expectedKey) {
            return NextResponse.json({ error: 'Unauthorized sandbox request.' }, { status: 401 });
          }

          const origin = truthyString(request.headers.get('origin'));
          if (origin) {
            const allowed = getAllowedSandboxOrigins();
            if (!allowed.has(origin)) {
              return NextResponse.json(
                { error: `Origin not allowed: ${origin}` },
                { status: 403 }
              );
            }
          }

          return null;
        }

        export function jsonSandbox(data: Record<string, unknown>, init?: ResponseInit) {
          const response = NextResponse.json(data, init);
          response.headers.set('Cache-Control', 'no-store, max-age=0');
          return response;
        }

        export function buildGatewayFee(faceValue: number, paymentMethod: SandboxPaymentMethod) {
          const rates: Record<SandboxPaymentMethod, number> = {
            card_3ds: 0.015,
            debit_card: 0.01,
            eft: 0,
            payfast: 0.02,
            evoucher_wallet: 0,
            ussd: 0,
          };
          return round2(faceValue * (rates[paymentMethod] ?? 0));
        }

        export function requiresOutOfBandAuthorization(paymentMethod: SandboxPaymentMethod) {
          return paymentMethod === 'card_3ds' || paymentMethod === 'payfast' || paymentMethod === 'ussd';
        }

        export function normalizeSandboxPaymentMethod(value: unknown): SandboxPaymentMethod {
          const raw = String(value ?? '').trim().toLowerCase();
          switch (raw) {
            case 'card_3ds':
            case 'visa_secure':
              return 'card_3ds';
            case 'debit_card':
            case 'debit_credit':
              return 'debit_card';
            case 'eft':
            case 'instant_eft':
              return 'eft';
            case 'payfast':
              return 'payfast';
            case 'evoucher_wallet':
            case 'wallet':
              return 'evoucher_wallet';
            case 'ussd':
              return 'ussd';
            default:
              raise Error('Unsupported sandbox payment method.')
          }
        }
