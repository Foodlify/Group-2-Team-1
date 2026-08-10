import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/shared/mail/mailer", () => ({
  mailer: {
    sendOrderConfirmation: vi.fn(),
    sendOrderStatusUpdate: vi.fn(),
  },
}));

vi.mock("../../src/modules/customer/customer.repository", () => ({
  customerRepository: {
    findContactById: vi.fn(),
  },
}));

import { notificationService } from "../../src/modules/notification/notification.service";
import { customerRepository } from "../../src/modules/customer/customer.repository";
import { mailer } from "../../src/shared/mail/mailer";

const mockedCustomers = vi.mocked(customerRepository);
const mockedMailer = vi.mocked(mailer);

const contact = { user: { name: "Jane", email: "jane@example.com" } };

const order = {
  id: "order_1",
  totalPrice: 90,
  items: [{ name: "Koshary", quantity: 2, price: 30 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedCustomers.findContactById.mockResolvedValue(contact as never);
});

describe("notifyOrderPlaced", () => {
  it("emails the confirmation to the ordering customer", async () => {
    await notificationService.notifyOrderPlaced("cust_1", order);

    expect(mockedCustomers.findContactById).toHaveBeenCalledWith("cust_1");
    expect(mockedMailer.sendOrderConfirmation).toHaveBeenCalledWith(
      "jane@example.com",
      {
        id: "order_1",
        customerName: "Jane",
        totalPrice: 90,
        items: order.items,
      },
    );
  });

  it("swallows a mailer failure so checkout still succeeds", async () => {
    mockedMailer.sendOrderConfirmation.mockRejectedValue(
      new Error("SMTP down"),
    );

    await expect(
      notificationService.notifyOrderPlaced("cust_1", order),
    ).resolves.toBeUndefined();
  });

  it("sends nothing when the customer can't be resolved", async () => {
    mockedCustomers.findContactById.mockResolvedValue(null);

    await notificationService.notifyOrderPlaced("gone", order);

    expect(mockedMailer.sendOrderConfirmation).not.toHaveBeenCalled();
  });
});

describe("notifyOrderStatusChanged", () => {
  it("emails the new status", async () => {
    await notificationService.notifyOrderStatusChanged(
      "cust_1",
      "order_1",
      "OUT_FOR_DELIVERY",
    );

    expect(mockedMailer.sendOrderStatusUpdate).toHaveBeenCalledWith(
      "jane@example.com",
      { id: "order_1", customerName: "Jane", status: "OUT_FOR_DELIVERY" },
    );
  });

  it("swallows a lookup failure so the status change still succeeds", async () => {
    mockedCustomers.findContactById.mockRejectedValue(new Error("db down"));

    await expect(
      notificationService.notifyOrderStatusChanged(
        "cust_1",
        "order_1",
        "CANCELLED",
      ),
    ).resolves.toBeUndefined();
  });
});
