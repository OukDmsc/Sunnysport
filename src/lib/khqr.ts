import QRCode from "qrcode";
import { CURRENCY, KHQR, TAG } from "ts-khqr";

const REQUIRED_KHQR_ENV = [
  "KHQR_BAKONG_ACCOUNT_ID",
  "KHQR_MERCHANT_ID",
  "KHQR_MERCHANT_NAME",
  "KHQR_MERCHANT_CITY",
  "KHQR_ACQUIRING_BANK",
  "KHQR_CURRENCY",
] as const;

export type KhqrCurrency = "USD" | "KHR";

export class KhqrConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KhqrConfigurationError";
  }
}

type KhqrMerchantConfig = {
  accountID: string;
  merchantID: string;
  merchantName: string;
  merchantCity: string;
  acquiringBank: string;
  currency: KhqrCurrency;
  expirationMinutes: number;
};

function readKhqrMerchantConfig(): KhqrMerchantConfig | null {
  const values = Object.fromEntries(
    REQUIRED_KHQR_ENV.map((key) => [key, process.env[key]?.trim() ?? ""]),
  ) as Record<(typeof REQUIRED_KHQR_ENV)[number], string>;
  const hasAnyMerchantConfig = REQUIRED_KHQR_ENV.some((key) => values[key].length > 0);

  if (!hasAnyMerchantConfig) return null;

  const missing = REQUIRED_KHQR_ENV.filter((key) => !values[key]);
  const expirationValue = process.env.KHQR_EXPIRY_MINUTES?.trim() || "60";
  const expirationMinutes = Number(expirationValue);
  const invalidExpiration = !Number.isInteger(expirationMinutes) || expirationMinutes < 1 || expirationMinutes > 1440;

  if (missing.length) {
    throw new KhqrConfigurationError(`Set ${missing.join(", ")}.`);
  }
  const currency = values.KHQR_CURRENCY;
  if (currency !== "USD" && currency !== "KHR") {
    throw new KhqrConfigurationError("KHQR_CURRENCY must be USD or KHR.");
  }
  if (invalidExpiration) {
    throw new KhqrConfigurationError("KHQR_EXPIRY_MINUTES must be a whole number from 1 to 1440.");
  }

  return {
    accountID: values.KHQR_BAKONG_ACCOUNT_ID,
    merchantID: values.KHQR_MERCHANT_ID,
    merchantName: values.KHQR_MERCHANT_NAME,
    merchantCity: values.KHQR_MERCHANT_CITY,
    acquiringBank: values.KHQR_ACQUIRING_BANK,
    currency,
    expirationMinutes,
  };
}

export function isDynamicKhqrConfigured() {
  try {
    return readKhqrMerchantConfig() !== null;
  } catch {
    return false;
  }
}

export function hasDynamicKhqrConfiguration() {
  return REQUIRED_KHQR_ENV.some((key) => Boolean(process.env[key]?.trim()));
}

export type BookingKhqr = {
  dataUrl: string;
  payload: string;
  currency: KhqrCurrency;
  amount: number;
  expiresAt: string;
};

export async function createBookingKhqr(input: {
  reference: string;
  amountCents: number;
  usdToKhrRate: number;
  now?: number;
}): Promise<BookingKhqr | null> {
  const config = readKhqrMerchantConfig();
  if (!config) return null;
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("KHQR payment amount must be a positive whole number of cents.");
  }
  if (!Number.isFinite(input.usdToKhrRate) || input.usdToKhrRate <= 0) {
    throw new Error("KHQR currency conversion rate is invalid.");
  }

  const amount = config.currency === "USD"
    ? Number((input.amountCents / 100).toFixed(2))
    : Math.round(input.amountCents / 100 * input.usdToKhrRate);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("KHQR payment amount is invalid.");
  }

  const expiresAt = (input.now ?? Date.now()) + config.expirationMinutes * 60_000;
  const generated = KHQR.generate({
    tag: TAG.MERCHANT,
    accountID: config.accountID,
    merchantID: config.merchantID,
    merchantName: config.merchantName,
    merchantCity: config.merchantCity,
    acquiringBank: config.acquiringBank,
    currency: CURRENCY[config.currency],
    amount,
    countryCode: "KH",
    expirationTimestamp: expiresAt,
    additionalData: { billNumber: input.reference },
  });
  const payload = generated.data?.qr;

  if (generated.status.code !== 0 || !payload || !KHQR.verify(payload).isValid) {
    throw new Error("The KHQR SDK could not generate a valid payment QR.");
  }

  const decoded = KHQR.parse(payload);
  if (
    decoded.status.code !== 0 ||
    Number(decoded.data?.transactionAmount) !== amount ||
    decoded.data?.billNumber !== input.reference
  ) {
    throw new Error("The generated KHQR did not contain the expected booking amount.");
  }

  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 300,
  });

  return {
    dataUrl,
    payload,
    currency: config.currency,
    amount,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}
