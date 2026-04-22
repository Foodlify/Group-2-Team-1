# syntax=docker/dockerfile:1.7

# تحديد إصدار Node.js الذي سيتم استخدامه
ARG NODE_VERSION=25.8.1

# المرحلة الأساسية: إعداد صورة Node.js الأساسية
FROM node:${NODE_VERSION}-alpine AS base
# تعيين مجلد العمل داخل الحاوية إلى /app
WORKDIR /app
# تثبيت بعض الحزم الأساسية اللازمة لتشغيل التطبيق
RUN apk add --no-cache dumb-init libc6-compat openssl

# مرحلة تثبيت جميع الاعتمادات (بما فيها devDependencies)
FROM base AS deps
# نسخ ملفات التعريف الخاصة بالمشروع وملفات إعداد Prisma
COPY package.json package-lock.json prisma.config.ts ./
# نسخ مجلد prisma بكافة محتوياته
COPY prisma ./prisma
# تثبيت جميع الاعتمادات باستخدام npm ci
RUN npm ci

# مرحلة البناء: نسخ ملفات المشروع وبناء الكود
FROM deps AS build
# نسخ إعدادات TypeScript
COPY tsconfig.json ./
# نسخ مجلد src الذي يحتوي على كود المشروع
COPY src ./src
# بناء المشروع باستخدام TypeScript Compiler
RUN npx tsc

# مرحلة تثبيت اعتمادات الإنتاج فقط (بدون devDependencies)
FROM base AS prod-deps
# نسخ ملفات التعريف وملفات إعداد Prisma
COPY package.json package-lock.json prisma.config.ts ./
# نسخ مجلد prisma
COPY prisma ./prisma
# تثبيت اعتمادات الإنتاج فقط وتجاهل السكربتات
RUN npm ci --omit=dev --ignore-scripts

# مرحلة التشغيل النهائية
FROM base AS runtime
# تعيين متغير البيئة NODE_ENV إلى production
ENV NODE_ENV=production
# تعيين متغير البيئة PORT إلى 3000
ENV PORT=3000

# نسخ مجلد node_modules من مرحلة prod-deps
COPY --from=prod-deps /app/node_modules ./node_modules
# نسخ مجلد .prisma من مرحلة deps
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
# نسخ مجلد @prisma/client من مرحلة deps
COPY --from=deps /app/node_modules/@prisma/client ./node_modules/@prisma/client
# نسخ مجلد dist الناتج عن البناء
COPY --from=build /app/dist ./dist
# نسخ مجلد prisma مرة أخرى
COPY prisma ./prisma
# نسخ ملف package.json
COPY package.json ./

# إنشاء مستخدم جديد باسم app وتغيير ملكية مجلد /app له
RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app
# تشغيل الحاوية كمستخدم app
USER app

# فتح المنفذ 3000 داخل الحاوية
EXPOSE 3000

# تعيين نقطة الدخول إلى dumb-init
ENTRYPOINT ["dumb-init", "--"]
# الأمر الافتراضي لتشغيل التطبيق
CMD ["node", "dist/server.js"]
