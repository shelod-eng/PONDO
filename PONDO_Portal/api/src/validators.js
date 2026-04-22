import { z } from "zod";

export const paymentMethods = ["card", "eft", "pos", "speedpoint", "bnpl", "loyalty"];
export const gateways = ["peach", "payfast", "ozow", "payflex", "speedpoint"];

export const initiateSchema = z.object({
  customerId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().min(3).max(3).default("ZAR"),
  paymentMethod: z.enum(paymentMethods),
  gateway: z.enum(gateways).optional(),
});

export const creditVetSchema = z.object({
  consent: z.boolean(),
  bureau: z.enum(["transunion", "experian"]).optional().default("transunion"),
});

export const paySchema = z.object({
  method: z.enum(paymentMethods),
});

