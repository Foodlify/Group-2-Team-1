/**
 * The mailer.
 *
 * Every branch here decides whether a customer hears from us at all, and the
 * expensive failure is the silent one. Two rules this file exists to hold:
 *
 * 1. Not configured must never look like sent. In dev that means logging
 *    instead of sending; in production it means refusing outright, because a
 *    swallowed verification code locks the account out with no error anywhere.
 * 2. A transport that is configured but unreachable is operational, not a bug.
 *    It used to escape as a bare 500 with the reason visible only in the logs.
 *
 * The transporter is built in the constructor from `env`, so each case has to
 * re-import the module with its own environment.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Load a fresh mailer against the given environment. */
const loadMailer = async (envOverrides: Record<string, unknown>) => {
  vi.resetModules();
  vi.doMock("nodemailer", () => ({ default: { createTransport } }));
  vi.doMock("../../src/config/logger", () => ({ default: log }));
  vi.doMock("../../src/config/env", () => ({
    default: { NODE_ENV: "development", SMTP_PORT: 587, ...envOverrides },
  }));
  return (await import("../../src/shared/mail/mailer")).mailer;
};

const configured = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: 587,
  SMTP_USER: "bot@example.com",
  SMTP_PASS: "secret",
};

beforeEach(() => {
  vi.clearAllMocks();
  sendMail.mockResolvedValue({
    accepted: ["someone@example.com"],
    rejected: [],
    response: "250 OK",
    messageId: "<abc@example.com>",
  });
});

// ═══════════════════════════════════════════════════════════
describe("when SMTP is not configured", () => {
  it("logs the message instead of sending it in development", async () => {
    const mailer = await loadMailer({ NODE_ENV: "development" });

    await mailer.send("jane@example.com", "Subject", "Body");

    // The OTP flow has to stay usable without credentials, and the code has to
    // be readable somewhere — otherwise nobody can register locally at all.
    expect(sendMail).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining("not configured"),
      expect.objectContaining({ to: "jane@example.com", text: "Body" }),
    );
  });

  it("refuses to send in production rather than swallowing the message", async () => {
    const mailer = await loadMailer({ NODE_ENV: "production" });

    await expect(
      mailer.send("jane@example.com", "Subject", "Body"),
    ).rejects.toMatchObject({ statusCode: 503 });

    // Logging a verification code to a production log file and reporting
    // success is the worst of both: the customer waits for an email that was
    // never sent, and the code sits in plaintext where it does not belong.
    expect(log.info).not.toHaveBeenCalled();
  });

  it("reports itself as unconfigured", async () => {
    const mailer = await loadMailer({});
    expect(mailer.isConfigured).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
describe("when SMTP is configured", () => {
  it("builds the transport from the environment", async () => {
    await loadMailer(configured);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        auth: { user: "bot@example.com", pass: "secret" },
      }),
    );
  });

  it("uses implicit TLS on 465 and STARTTLS elsewhere", async () => {
    await loadMailer({ ...configured, SMTP_PORT: 465 });
    expect(createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ secure: true }),
    );

    await loadMailer({ ...configured, SMTP_PORT: 587 });
    expect(createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ secure: false }),
    );
  });

  it("omits auth entirely when there are no credentials", async () => {
    await loadMailer({ SMTP_HOST: "smtp.example.com", SMTP_PORT: 25 });

    // Passing `{user: undefined}` makes nodemailer attempt authentication and
    // fail; an open relay on 25 needs no auth object at all.
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined }),
    );
  });

  it("sends from MAIL_FROM when set", async () => {
    const mailer = await loadMailer({
      ...configured,
      MAIL_FROM: "orders@example.com",
    });

    await mailer.send("jane@example.com", "Subject", "Body");

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "orders@example.com",
        to: "jane@example.com",
        subject: "Subject",
        text: "Body",
      }),
    );
  });

  it("falls back to the SMTP user as the sender", async () => {
    const mailer = await loadMailer(configured);

    await mailer.send("jane@example.com", "Subject", "Body");

    // An empty From is rejected by most providers, so the fallback is what
    // makes MAIL_FROM genuinely optional.
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "bot@example.com" }),
    );
  });
});

// ═══════════════════════════════════════════════════════════
describe("when the mail server will not take the message", () => {
  it("turns a transport failure into a 503, not a 500", async () => {
    const mailer = await loadMailer(configured);
    sendMail.mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(
      mailer.send("jane@example.com", "Subject", "Body"),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("logs the underlying reason, not an empty object", async () => {
    const mailer = await loadMailer(configured);
    sendMail.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:9"));

    await mailer.send("jane@example.com", "S", "B").catch(() => undefined);

    // `logger.error("...", { error })` serialises a plain Error to `{}` — the
    // one line that explains the outage would carry no reason at all.
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        message: "connect ECONNREFUSED 127.0.0.1:9",
      }),
    );
  });

  it("warns when a recipient is rejected but the send still resolves", async () => {
    const mailer = await loadMailer(configured);
    sendMail.mockResolvedValue({
      accepted: ["ok@example.com"],
      rejected: ["nope@example.com"],
      response: "250 OK",
      messageId: "<abc@example.com>",
    });

    await mailer.send("nope@example.com", "Subject", "Body");

    // nodemailer resolves as long as *some* recipient was accepted, so without
    // this a rejected address is indistinguishable from a delivered one.
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("rejected"),
      expect.objectContaining({ rejected: ["nope@example.com"] }),
    );
  });

  it("records the provider's message id on success", async () => {
    const mailer = await loadMailer(configured);

    await mailer.send("jane@example.com", "Subject", "Body");

    // Acceptance is not delivery: a provider can answer 250 and still discard
    // the message. This id is the only handle for tracing a complaint back to
    // a specific send, and the last thing the application knows about it.
    expect(log.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ messageId: "<abc@example.com>" }),
    );
  });
});

// ═══════════════════════════════════════════════════════════
describe("the messages themselves", () => {
  it("puts the code, its purpose and its lifetime in the OTP email", async () => {
    const mailer = await loadMailer(configured);

    await mailer.sendOtp("jane@example.com", "123456", "password_reset", 10);

    const [{ subject, text }] = sendMail.mock.calls[0]!;
    expect(subject).toContain("verification code");
    expect(text).toContain("123456");
    expect(text).toContain("password reset");
    expect(text).toContain("10 minutes");
  });

  it("itemises the order confirmation and states the total", async () => {
    const mailer = await loadMailer(configured);

    await mailer.sendOrderConfirmation("jane@example.com", {
      id: "order_1",
      customerName: "Jane",
      totalPrice: 91,
      items: [{ name: "Koshary", quantity: 2, price: 45.5 }],
    });

    const [{ subject, text }] = sendMail.mock.calls[0]!;
    expect(subject).toContain("order_1");
    expect(text).toContain("Jane");
    expect(text).toContain("2 x Koshary");
    expect(text).toContain("45.50");
    expect(text).toContain("91.00");
  });

  it("renders the status readably rather than as an enum", async () => {
    const mailer = await loadMailer(configured);

    await mailer.sendOrderStatusUpdate("jane@example.com", {
      id: "order_1",
      customerName: "Jane",
      status: "OUT_FOR_DELIVERY",
    });

    const [{ subject, text }] = sendMail.mock.calls[0]!;
    // `OUT_FOR_DELIVERY` in a customer-facing email reads as a leaked
    // internal, and it is the only part of this message that changes.
    expect(subject).toContain("out for delivery");
    expect(text).toContain("out for delivery");
    expect(text).not.toContain("OUT_FOR_DELIVERY");
  });
});
