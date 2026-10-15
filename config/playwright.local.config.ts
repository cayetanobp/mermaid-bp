import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'../tests',testMatch:'local-mode.spec.ts',workers:1,timeout:45000,expect:{timeout:12000},use:{baseURL:'http://127.0.0.1:5191',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}},webServer:{cwd:fileURLToPath(new URL('..',import.meta.url)),command:'npm run dev -- --port 5191 --strictPort',url:'http://127.0.0.1:5191',reuseExistingServer:false},outputDir:'../test-results/local-mode'});
