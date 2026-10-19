import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir:'tests/browser',fullyParallel:false,workers:1,timeout:120000,
  expect:{timeout:10000},reporter:'list',
  use:{baseURL:'http://127.0.0.1:3100',viewport:{width:1440,height:1000},actionTimeout:15000,navigationTimeout:15000,trace:'retain-on-failure',screenshot:'only-on-failure',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)}},
  webServer:{command:'node --env-file-if-exists=.env tests/ui-server.js',url:'http://127.0.0.1:3100/api/health',reuseExistingServer:false,timeout:30000,gracefulShutdown:{signal:'SIGTERM',timeout:20000}}
});
