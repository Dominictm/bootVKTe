import express, { Express, NextFunction, Request, Response } from "express";
import { env } from "../env";
import { writePanelCredentials } from "../env-store";
import { BotConfig, emptyBotConfig, readBotConfig, writeBotConfig } from "../config-store";
import { instructionsPage, settingsPage } from "./templates";

function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const login = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    if (login === env.webAdminLogin && password === env.webAdminPassword) {
      next();
      return;
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="Club Bot Admin"');
  res.status(401).send("Authentication required");
}

export function createWebServer(): Express {
  const app = express();
  app.use(basicAuth);
  app.use(express.urlencoded({ extended: false }));

  app.get("/", (req, res) => {
    const config = readBotConfig();
    res.type("html").send(
      settingsPage(config, {
        configSaved: req.query.saved === "1",
        credentialsSaved: req.query.credsSaved === "1",
        panelLogin: env.webAdminLogin,
      })
    );
  });

  app.post("/", (req, res) => {
    const defaults = emptyBotConfig();
    const next: BotConfig = {
      telegramBotToken: String(req.body.telegramBotToken ?? "").trim(),
      vkToken: String(req.body.vkToken ?? "").trim(),
      googleCalendarId: String(req.body.googleCalendarId ?? "").trim(),
      googleApplicationCredentials:
        String(req.body.googleApplicationCredentials ?? "").trim() ||
        defaults.googleApplicationCredentials,
      adminTelegramId: String(req.body.adminTelegramId ?? "").trim(),
      adminVkId: String(req.body.adminVkId ?? "").trim(),
    };
    writeBotConfig(next);
    res.redirect("/?saved=1");
  });

  app.post("/credentials", (req, res) => {
    const newLogin = String(req.body.panelLogin ?? "").trim() || env.webAdminLogin;
    const newPassword = String(req.body.panelPassword ?? "").trim() || env.webAdminPassword;
    writePanelCredentials(newLogin, newPassword);
    res.redirect("/?credsSaved=1");
  });

  app.get("/instructions", (_req, res) => {
    res.type("html").send(instructionsPage());
  });

  return app;
}
