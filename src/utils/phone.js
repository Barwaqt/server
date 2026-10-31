import { z } from "zod";
export function normalizePhone(value) {
  let phone = value.trim().replace(/[\s()-]/g, "");
  if (/^03\d{9}$/.test(phone)) phone = "+92" + phone.slice(1);
  else if (/^00/.test(phone)) phone = "+" + phone.slice(2);
  else if (/^92\d{10}$/.test(phone)) phone = "+" + phone;
  return phone;
}
export const internationalPhone = z
  .string()
  .max(30)
  .transform(normalizePhone)
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{8,14}$/,
        "Enter a mobile number with its country code, e.g. +923001234567",
      ),
  );
