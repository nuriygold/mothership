export type UiWatchdogRoute = {
  name: string;
  path: string;
  expectedText: string[];
  safeSelectors?: string[];
};

export const uiWatchdogRoutes: UiWatchdogRoute[] = [
  { name: 'Home', path: '/', expectedText: ['Mothership'] },
  { name: 'Dashboard', path: '/dashboard', expectedText: ['Dashboard'] },
  { name: 'Today', path: '/today', expectedText: ['Today'] },
  { name: 'Dispatch', path: '/dispatch', expectedText: ['Dispatch'] },
  { name: 'Ops', path: '/ops', expectedText: ['Ops'] },
  { name: 'Tasks', path: '/tasks', expectedText: ['Task'] },
  { name: 'Bots', path: '/bots', expectedText: ['Bot'] },
  { name: 'Email', path: '/email', expectedText: ['Email'] },
  { name: 'Telegram', path: '/telegram', expectedText: ['Telegram'] },
  { name: 'Finance', path: '/finance', expectedText: ['Finance'] },
  { name: 'Streams', path: '/revenue-streams', expectedText: ['Stream'] },
  { name: 'Activity', path: '/activity', expectedText: ['Activity'] },
  { name: 'Vision', path: '/vision', expectedText: ['Vision'] },
  { name: 'Projects', path: '/projects', expectedText: ['Project'] },
  { name: 'Watchdog', path: '/watchdog', expectedText: ['Watchdog'] },
  { name: 'Runs', path: '/runs', expectedText: ['Run'] },
  { name: 'Command Center', path: '/command-center', expectedText: ['Command'] },
  { name: 'Scorpion', path: '/scorpion', expectedText: ['Scorpion'] },
  { name: 'Trophies', path: '/trophy', expectedText: ['Troph'] },
  { name: 'Marco', path: '/marco', expectedText: ['Marco'] },
  { name: 'Claude', path: '/claude', expectedText: ['Claude'] },
  { name: 'Hermes', path: '/hermes', expectedText: ['Hermes'] },
  { name: 'Ruby', path: '/ruby', expectedText: ['Ruby'] },
  { name: 'Marvin', path: '/marvin', expectedText: ['Marvin'] },
  { name: 'Iceman', path: '/iceman', expectedText: ['Iceman'] },
  { name: 'Login', path: '/login', expectedText: ['Login'] },
];
