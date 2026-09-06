-- Track when tenant (and platform) users last signed in and last used the app.
ALTER TABLE "User" ADD COLUMN "lastLoggedInAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
