# /api/v1 — REST API

هر endpoint یک `route.ts` نازک است: احراز هویت ← اعتبارسنجی zod ← فراخوانی `service` ماژول ← DTO.
منطق کسب‌وکار و بررسی دسترسی داخل service است (tech-stack.md بخش ۳). قرارداد: `docs/04-architecture/api.md`.
