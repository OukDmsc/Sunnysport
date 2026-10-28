import { afterEach, describe, expect, it, vi } from "vitest";
import { CURRENCY, KHQR } from "ts-khqr";
import { createBookingKhqr, isDynamicKhqrConfigured } from "./khqr";

const merchantEnvironment = {
  KHQR_BAKONG_ACCOUNT_ID: "sunny@bank",
  KHQR_MERCHANT_ID: "SUNNY001",
  KHQR_MERCHANT_NAME: "Sunny Sport Club",
  KHQR_MERCHANT_CITY: "Phnom Penh",
  KHQR_ACQUIRING_BANK: "Example Bank",
  KHQR_CURRENCY: "USD",
  KHQR_EXPIRY_MINUTES: "30",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("booking KHQR generation", () => {
  it("generates a valid USD QR with the full adjusted amount and booking reference", async () => {
    vi.stubEnv("KHQR_BAKONG_ACCOUNT_ID", merchantEnvironment.KHQR_BAKONG_ACCOUNT_ID);
    vi.stubEnv("KHQR_MERCHANT_ID", merchantEnvironment.KHQR_MERCHANT_ID);
    vi.stubEnv("KHQR_MERCHANT_NAME", merchantEnvironment.KHQR_MERCHANT_NAME);
    vi.stubEnv("KHQR_MERCHANT_CITY", merchantEnvironment.KHQR_MERCHANT_CITY);
    vi.stubEnv("KHQR_ACQUIRING_BANK", merchantEnvironment.KHQR_ACQUIRING_BANK);
    vi.stubEnv("KHQR_CURRENCY", merchantEnvironment.KHQR_CURRENCY);
    vi.stubEnv("KHQR_EXPIRY_MINUTES", merchantEnvironment.KHQR_EXPIRY_MINUTES);

    const payment = await createBookingKhqr({
      reference: "SUNNY-123",
      amountCents: 4750,
      usdToKhrRate: 4100,
      now: 1_800_000_000_000,
    });

    expect(payment).toMatchObject({
      currency: "USD",
      amount: 47.5,
      expiresAt: new Date(1_800_001_800_000).toISOString(),
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
    });
    const qrPayload = KHQR.parse(payment!.payload);
    expect(qrPayload.status.code).toBe(0);
    expect(qrPayload.data?.transactionAmount).toBe("47.50");
    expect(qrPayload.data?.transactionCurrency).toBe(CURRENCY.USD);
    expect(qrPayload.data?.billNumber).toBe("SUNNY-123");
  });

  it("rounds the full amount to a whole riel when configured for KHR", async () => {
    for (const [key, value] of Object.entries({
      ...merchantEnvironment,
      KHQR_CURRENCY: "KHR",
    })) {
      vi.stubEnv(key, value);
    }

    const payment = await createBookingKhqr({
      reference: "SUNNY-124",
      amountCents: 4750,
      usdToKhrRate: 4100,
      now: 1_800_000_000_000,
    });

    expect(payment).toMatchObject({ currency: "KHR", amount: 194750 });
    const qrPayload = KHQR.parse(payment!.payload);
    expect(qrPayload.data?.transactionAmount).toBe("194750");
    expect(qrPayload.data?.transactionCurrency).toBe(CURRENCY.KHR);
  });

  it("leaves legacy QR delivery available when dynamic merchant config is absent", async () => {
    expect(isDynamicKhqrConfigured()).toBe(false);
    await expect(createBookingKhqr({
      reference: "SUNNY-125",
      amountCents: 1250,
      usdToKhrRate: 4100,
    })).resolves.toBeNull();
  });

  it("rejects partial merchant config without exposing configured values", async () => {
    vi.stubEnv("KHQR_BAKONG_ACCOUNT_ID", merchantEnvironment.KHQR_BAKONG_ACCOUNT_ID);

    await expect(createBookingKhqr({
      reference: "SUNNY-126",
      amountCents: 1250,
      usdToKhrRate: 4100,
    })).rejects.toThrow("Set KHQR_MERCHANT_ID");
    expect(isDynamicKhqrConfigured()).toBe(false);
  });
});
