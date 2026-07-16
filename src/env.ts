import "dotenv/config";

export const DEFAULT_WEB_ADMIN_LOGIN = "Admin";
export const DEFAULT_WEB_ADMIN_PASSWORD = "123";

export const env = {
  port: Number(process.env.PORT ?? 8546),
  webAdminLogin: process.env.WEB_ADMIN_LOGIN || DEFAULT_WEB_ADMIN_LOGIN,
  webAdminPassword: process.env.WEB_ADMIN_PASSWORD || DEFAULT_WEB_ADMIN_PASSWORD,
};
