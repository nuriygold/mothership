export type UiWatchdogRoute = {
  name: string;
  path: string;
  expectedText: string[];
  safeSelectors?: string[];
  allowRedirectTo?: string[];
  ignoreRequestFailures?: string[];
  ignoreHttpFailures?: string[];
  ignoreConsolePatterns?: string[];
  failOnConsolePatterns?: string[];
  expectedStatus?: number[];
  requireNav?: boolean;
  authOptional?: boolean;
  expectedTitle?: string[];
  expectedSelectors?: string[];
  authExpectedPaths?: string[];
};

export const uiWatchdogRoutes: UiWatchdogRoute[] = [
  { name: 'Home', path: '/', expectedText: ['Mothership'], ignoreHttpFailures: ['/api/v2/stream/notifications'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Dashboard', path: '/dashboard', expectedText: ['Today'], allowRedirectTo: ['/today'], ignoreHttpFailures: ['/api/v2/stream/notifications'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Today', path: '/today', expectedText: ['Today'], ignoreHttpFailures: ['/api/v2/stream/notifications'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Dispatch', path: '/dispatch', expectedText: ['Dispatch'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Ops', path: '/ops', expectedText: ['Ops'], safeSelectors: ['button', 'main'], requireNav: true, authOptional: true, authExpectedPaths: ['/login'], ignoreHttpFailures: ['/api/ops/', '/api/v2/auth/me'], ignoreConsolePatterns: ['401 (Unauthorized)', '404 (Not Found)'] },
  { name: 'Tasks', path: '/tasks', expectedText: ['Tasks'], expectedSelectors: ['main'], requireNav: true, ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Bots', path: '/bots', expectedText: ['Bots'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Email', path: '/email', expectedText: ['Email'], expectedSelectors: ['main'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Telegram', path: '/telegram', expectedText: ['Telegram'], expectedSelectors: ['main'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Finance', path: '/finance', expectedText: ['NET WORTH', 'ACCOUNTS', 'TRANSACTIONS'], expectedSelectors: ['main'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Streams', path: '/revenue-streams', expectedText: ['Stream'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Activity', path: '/activity', expectedText: ['Activity'], safeSelectors: ['main'], expectedSelectors: ['main'], requireNav: true, ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Vision', path: '/vision', expectedText: ['Vision'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Projects', path: '/projects', expectedText: ['Projects'], expectedSelectors: ['main'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Watchdog', path: '/watchdog', expectedText: ['Mothership Watchdog', 'Mothership UI Route Findings'], safeSelectors: ['main'], expectedSelectors: ['main'], requireNav: true, authOptional: true, authExpectedPaths: ['/login'], ignoreHttpFailures: ['/api/ops/watchdog'], ignoreConsolePatterns: ['401 (Unauthorized)', '404 (Not Found)'] },
  { name: 'Runs', path: '/runs', expectedText: ['Runs'], expectedSelectors: ['main'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Command Center', path: '/command-center', expectedText: ['Dispatch'], allowRedirectTo: ['/dispatch'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Scorpion', path: '/scorpion', expectedText: ['Scorpion'], ignoreHttpFailures: ['https://mother.nuriy.com/v1/health'], ignoreRequestFailures: ['https://mother.nuriy.com/v1/health'], ignoreConsolePatterns: ['net::ERR_FAILED', 'CORS policy', '404 (Not Found)'] },
  { name: 'Trophies', path: '/trophy', expectedText: ['Trophies'], safeSelectors: ['main'], expectedSelectors: ['main'], ignoreConsolePatterns: ['404 (Not Found)'] },
  { name: 'Marco', path: '/marco', expectedText: ['Marco'], ignoreHttpFailures: ['https://marco.nuriy.com/login?next=/'], ignoreRequestFailures: ['ERR_BLOCKED_BY_RESPONSE'], ignoreConsolePatterns: ['frame-ancestors', '404 (Not Found)'] },
  { name: 'Claude', path: '/claude', expectedText: ['Claude'], authOptional: true, authExpectedPaths: ['/login'], ignoreHttpFailures: ['/api/v2/auth/me'], ignoreConsolePatterns: ['401 (Unauthorized)', '404 (Not Found)'] },
  { name: 'Hermes', path: '/hermes', expectedText: ['Hermes'], authOptional: true, authExpectedPaths: ['/login'], ignoreHttpFailures: ['/api/v2/auth/me'], ignoreConsolePatterns: ['401 (Unauthorized)', '404 (Not Found)'] },
  { name: 'Ruby', path: '/ruby', expectedText: ['Ruby'], authOptional: true, authExpectedPaths: ['/login'], ignoreHttpFailures: ['/api/v2/auth/me'], ignoreConsolePatterns: ['401 (Unauthorized)', '404 (Not Found)'] },
  { name: 'Marvin', path: '/marvin', expectedText: ['Marvin'], authOptional: true, authExpectedPaths: ['/login'], ignoreHttpFailures: ['/api/v2/auth/me'], ignoreConsolePatterns: ['401 (Unauthorized)', '404 (Not Found)'] },
  { name: 'Iceman', path: '/iceman', expectedText: ['Iceman'], authOptional: true, authExpectedPaths: ['/login'], ignoreHttpFailures: ['/api/v2/auth/me'], ignoreConsolePatterns: ['401 (Unauthorized)', '404 (Not Found)'] },
  { name: 'Login', path: '/login', expectedText: ['Passphrase', 'Login'], safeSelectors: ['form'], expectedSelectors: ['form', 'input'], requireNav: false },
];
