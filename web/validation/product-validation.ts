import { z } from "zod";
import { productTypes, type ProductType } from "../lib/product-images";

const category = z.enum(["FRUIT", "PLANTAIN", "SMOOTHIE"]);
const option = z.strictObject({
  size: z.enum(["SMALL", "MEDIUM", "BIG"]),
  label: z.string().trim().min(1).max(100),
  detail: z.string().trim().max(500).default(""),
  price: z.number().int().positive().max(2_147_483_647),
  stock: z.number().int().min(0).max(2_147_483_647),
});
const options = z.array(option).min(1).max(3).refine(
  (values) => new Set(values.map((value) => value.size)).size === values.length,
  "Option sizes must be unique",
);
const fields = {
  newBatch: z.boolean().optional(),
  uploadId: z.uuid().nullable().optional(),
  submissionKey: z.uuid().optional(),
  productType: z.enum(Object.keys(productTypes) as [ProductType, ...ProductType[]]).nullable().optional(),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000),
  category,
  isAvailable: z.boolean(),
  options,
};

export const createProductSchema = z.strictObject({
  ...fields,
  description: fields.description.default(""),
  isAvailable: fields.isAvailable.default(true),
});
export const updateProductSchema = z.strictObject(fields).partial()
  .refine((value) => Object.keys(value).length > 0, "Supply at least one field");
export const productIdSchema = z.uuid();
export const productQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: category.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().min(1).max(4096).optional(),
  sort: z.enum(["newest", "price-asc", "price-desc", "name"]).optional(),
  fruitFilter: z.enum([
    "all", "grapes", "tangerine", "pineapple", "apple",
  ]).optional(),
});
export const productCursorSchema = z.strictObject({
  scope: z.string().max(1000),
  id: z.uuid(),
  value: z.union([
    z.string().max(200),
    z.number().finite(),
  ]),
});
